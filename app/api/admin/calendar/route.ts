import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  DAY_MS,
  computeRange,
  mondayOf,
  monthRange,
  validMonth,
  ymdOf,
} from "@/lib/admin-stats";

// GET /api/admin/calendar?month=YYYY-MM
// สรุปรายสัปดาห์ของเดือนนั้น (จันทร์-อาทิตย์ เวลาไทย) ใช้แสดงปฏิทินในหน้ารายสัปดาห์
// สัปดาห์ที่คาบเกี่ยวเดือน นับครบทั้ง 7 วัน ตรงกับหน้า /api/admin/week
export async function GET(req: Request) {
  if (!(await isAdminSession()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("month");
  const month = validMonth(q) ? q : ymdOf(Date.now()).slice(0, 7);
  const { start: mStart, end: mEnd } = monthRange(month);

  const start = mondayOf(ymdOf(mStart));
  const end = mondayOf(ymdOf(mEnd - DAY_MS)) + 7 * DAY_MS;

  const db = await getDb();
  const perDay = await computeRange(db, start, end);

  const weeks = [];
  for (let w = 0; w * 7 < perDay.length; w++) {
    const users = new Map<
      string,
      { name: string; avatarUrl: string | null; total: number }
    >();
    const days = [];
    let total = 0;
    let points = 0;

    for (let i = 0; i < 7; i++) {
      const t = start + (w * 7 + i) * DAY_MS;
      const list = perDay[w * 7 + i] ?? [];
      let dayTotal = 0;
      for (const e of list) {
        dayTotal += e.total;
        points += e.points;
        const u = users.get(e.userId) ?? {
          name: e.name,
          avatarUrl: e.avatarUrl,
          total: 0,
        };
        u.total += e.total;
        users.set(e.userId, u);
      }
      total += dayTotal;
      days.push({
        date: ymdOf(t),
        inMonth: t >= mStart && t < mEnd,
        players: list.length,
        total: dayTotal,
      });
    }

    weeks.push({
      start: ymdOf(start + w * 7 * DAY_MS),
      days,
      players: users.size,
      total,
      points,
      top: [...users.values()].sort((a, b) => b.total - a.total).slice(0, 3),
    });
  }

  return NextResponse.json({ month, weeks });
}