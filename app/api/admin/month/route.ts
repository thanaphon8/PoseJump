import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  DAY_MS,
  computeRange,
  dayStartOf,
  firstJumpTs,
  monthRange,
  validMonth,
  ymdOf,
  type OrgInfo,
} from "@/lib/admin-stats";

// GET /api/admin/month?month=YYYY-MM&scope=month|all
// scope=month (ค่าเริ่มต้น) = สรุปทั้งเดือนนั้น เวลาไทย
// scope=all = ตั้งแต่เริ่มกิจกรรม (รอบกระโดดแรก) ถึงวันนี้
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
      return NextResponse.json({
        scope,
        month,
        since: ymdOf(Date.now()),
        dayCount: 0,
        activeDays: 0,
        entries: [],
      });
    }
    start = dayStartOf(ymdOf(first));
    end = todayEnd;
  } else {
    const q = params.get("month");
    month = validMonth(q) ? q : ymdOf(Date.now()).slice(0, 7);
    ({ start, end } = monthRange(month));
  }

  const perDay = await computeRange(db, start, end);

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

  const entries = [...acc.entries()]
    .map(([userId, a]) => ({ userId, ...a }))
    .sort((a, b) => b.points - a.points || b.total - a.total)
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({
    scope,
    month,
    since: ymdOf(start),
    dayCount: perDay.length,
    activeDays,
    entries,
  });
}