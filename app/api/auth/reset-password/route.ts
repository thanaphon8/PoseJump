import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "../../../../lib/mongodb";

const MAX_TRIES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BAD = { error: "ข้อมูลไม่ถูกต้อง" };

// ตัวนับครั้งที่ลอง ใช้ _id เป็น string (เช่น "reset:ip:1.2.3.4")
type Attempt = { _id: string; count: number; resetAt: Date };
const attemptsOf = (db: Awaited<ReturnType<typeof getDb>>) =>
  db.collection<Attempt>("authAttempts");

// นับครั้งใน collection authAttempts คืน true ถ้าเกินโควต้า
async function limited(
  db: Awaited<ReturnType<typeof getDb>>,
  key: string
): Promise<boolean> {
  const col = attemptsOf(db);
  const now = new Date();
  const cur = await col.findOne({ _id: key });
  if (!cur || cur.resetAt < now) {
    await col.updateOne(
      { _id: key },
      { $set: { count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) } },
      { upsert: true }
    );
    return false;
  }
  await col.updateOne({ _id: key }, { $inc: { count: 1 } });
  return cur.count + 1 > MAX_TRIES;
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(BAD, { status: 400 });
    }

    const username =
      typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const employeeId =
      typeof body.employeeId === "string"
        ? body.employeeId.trim().toUpperCase()
        : "";
    const password = typeof body.password === "string" ? body.password : "";
    const companyId =
      typeof body.companyId === "number" &&
      Number.isInteger(body.companyId) &&
      body.companyId >= 0 &&
      body.companyId <= 999
        ? body.companyId
        : null;

    if (
      companyId === null ||
      !/^[a-z0-9_]{3,20}$/.test(username) ||
      !/^[A-Z0-9]{3,20}$/.test(employeeId)
    ) {
      return NextResponse.json(BAD, { status: 400 });
    }
    if (password.length < 6 || password.length > 72) {
      return NextResponse.json(
        { errors: { password: "รหัสผ่านต้องยาว 6-72 ตัวอักษร" } },
        { status: 400 }
      );
    }

    const db = await getDb();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // จำกัดทั้งต่อ IP และต่อ username (นับทุกครั้งที่ยิง ไม่ว่าถูกหรือผิด)
    const [byIp, byUser] = await Promise.all([
      limited(db, `reset:ip:${ip}`),
      limited(db, `reset:user:${username}`),
    ]);
    if (byIp || byUser) {
      return NextResponse.json(
        { error: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่" },
        { status: 429 }
      );
    }

    const u = await db
      .collection("users")
      .findOne({ username, companyId, employeeId });
    if (!u) return NextResponse.json(BAD, { status: 401 });

    const passwordHash = await bcrypt.hash(password, 10);
    await db
      .collection("users")
      .updateOne(
        { _id: u._id },
        { $set: { passwordHash, passwordChangedAt: new Date() } }
      );
    await attemptsOf(db).deleteOne({ _id: `reset:user:${username}` });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("reset-password failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}