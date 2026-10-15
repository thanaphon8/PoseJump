import { NextResponse } from "next/server";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";

const unauthorized = () =>
  NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
const failed = () =>
  NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });

const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? Math.round(v)
    : null;

// ประวัติการกระโดด 300 รอบล่าสุด
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const docs = await db
      .collection("jumps")
      .find({ userId: user.id })
      .sort({ ts: -1 })
      .limit(300)
      .toArray();

    const sessions = docs.map((d) => ({
      id: d.ts as number,
      ts: d.ts as number,
      total: d.total as number,
      durationMs: d.durationMs as number,
      perMin: d.perMin as number,
      best: d.best as number,
      mode: d.mode as "time" | "count",
      kcal: d.kcal as number,
    }));
    return NextResponse.json({ sessions });
  } catch (e) {
    console.error("sessions GET failed", e);
    return failed();
  }
}

// บันทึกรอบใหม่
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();

    let b: Record<string, unknown>;
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const total = num(b.total, 1, 100000);
    const durationMs = num(b.durationMs, 1000, 86_400_000);
    const perMin = num(b.perMin, 0, 2000);
    const best = num(b.best, 0, 1000);
    const kcal = num(b.kcal, 0, 100000);
    const m = b.mode;
    const mode = m === "time" || m === "count" ? m : null;
    if (
      total === null ||
      durationMs === null ||
      perMin === null ||
      best === null ||
      kcal === null ||
      mode === null
    ) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const now = Date.now();
    let ts = typeof b.ts === "number" && Number.isFinite(b.ts) ? b.ts : now;
    if (Math.abs(now - ts) > 864e5) ts = now;

    const db = await getDb();
    await db.collection("jumps").insertOne({
      userId: user.id,
      ts,
      total,
      durationMs,
      perMin,
      best,
      mode,
      kcal,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("sessions POST failed", e);
    return failed();
  }
}

// ล้างประวัติทั้งหมดของผู้ใช้
export async function DELETE() {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();
    const db = await getDb();
    await db.collection("jumps").deleteMany({ userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("sessions DELETE failed", e);
    return failed();
  }
}