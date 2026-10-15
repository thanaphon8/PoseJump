import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";

// "วันนี้" นับตามเวลาไทย (UTC+7) อันดับจึงรีเซ็ตตอนเที่ยงคืนของไทย
const TZ_OFFSET = 7 * 3_600_000;
const DAY = 864e5;
const TOP = 50;

const toId = (v: ObjectId | string) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

type Row = { _id: ObjectId | string; total: number; rounds: number };
type UserDoc = { _id: ObjectId | string; nickname?: string };

export async function GET() {
  await connection();
  try {
    const now = Date.now();
    const start = Math.floor((now + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;

    const user = await currentUser();
    const myId = user ? String(user.id) : null;

    const db = await getDb();
    const rows = (await db
      .collection("jumps")
      .aggregate([
        { $match: { ts: { $gte: start, $lt: start + DAY } } },
        {
          $group: {
            _id: "$userId",
            total: { $sum: "$total" },
            rounds: { $sum: 1 },
            first: { $min: "$ts" },
          },
        },
        // แต้มเท่ากัน ใครถึงก่อนได้อันดับก่อน
        { $sort: { total: -1, first: 1 } },
      ])
      .toArray()) as Row[];

    const top = rows.slice(0, TOP);
    const users = await db
      .collection<UserDoc>("users")
      .find({ _id: { $in: top.map((r) => toId(r._id)) } })
      .toArray();
    const names = new Map(users.map((u) => [String(u._id), u.nickname as string]));

    const entries = top.map((r, i) => ({
      rank: i + 1,
      name: names.get(String(r._id)) ?? "ไม่ระบุชื่อ",
      total: r.total,
      rounds: r.rounds,
      me: String(r._id) === myId,
    }));

    const idx = myId ? rows.findIndex((r) => String(r._id) === myId) : -1;
    const me =
      idx >= 0
        ? {
            rank: idx + 1,
            total: rows[idx].total,
            // ต้องโดดอีกกี่ครั้งถึงจะแซงคนอันดับถัดขึ้นไป
            gap: idx > 0 ? rows[idx - 1].total - rows[idx].total + 1 : 0,
          }
        : null;

    return NextResponse.json(
      { entries, me, count: rows.length, resetAt: start + DAY },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("leaderboard GET failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}