import { NextResponse, connection } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";
import { DEPARTMENTS } from "../../../components/departments";

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const TH_OFFSET = 7 * HOUR;

// สัปดาห์ = จันทร์ 00:00 → จันทร์ถัดไป 00:00 (เวลาไทย)
function weekRange(now = Date.now()) {
  const d = new Date(now + TH_OFFSET);
  const dow = (d.getUTCDay() + 6) % 7; // จันทร์ = 0
  const startLocal =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY;
  const weekStart = startLocal - TH_OFFSET;
  return { weekStart, resetAt: weekStart + 7 * DAY };
}

// GET /api/leaderboard/departments → อันดับแผนกรายสัปดาห์
// ข้อมูลมาจาก collection "dept_jumps" (บันทึกโดย /api/sessions ตอนผู้ใช้ที่มีแผนกกระโดด)
export async function GET() {
  await connection();
  try {
    const me = await currentUser();
    const { weekStart, resetAt } = weekRange();
    const db = await getDb();

    const rows = await db
      .collection("dept_jumps")
      .aggregate<{ _id: number; total: number; users: unknown[] }>([
        { $match: { ts: { $gte: weekStart, $lt: resetAt } } },
        {
          $group: {
            _id: "$departmentId",
            total: { $sum: "$total" },
            users: { $addToSet: "$userId" },
          },
        },
      ])
      .toArray();

    const sum = new Map(
      rows.map((r) => [r._id, { total: r.total, active: r.users.length }])
    );

    const ranked = DEPARTMENTS.map((d) => ({
      id: d.id,
      name: d.th,
      en: d.en,
      total: sum.get(d.id)?.total ?? 0,
      active: sum.get(d.id)?.active ?? 0,
    }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total || a.id - b.id)
      .map((d, i) => ({ ...d, rank: i + 1, me: d.id === me?.departmentId }));

    const mine = ranked.find((d) => d.me);
    const myDept = me?.departmentId ?? null;
    const myInfo =
      myDept == null
        ? null
        : mine
          ? {
              rank: mine.rank,
              total: mine.total,
              gap:
                mine.rank === 1
                  ? 0
                  : ranked[mine.rank - 2].total - mine.total + 1,
            }
          : { rank: 0, total: 0, gap: 0 }; // แผนกตัวเองยังไม่มีคะแนน

    return NextResponse.json(
      {
        entries: ranked.slice(0, 20),
        me: myInfo,
        count: ranked.length,
        weekStart,
        resetAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("dept leaderboard failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}