import { NextResponse, connection } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";
import { DAY, getDayRanking } from "../../../../lib/leaderboard-top";

const NOTE_MAX = 60;
// เขียนโน๊ตได้เฉพาะคนบนแท่นยืน (อันดับ 1-3 ของวันเกมปัจจุบัน)
const PODIUM = 3;
// ต้องตรงกับ NoteStyle ใน NoteShared.tsx (กรอบ + อารมณ์) และ /api/departments/note
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
    db.collection("rank_notes").createIndex({ userId: 1 }, { unique: true }),
    db
      .collection("rank_notes")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((e) => {
    indexed = null;
    throw e;
  });
  return indexed;
}

// POST /api/leaderboard/note  { text, style }
// โพสต์หรือแก้ไขโน๊ตบนแท่นของตัวเอง ต้องอยู่อันดับ 1-3 ของวันนี้
// หมดอายุตอนรีเซ็ตอันดับถัดไป (06:00 น. เวลาไทย) ไม่ใช่ 24 ชม.
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

    // ตรวจอันดับด้วยตัวคำนวณเดียวกับตารางอันดับ (ตัดคนถูกแบน/บัญชีที่ไม่มีอยู่แล้ว)
    const { start, rows } = await getDayRanking(db);
    const myId = String(me.id);
    const idx = rows.findIndex((r) => String(r._id) === myId);
    if (idx < 0 || idx >= PODIUM) {
      return NextResponse.json(
        { error: "เขียนโน๊ตได้เฉพาะอันดับ 1-3 ของวันนี้" },
        { status: 403 }
      );
    }

    await ensureIndexes(db);

    const now = new Date();
    // รีเซ็ตรอบถัดไป = ต้นวันเกม + 1 วัน (06:00 น. เวลาไทย)
    const expiresAt = new Date(start + DAY);
    await db.collection("rank_notes").updateOne(
      { userId: new ObjectId(myId) },
      {
        $set: {
          text,
          style,
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
    console.error("rank note save failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}

// DELETE /api/leaderboard/note  ลบโน๊ตบนแท่นของตัวเอง
export async function DELETE() {
  await connection();
  try {
    const me = await currentUser();
    if (!me) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }
    const db = await getDb();
    await db
      .collection("rank_notes")
      .deleteOne({ userId: new ObjectId(String(me.id)) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("rank note delete failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}   