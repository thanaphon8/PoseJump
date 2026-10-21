import { NextResponse, connection } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";
import { DEPARTMENTS } from "../../../components/departments";

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const TH_OFFSET = 7 * HOUR;
const TOP = 20; // จำนวนแผนกที่แสดง
const MEMBERS_PER_DEPT = 100; // จำกัดสมาชิกที่ส่งต่อแผนก (กัน response ใหญ่)

// สัปดาห์ = จันทร์ 00:00 → จันทร์ถัดไป 00:00 (เวลาไทย)
function weekRange(now = Date.now()) {
  const d = new Date(now + TH_OFFSET);
  const dow = (d.getUTCDay() + 6) % 7; // จันทร์ = 0
  const startLocal =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY;
  const weekStart = startLocal - TH_OFFSET;
  return { weekStart, resetAt: weekStart + 7 * DAY };
}

type Member = {
  name: string;
  username: string;
  avatarUrl: string | null;
  isMe: boolean;
};

// GET /api/leaderboard/departments → อันดับแผนกรายสัปดาห์ + สมาชิก (ไว้แสดงรูปซ้อน)
// คะแนนมาจาก collection "dept_jumps" (บันทึกโดย /api/sessions)
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

    const top = ranked.slice(0, TOP);

    // สมาชิกของแผนกที่แสดง (ใช้วาดรูปโปรไฟล์ซ้อน)
    const ids = top.map((d) => d.id);
    const users = ids.length
      ? await db
          .collection("users")
          .find(
            { departmentId: { $in: ids } },
            {
              projection: {
                display: 1,
                username: 1,
                nickname: 1,
                avatarUrl: 1,
                departmentId: 1,
              },
            }
          )
          .sort({ createdAt: 1 })
          .toArray()
      : [];

    const byDept = new Map<number, Member[]>();
    const countOf = new Map<number, number>();
    for (const u of users) {
      const dId = u.departmentId as number;
      countOf.set(dId, (countOf.get(dId) ?? 0) + 1);
      const list = byDept.get(dId) ?? [];
      if (list.length < MEMBERS_PER_DEPT) {
        list.push({
          name: u.nickname as string,
          username: (u.display ?? u.username) as string,
          avatarUrl: (u.avatarUrl as string) || null,
          isMe: !!me && u._id.equals(me.id),
        });
        byDept.set(dId, list);
      }
    }
    // ตัวเองขึ้นก่อน แล้วคนที่มีรูปโปรไฟล์ (ให้รูปซ้อนดูสวย) ที่เหลือตามเวลาสมัคร
    for (const list of byDept.values()) {
      list.sort(
        (a, b) =>
          Number(b.isMe) - Number(a.isMe) ||
          Number(!!b.avatarUrl) - Number(!!a.avatarUrl)
      );
    }

    const entries = top.map((d) => ({
      ...d,
      memberCount: countOf.get(d.id) ?? 0,
      members: byDept.get(d.id) ?? [],
    }));

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
      { entries, me: myInfo, count: ranked.length, weekStart, resetAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("dept leaderboard failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}