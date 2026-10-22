import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";
import { addUserPoints, getUserPoints } from "../../../lib/points";

const unauthorized = () =>
  NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
const failed = () =>
  NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });

const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? Math.round(v)
    : null;

/* ------------------------------------------------------------------ */
/* ระบบ point                                                           */
/* ------------------------------------------------------------------ */

// 100 คนแรกของวัน (เวลาไทย) ที่ทำเป้าหมายรายวันสำเร็จ ได้ 50 point
const POINT_QUOTA = 100;
const POINT_REWARD = 50;
const DEFAULT_GOAL = 1500;
// เป้าขั้นต่ำที่นับ point (0 = ไม่จำกัด ใช้เป้าที่ผู้ใช้ตั้งเองตรงๆ)
// ถ้าอยากกันคนตั้งเป้าต่ำๆ ให้ตั้ง MIN_GOAL_FOR_POINTS ใน .env.local เช่น 1000
const MIN_GOAL_FOR_POINTS = Number(process.env.MIN_GOAL_FOR_POINTS ?? 0) || 0;

const TH_OFFSET = 7 * 3600_000; // ไทย UTC+7 ไม่มี DST

// ช่วงวันไทยของเวลา t [start, end) เป็น epoch ms
function thaiDay(t: number) {
  const start = Math.floor((t + TH_OFFSET) / 864e5) * 864e5 - TH_OFFSET;
  const key = new Date(start + TH_OFFSET).toISOString().slice(0, 10); // YYYY-MM-DD
  return { start, end: start + 864e5, key };
}

// สร้าง index ครั้งเดียวต่อโปรเซส
let indexReady: Promise<unknown> | null = null;
function ensureIndexes(db: Db) {
  if (!indexReady) {
    indexReady = Promise.all([
      // 1 คน 1 วัน ได้บันทึกถึงเป้าครั้งเดียว กัน point ซ้ำ
      db
        .collection("goal_hits")
        .createIndex({ userId: 1, day: 1 }, { unique: true }),
      // เรียงลำดับในวันเดียวกัน
      db.collection("goal_hits").createIndex({ day: 1, seq: 1 }),
      // คะแนนสะสมของแผนก (สำนักงานใหญ่) และสาขา (หน้าร้าน) ไม่รีเซ็ต
      // /api/leaderboard/departments รวมทุกแถว จึงทำ index ครอบฟิลด์ที่ใช้รวม
      db
        .collection("dept_jumps")
        .createIndex({ departmentId: 1, branchId: 1, userId: 1, total: 1 }),
    ]).catch((e) => {
      indexReady = null;
      console.error("ensureIndexes failed", e);
    });
  }
  return indexReady;
}

const isDup = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

// เช็กว่าวันนี้ผู้ใช้ถึงเป้าหรือยัง ถ้าถึงเป็นครั้งแรกของวัน จองลำดับและให้ point
async function settleDailyGoal(db: Db, userId: unknown, now: number) {
  const { start, end, key } = thaiDay(now);

  const already = await db.collection("goal_hits").findOne({ userId, day: key });
  if (already) return;

  // ยอดรวมวันนี้ (วันไทย) ของผู้ใช้
  const agg = await db
    .collection("jumps")
    .aggregate<{ total: number }>([
      { $match: { userId, ts: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ])
    .toArray();
  const todayTotal = agg[0]?.total ?? 0;

  // เป้าของผู้ใช้ (collection "settings" เก็บ dailyGoal ตามผู้ใช้)
  const s = await db.collection("settings").findOne({ userId });
  const goal = Math.max(
    MIN_GOAL_FOR_POINTS,
    typeof s?.dailyGoal === "number" ? s.dailyGoal : DEFAULT_GOAL
  );
  if (todayTotal < goal) return;

  // จองลำดับแบบ atomic: ใครมาก่อนได้เลขน้อยกว่า
  const res = await db
    .collection<{ _id: string; seq: number }>("goal_counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
  // รองรับทั้ง mongodb driver v5 (res.value) และ v6 (res เป็น doc ตรงๆ)
  const doc = (res && "value" in (res as object)
    ? (res as unknown as { value: { seq: number } | null }).value
    : res) as { seq: number } | null;
  const seq = doc?.seq ?? 1;
  const award = seq <= POINT_QUOTA ? POINT_REWARD : 0;

  try {
    await db.collection("goal_hits").insertOne({
      userId,
      day: key,
      seq,
      reachedAt: now,
      award,
    });
  } catch (e) {
    if (isDup(e)) return; // มี request อื่นบันทึกไปก่อนแล้ว ไม่ให้ซ้ำ
    throw e;
  }

  // point เก็บใน users.points
  if (award > 0) {
    await addUserPoints(userId, award);
  }
}

/* ------------------------------------------------------------------ */

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

// บันทึกรอบใหม่ + ตัดสิน point
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
    await ensureIndexes(db);

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

    // คะแนนกลุ่ม: เก็บแยก collection เพื่อไม่หายเมื่อผู้ใช้ล้างประวัติ
    // สะสมไปเรื่อยๆ ไม่รีเซ็ต (ห้ามมีโค้ดลบ dept_jumps รอบเก่า)
    // สำนักงานใหญ่ = นับเข้าแผนก / หน้าร้าน = นับเข้าสาขา (1 สาขา = 1 กลุ่ม)
    // ล้มเหลวไม่ทำให้การบันทึกรอบล้มเหลว
    const departmentId = user.departmentId ?? null;
    const branchId =
      (user as unknown as { branchId?: number | null }).branchId ?? null;
    if (departmentId != null || branchId != null) {
      try {
        await db.collection("dept_jumps").insertOne({
          userId: user.id,
          departmentId,
          branchId,
          ts,
          total,
        });
      } catch (e) {
        console.error("dept_jumps insert failed", e);
      }
    }

    // ให้ point ล้มเหลวไม่ทำให้การบันทึกรอบล้มเหลว
    try {
      await settleDailyGoal(db, user.id, now);
    } catch (e) {
      console.error("settleDailyGoal failed", e);
    }

    const points = await getUserPoints(user.id);
    return NextResponse.json({ ok: true, points }, { status: 201 });
  } catch (e) {
    console.error("sessions POST failed", e);
    return failed();
  }
}

// ล้างประวัติทั้งหมดของผู้ใช้ (ไม่ลบ point, บันทึกถึงเป้า และคะแนนแผนก/สาขา)
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