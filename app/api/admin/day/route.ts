import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  POINT_QUOTA,
  POINT_REWARD,
  computeDay,
  dayStartOf,
  validYmd,
  ymdOf,
} from "@/lib/admin-stats";
import { computeDeptTotals } from "@/lib/admin-dept-totals";

// GET /api/admin/day?date=YYYY-MM-DD (ไม่ส่ง = วันนี้เวลาไทย)
export async function GET(req: Request) {
  if (!(await isAdminSession()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("date");
  const date = validYmd(q) ? q : ymdOf(Date.now());

  const db = await getDb();
  const [list, deptTotals] = await Promise.all([
    computeDay(db, dayStartOf(date)),
    computeDeptTotals(db),
  ]);
  const entries = list.map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({
    date,
    quota: POINT_QUOTA,
    reward: POINT_REWARD,
    reachedCount: entries.filter((e) => e.goalRank !== null).length,
    awardedCount: entries.filter((e) => e.points > 0).length,
    entries,
    // ยอดสะสมรายกลุ่ม (key "d:<id>" / "b:<id>") ตรงกับหน้าอันดับฝั่งผู้ใช้
    deptTotals,
  });
}