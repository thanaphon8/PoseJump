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

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();

    const db = await getDb();
    const d = await db.collection("settings").findOne({ userId: user.id });
    return NextResponse.json({
      settings: d
        ? {
            mode: d.mode,
            seconds: d.seconds,
            target: d.target,
            dailyGoal: d.dailyGoal,
            facing: d.facing,
            sound: d.sound,
          }
        : null,
    });
  } catch (e) {
    console.error("settings GET failed", e);
    return failed();
  }
}

export async function PUT(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();

    let b: Record<string, unknown>;
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const m = b.mode;
    const mode = m === "time" || m === "count" ? m : null;
    const f = b.facing;
    const facing = f === "user" || f === "environment" ? f : null;
    const seconds = num(b.seconds, 5, 3600);
    const target = num(b.target, 5, 10000);
    const dailyGoal = num(b.dailyGoal, 100, 20000);
    const sound = typeof b.sound === "boolean" ? b.sound : null;
    if (
      mode === null ||
      facing === null ||
      seconds === null ||
      target === null ||
      dailyGoal === null ||
      sound === null
    ) {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const db = await getDb();
    await db.collection("settings").updateOne(
      { userId: user.id },
      {
        $set: {
          mode,
          seconds,
          target,
          dailyGoal,
          facing,
          sound,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("settings PUT failed", e);
    return failed();
  }
}