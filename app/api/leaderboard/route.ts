import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";
import { getUserPoints } from "../../../lib/points";

// "วันนี้" นับตามเวลาไทย (UTC+7) อันดับจึงรีเซ็ตตอนเที่ยงคืนของไทย
const TZ_OFFSET = 7 * 3_600_000;
const DAY = 864e5;
const TOP = 100;
// ต้องตรงกับ DEFAULT_GOAL ใน /api/sessions
const DEFAULT_GOAL = 1500;

const toId = (v: ObjectId | string) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

type Row = { _id: ObjectId | string; total: number; rounds: number };
type UserDoc = { _id: ObjectId | string; nickname?: string };

export async function GET() {
  await connection();
  try {
    const now = Date.now();
    const start = Math.floor((now + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;
    // ต้องตรงกับ key ที่ /api/sessions ใช้บันทึก goal_hits (YYYY-MM-DD เวลาไทย)
    const dayStr = new Date(start + TZ_OFFSET).toISOString().slice(0, 10);

    const user = await currentUser();
    const myId = user ? String(user.id) : null;

    const db = await getDb();
    const rows = (await db
      .collection("jumps")
      .aggregate([
        { $match: { ts: { $gte: start, $lt: start + DAY } } },
        {
          $group: {
            _id: "$userId",
            total: { $sum: "$total" },
            rounds: { $sum: 1 },
            first: { $min: "$ts" },
          },
        },
        // แต้มเท่ากัน ใครถึงก่อนได้อันดับก่อน
        { $sort: { total: -1, first: 1 } },
      ])
      .toArray()) as Row[];

    const top = rows.slice(0, TOP);
    const users = await db
      .collection<UserDoc>("users")
      .find({ _id: { $in: top.map((r) => toId(r._id)) } })
      .toArray();
    const names = new Map(users.map((u) => [String(u._id), u.nickname as string]));

    // ลำดับที่ทำเป้าหมายรายวันสำเร็จของแต่ละคนในวันนี้ (1 = คนแรก)
    // userId ใน goal_hits ชนิดเดียวกับใน jumps (ใช้ user.id ตรงๆ เหมือนกัน)
    const hitIds: unknown[] = top.map((r) => r._id);
    const hits = await db
      .collection("goal_hits")
      .find({ day: dayStr, userId: { $in: hitIds } })
      .project({ userId: 1, seq: 1 })
      .toArray();
    const seqOf = new Map(hits.map((h) => [String(h.userId), h.seq as number]));

    // เป้าหมายรายวันของแต่ละคน ใช้วาดหลอดความคืบหน้า
    const sets = await db
      .collection("settings")
      .find({ userId: { $in: hitIds } })
      .project({ userId: 1, dailyGoal: 1 })
      .toArray();
    const goalOf = new Map(
      sets.map((s) => [String(s.userId), s.dailyGoal as number])
    );

    const entries = top.map((r, i) => {
      const goal = goalOf.get(String(r._id));
      return {
        rank: i + 1,
        name: names.get(String(r._id)) ?? "ไม่ระบุชื่อ",
        total: r.total,
        rounds: r.rounds,
        me: String(r._id) === myId,
        goalRank: seqOf.get(String(r._id)) ?? null,
        goal: typeof goal === "number" && goal > 0 ? goal : DEFAULT_GOAL,
      };
    });

    // point รวมของผู้ใช้ที่ล็อกอิน (เก็บใน users.points)
    const myPoints = user ? await getUserPoints(user.id) : 0;

    const idx = myId ? rows.findIndex((r) => String(r._id) === myId) : -1;
    const me =
      idx >= 0
        ? {
            rank: idx + 1,
            total: rows[idx].total,
            // ต้องโดดอีกกี่ครั้งถึงจะแซงคนอันดับถัดขึ้นไป
            gap: idx > 0 ? rows[idx - 1].total - rows[idx].total + 1 : 0,
            points: myPoints,
          }
        : null;

    return NextResponse.json(
      { entries, me, count: rows.length, resetAt: start + DAY },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("leaderboard GET failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}