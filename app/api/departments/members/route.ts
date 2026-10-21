import { NextResponse, connection } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";

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

// GET /api/departments/members
// → สมาชิกแผนกเดียวกับผู้ใช้ที่ล็อกอิน + คะแนนรวมแผนกสัปดาห์นี้ (ครั้งกระโดด)
// ผู้ใช้ที่ไม่มีแผนก (บริษัทที่มีแต่สาขา) ใช้สมาชิกสาขาเดียวกันแทน
export async function GET() {
  await connection();
  try {
    const me = await currentUser();
    if (!me) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }

    // กลุ่ม = แผนก ถ้ามี ไม่งั้นใช้สาขา (id แผนก/สาขาไม่ซ้ำข้ามบริษัท)
    const byDept = me.departmentId != null;
    const byBranch = !byDept && me.branchId != null;
    if (!byDept && !byBranch) {
      return NextResponse.json(
        { members: [], weekTotal: 0 },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const groupFilter = byDept
      ? { departmentId: me.departmentId }
      : { branchId: me.branchId };

    const db = await getDb();
    const { weekStart, resetAt } = weekRange();

    const [docs, agg] = await Promise.all([
      db
        .collection("users")
        .find(groupFilter, {
          projection: {
            display: 1,
            username: 1,
            nickname: 1,
            avatarUrl: 1,
          },
        })
        .sort({ createdAt: 1 })
        .limit(500)
        .toArray(),
      // dept_jumps เก็บตาม departmentId เท่านั้น กลุ่มสาขายังไม่มียอดรวม (ได้ 0)
      byDept
        ? db
            .collection("dept_jumps")
            .aggregate<{ _id: null; total: number }>([
              {
                $match: {
                  departmentId: me.departmentId,
                  ts: { $gte: weekStart, $lt: resetAt },
                },
              },
              { $group: { _id: null, total: { $sum: "$total" } } },
            ])
            .toArray()
        : Promise.resolve([] as { _id: null; total: number }[]),
    ]);

    // ตัวเองขึ้นก่อน ที่เหลือเรียงตามเวลาสมัคร
    const members = docs
      .map((d) => ({
        name: d.nickname as string,
        username: (d.display ?? d.username) as string,
        avatarUrl: (d.avatarUrl as string) || null,
        isMe: d._id.equals(me.id),
      }))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe));

    return NextResponse.json(
      { members, weekTotal: agg[0]?.total ?? 0, weekStart, resetAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("department members failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}