import { NextResponse, connection } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";

const NOTE_MAX = 60;
const DAY = 24 * 3600e3;
// ต้องตรงกับ NoteStyle ใน DepartmentCard (กรอบ + อารมณ์)
const NOTE_STYLES = [
  // กรอบ
  "none",
  "fire",
  "ice",
  "gold",
  "neon",
  // อารมณ์
  "happy",
  "laugh",
  "love",
  "sad",
  "angry",
  "surprised",
] as const;
type NoteStyle = (typeof NOTE_STYLES)[number];

// สร้าง index ครั้งเดียวต่อ process
// - userId unique: 1 คน 1 โน๊ต (โพสต์ใหม่ทับของเก่า)
// - expiresAt TTL: Mongo ลบแถวหมดอายุให้เอง (monitor รันทุก ~60 วินาที)
let indexed: Promise<unknown> | null = null;
function ensureIndexes(db: Db) {
  indexed ??= Promise.all([
    db.collection("dept_notes").createIndex({ userId: 1 }, { unique: true }),
    db
      .collection("dept_notes")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((e) => {
    indexed = null;
    throw e;
  });
  return indexed;
}

// POST /api/departments/note  { text, style }
// โพสต์หรือแก้ไขโน๊ตของตัวเอง เริ่มนับ 24 ชม. ใหม่ทุกครั้ง
export async function POST(req: Request) {
  await connection();
  try {
    const me = await currentUser();
    if (!me) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }

    let body: { text?: unknown; style?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }
    const text = String(body.text ?? "").trim().slice(0, NOTE_MAX);
    if (!text) {
      return NextResponse.json({ error: "โน๊ตว่าง" }, { status: 400 });
    }
    // ค่าแปลก/ไม่ส่งมา = กรอบธรรมดา
    const style: NoteStyle = NOTE_STYLES.includes(body.style as NoteStyle)
      ? (body.style as NoteStyle)
      : "none";

    const db = await getDb();
    await ensureIndexes(db);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DAY);
    await db.collection("dept_notes").updateOne(
      { userId: new ObjectId(String(me.id)) },
      {
        $set: {
          text,
          style,
          departmentId: me.departmentId ?? null,
          branchId: me.branchId ?? null,
          createdAt: now,
          expiresAt,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      note: { text, style, expiresAt: expiresAt.toISOString() },
    });
  } catch (e) {
    console.error("note save failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}

// DELETE /api/departments/note  ลบโน๊ตของตัวเอง
export async function DELETE() {
  await connection();
  try {
    const me = await currentUser();
    if (!me) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }
    const db = await getDb();
    await db
      .collection("dept_notes")
      .deleteOne({ userId: new ObjectId(String(me.id)) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("note delete failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}