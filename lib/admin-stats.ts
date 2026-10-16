import { ObjectId, type Db } from "mongodb";

// ชื่อ collection ที่เก็บรอบกระโดด ดูจาก app/api/sessions/route.ts
// ห้ามใช้ "sessions" เพราะ lib/auth.ts ใช้เก็บเซสชันล็อกอิน
const JUMPS_COLLECTION = "jumps";

// เวลาไทย UTC+7 ไม่มี DST
export const DAY_MS = 864e5;
const TZ_MS = 7 * 3600e3;

// กติกา: 50 คนแรกที่ถึงเป้ารายวัน ได้ 100 point
export const POINT_QUOTA = 50;
export const POINT_REWARD = 100;
const DEFAULT_GOAL = 1500;

export const ymdOf = (t: number) =>
  new Date(t + TZ_MS).toISOString().slice(0, 10);

// เที่ยงคืนเวลาไทยของวัน YYYY-MM-DD เป็น epoch ms
export const dayStartOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - TZ_MS;
};

// วันจันทร์ของสัปดาห์ที่มีวันนั้น (เวลาไทย)
export const mondayOf = (ymd: string) => {
  const s = dayStartOf(ymd);
  const dow = new Date(s + TZ_MS).getUTCDay(); // 0 = อาทิตย์
  return s - ((dow + 6) % 7) * DAY_MS;
};

export const validYmd = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(dayStartOf(v));

export type DayEntry = {
  userId: string;
  name: string;
  username: string;
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
};

// userId อาจเก็บเป็น ObjectId หรือ string รองรับทั้งสองแบบ
const toId = (v: unknown) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

// ปรับตรงนี้ถ้าเป้าหมายรายวันเก็บที่อื่น
// ที่นี่สมมติ collection "settings" { userId, dailyGoal }
async function loadGoals(db: Db, ids: unknown[]) {
  const rows = await db
    .collection("settings")
    .find({ userId: { $in: [...ids, ...ids.map(String)] } })
    .toArray();
  return new Map(
    rows.map((r) => [String(r.userId), Number(r.dailyGoal) || DEFAULT_GOAL])
  );
}

// ผลของทุกคนในหนึ่งวัน เรียงตามยอดรวมมากไปน้อย
// goalRank = ลำดับเวลาที่ยอดสะสมของวันนั้นถึงเป้า (1 = ถึงก่อน)
export async function computeDay(db: Db, start: number): Promise<DayEntry[]> {
  const rows = await db
    .collection(JUMPS_COLLECTION)
    .find({ ts: { $gte: start, $lt: start + DAY_MS } })
    .sort({ ts: 1 })
    .toArray();
  if (rows.length === 0) return [];

  const ids = [
    ...new Map(rows.map((r) => [String(r.userId), r.userId])).values(),
  ];
  const [users, goals] = await Promise.all([
    db
      .collection("users")
      .find({ _id: { $in: ids.map(toId) as ObjectId[] } })
      .toArray(),
    loadGoals(db, ids),
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const acc = new Map<
    string,
    { total: number; rounds: number; goalAt: number | null }
  >();
  for (const r of rows) {
    const k = String(r.userId);
    const a = acc.get(k) ?? { total: 0, rounds: 0, goalAt: null };
    a.total += Number(r.total) || 0;
    a.rounds += 1;
    if (a.goalAt === null && a.total >= (goals.get(k) ?? DEFAULT_GOAL)) {
      a.goalAt = Number(r.ts);
    }
    acc.set(k, a);
  }

  const order = [...acc.entries()]
    .filter(([, a]) => a.goalAt !== null)
    .sort((a, b) => (a[1].goalAt as number) - (b[1].goalAt as number))
    .map(([k]) => k);
  const rankOf = new Map(order.map((k, i) => [k, i + 1]));

  return [...acc.entries()]
    .map(([k, a]) => {
      const u = userMap.get(k);
      const goalRank = rankOf.get(k) ?? null;
      return {
        userId: k,
        name: String(u?.nickname ?? u?.display ?? "?"),
        username: String(u?.username ?? ""),
        total: a.total,
        rounds: a.rounds,
        goal: goals.get(k) ?? DEFAULT_GOAL,
        goalRank,
        points: goalRank !== null && goalRank <= POINT_QUOTA ? POINT_REWARD : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}