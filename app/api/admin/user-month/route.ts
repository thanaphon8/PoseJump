import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  DAY_MS,
  avatarOf,
  computeRange,
  monthRange,
  orgFromUser,
  validMonth,
  ymdOf,
} from "@/lib/admin-stats";

// GET /api/admin/user-month?userId=...&month=YYYY-MM
// ผลรายวันของผู้เล่นหนึ่งคนทั้งเดือน (เวลาไทย) + สังกัดตามที่เลือกตอนสมัคร
// days = เฉพาะวันที่มีรอบกระโดด, reached = goalRank !== null (ถึงเป้ารายวัน)
export async function GET(req: Request) {
  if (!(await isAdminSession()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const userId = params.get("userId") ?? "";
  const q = params.get("month");
  if (!userId)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  const month = validMonth(q) ? q : ymdOf(Date.now()).slice(0, 7);

  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ _id: (ObjectId.isValid(userId) ? new ObjectId(userId) : userId) as ObjectId });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { start, end } = monthRange(month);
  const perDay = await computeRange(db, start, end);

  const days: {
    date: string;
    total: number;
    rounds: number;
    goal: number;
    goalRank: number | null;
    points: number;
    reached: boolean;
  }[] = [];
  perDay.forEach((list, i) => {
    const e = list.find((x) => x.userId === userId);
    if (!e) return;
    days.push({
      date: ymdOf(start + i * DAY_MS),
      total: e.total,
      rounds: e.rounds,
      goal: e.goal,
      goalRank: e.goalRank,
      points: e.points,
      reached: e.goalRank !== null,
    });
  });

  return NextResponse.json({
    month,
    dayCount: perDay.length,
    user: {
      userId,
      name: String(user.nickname ?? user.display ?? "?"),
      username: String(user.username ?? ""),
      avatarUrl: avatarOf(user as Record<string, unknown>),
      org: orgFromUser(user as Record<string, unknown>),
    },
    days,
    reachedCount: days.filter((d) => d.reached).length,
    activeDays: days.filter((d) => d.total > 0).length,
    rewardDays: days.filter((d) => d.points > 0).length,
    points: days.reduce((a, d) => a + d.points, 0),
    total: days.reduce((a, d) => a + d.total, 0),
  });
}