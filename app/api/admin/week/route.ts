import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  DAY_MS,
  computeDay,
  mondayOf,
  validYmd,
  ymdOf,
  type OrgInfo,
} from "@/lib/admin-stats";

// GET /api/admin/week?date=YYYY-MM-DD
// date = วันไหนก็ได้ในสัปดาห์นั้น (จันทร์-อาทิตย์ เวลาไทย) ไม่ส่ง = สัปดาห์นี้
export async function GET(req: Request) {
  if (!(await isAdminSession()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("date");
  const monday = mondayOf(validYmd(q) ? q : ymdOf(Date.now()));
  const starts = Array.from({ length: 7 }, (_, i) => monday + i * DAY_MS);

  const db = await getDb();
  const perDay = await Promise.all(starts.map((s) => computeDay(db, s)));

  const acc = new Map<
    string,
    {
      name: string;
      username: string;
      avatarUrl: string | null;
      org: OrgInfo;
      points: number;
      total: number;
      rewardDays: number;
      perDay: number[];
    }
  >();
  perDay.forEach((list, di) => {
    for (const e of list) {
      // name / avatarUrl / org มากับแถวรายวันจาก computeDay อยู่แล้ว
      const a = acc.get(e.userId) ?? {
        name: e.name,
        username: e.username,
        avatarUrl: e.avatarUrl,
        org: e.org,
        points: 0,
        total: 0,
        rewardDays: 0,
        perDay: Array(7).fill(0),
      };
      a.points += e.points;
      a.total += e.total;
      if (e.points > 0) a.rewardDays += 1;
      a.perDay[di] = e.points;
      acc.set(e.userId, a);
    }
  });

  const entries = [...acc.entries()]
    .map(([userId, a]) => ({ userId, ...a }))
    .sort((a, b) => b.points - a.points || b.total - a.total)
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({
    start: ymdOf(monday),
    days: starts.map(ymdOf),
    entries,
  });
}