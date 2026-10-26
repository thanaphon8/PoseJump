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
// → สมาชิกกลุ่มเดียวกับผู้ใช้ที่ล็อกอิน + คะแนนรวมกลุ่มตั้งแต่วันแรก (allTotal)
// + ยอดสัปดาห์นี้ (weekTotal เก็บไว้เผื่อใช้) + โน๊ตสั้นของแต่ละคน (เฉพาะที่ยังไม่หมดอายุ 24 ชม.)
// สำนักงานใหญ่ = กลุ่มคือแผนก / หน้าร้าน = กลุ่มคือสาขา (1 สาขา = 1 กลุ่ม)
export async function GET() {
  await connection();
  try {
    const me = await currentUser();
    if (!me) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }

    // กลุ่ม = แผนก ถ้ามี ไม่งั้นใช้สาขา (id แผนก/สาขาไม่ซ้ำข้ามบริษัท)
    // กติกาเดียวกับอันดับแผนก/สาขา: ถ้ามีแผนกนับเป็นแผนกก่อน
    const byDept = me.departmentId != null;
    const byBranch = !byDept && me.branchId != null;
    if (!byDept && !byBranch) {
      return NextResponse.json(
        { members: [], weekTotal: 0, allTotal: 0 },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    // departmentId: null ตรงกับ null หรือไม่มีฟิลด์ (กันคนที่มีแผนกด้วยหลุดเข้ากลุ่มสาขา)
    const groupFilter = byDept
      ? { departmentId: me.departmentId }
      : { branchId: me.branchId, departmentId: null };

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
      // dept_jumps เก็บทั้ง departmentId และ branchId (ดู /api/sessions)
      // รวมครั้งกระโดดทุกแถวของกลุ่ม (allTotal) และเฉพาะสัปดาห์นี้ (weekTotal) ในรอบเดียว
      db
        .collection("dept_jumps")
        .aggregate<{ _id: null; allTotal: number; weekTotal: number }>([
          { $match: groupFilter },
          {
            $group: {
              _id: null,
              allTotal: { $sum: "$total" },
              weekTotal: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$ts", weekStart] },
                        { $lt: ["$ts", resetAt] },
                      ],
                    },
                    "$total",
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),
    ]);

    // โน๊ตของสมาชิกกลุ่มนี้ที่ยังไม่หมดอายุ
    // (TTL index ลบแถวเก่าให้เอง แต่ monitor ช้าได้ ~60 วินาที จึงกรอง expiresAt ซ้ำที่นี่)
    const noteDocs = await db
      .collection("dept_notes")
      .find(
        { userId: { $in: docs.map((d) => d._id) }, expiresAt: { $gt: new Date() } },
        { projection: { userId: 1, text: 1, style: 1, expiresAt: 1 } }
      )
      .toArray();
    const noteByUser = new Map(
      noteDocs.map((n) => [
        String(n.userId),
        {
          text: n.text as string,
          // โน๊ตเก่าที่ไม่มี style = กรอบธรรมดา
          style: (n.style as string) ?? "none",
          expiresAt: (n.expiresAt as Date).toISOString(),
        },
      ])
    );

    // ตัวเองขึ้นก่อน ที่เหลือเรียงตามเวลาสมัคร
    const members = docs
      .map((d) => ({
        name: d.nickname as string,
        username: (d.display ?? d.username) as string,
        avatarUrl: (d.avatarUrl as string) || null,
        isMe: d._id.equals(me.id),
        note: noteByUser.get(String(d._id)) ?? null,
      }))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe));

    return NextResponse.json(
      {
        members,
        allTotal: agg[0]?.allTotal ?? 0,
        weekTotal: agg[0]?.weekTotal ?? 0,
        weekStart,
        resetAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("department members failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}