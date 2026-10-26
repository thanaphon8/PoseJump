import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  DAY_MS,
  avatarOf,
  computeRange,
  orgFromUser,
  dayStartOf,
  firstJumpTs,
  monthRange,
  validMonth,
  ymdOf,
  type OrgInfo,
} from "@/lib/admin-stats";
import { computeDeptTotals } from "@/lib/admin-dept-totals";

// GET /api/admin/month?month=YYYY-MM&scope=month|all
// scope=month (ค่าเริ่มต้น) = สรุปทั้งเดือนนั้น เวลาไทย
// scope=all = ตั้งแต่เริ่มกิจกรรม (รอบกระโดดแรก) ถึงวันนี้
//   + deptTotals = ยอดสะสมรายกลุ่ม (key "d:<id>" / "b:<id>") ใช้กับมุมมองแผนก
export async function GET(req: Request) {
  if (!(await isAdminSession()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") === "all" ? "all" : "month";
  const db = await getDb();

  let start: number;
  let end: number;
  let month = "";

  if (scope === "all") {
    const first = await firstJumpTs(db);
    const todayEnd = dayStartOf(ymdOf(Date.now())) + DAY_MS;
    if (first === null) {
      // ยังไม่มีรอบกระโดดเลย ช่วงว่าง แต่ยังต้องแสดงสมาชิกทุกคน
      start = dayStartOf(ymdOf(Date.now()));
      end = start;
    } else {
      start = dayStartOf(ymdOf(first));
      end = todayEnd;
    }
  } else {
    const q = params.get("month");
    month = validMonth(q) ? q : ymdOf(Date.now()).slice(0, 7);
    ({ start, end } = monthRange(month));
  }

  const [perDay, deptTotals] = await Promise.all([
    computeRange(db, start, end),
    scope === "all" ? computeDeptTotals(db) : Promise.resolve(undefined),
  ]);

  const acc = new Map<
    string,
    {
      name: string;
      username: string;
      avatarUrl: string | null;
      org: OrgInfo;
      points: number;
      total: number;
      rounds: number;
      rewardDays: number;
      activeDays: number;
      bestDay: number;
    }
  >();
  let activeDays = 0;

  for (const list of perDay) {
    if (list.length > 0) activeDays += 1;
    for (const e of list) {
      // name / avatarUrl / org มากับแถวรายวันจาก computeRange อยู่แล้ว
      const a = acc.get(e.userId) ?? {
        name: e.name,
        username: e.username,
        avatarUrl: e.avatarUrl,
        org: e.org,
        points: 0,
        total: 0,
        rounds: 0,
        rewardDays: 0,
        activeDays: 0,
        bestDay: 0,
      };
      a.points += e.points;
      a.total += e.total;
      a.rounds += e.rounds;
      if (e.points > 0) a.rewardDays += 1;
      if (e.total > 0) a.activeDays += 1;
      if (e.total > a.bestDay) a.bestDay = e.total;
      acc.set(e.userId, a);
    }
  }

  // เติมสมาชิกทุกคนที่มีบัญชี (login เข้ามาแล้ว) แม้ไม่มีรอบกระโดดในช่วงนี้
  const users = await db
    .collection("users")
    .find(
      {},
      {
        projection: {
          nickname: 1,
          display: 1,
          username: 1,
          avatarUrl: 1,
          companyId: 1,
          departmentId: 1,
          branchId: 1,
        },
      }
    )
    .toArray();
  for (const u of users) {
    const id = String(u._id);
    if (acc.has(id)) continue;
    acc.set(id, {
      name: String(u.nickname ?? u.display ?? "?"),
      username: String(u.username ?? ""),
      avatarUrl: avatarOf(u),
      org: orgFromUser(u),
      points: 0,
      total: 0,
      rounds: 0,
      rewardDays: 0,
      activeDays: 0,
      bestDay: 0,
    });
  }

  const entries = [...acc.entries()]
    .map(([userId, a]) => ({ userId, ...a }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.total - a.total ||
        a.name.localeCompare(b.name, "th")
    )
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({
    scope,
    month,
    since: ymdOf(start),
    dayCount: perDay.length,
    activeDays,
    entries,
    deptTotals,
  });
}