import { ObjectId, type Db } from "mongodb";
import { gameDayStart, gameDayKey } from "../app/components/goal";
import { voidedUsersOfDay } from "./bans";

// ตัวคำนวณอันดับของ "วันเกมปัจจุบัน" ใช้ร่วมกันระหว่าง
// - GET  /api/leaderboard       (ตารางอันดับ)
// - POST /api/leaderboard/note  (ตรวจว่าคนเขียนโน๊ตอยู่อันดับ 1-3 จริง)
// วันเกมนับตามเวลาไทย (UTC+7) รีเซ็ตตอน 06:00 น. (ดู gameDayStart / gameDayKey ใน app/components/goal.ts)

export const DAY = 864e5;

export const toId = (v: ObjectId | string) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

export type RankRow = { _id: ObjectId | string; total: number; rounds: number };

export type UserDoc = {
  _id: ObjectId | string;
  nickname?: string;
  avatarUrl?: string | null;
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
};

export type DayRanking = {
  // ต้นวันเกม = 06:00 น. ไทยล่าสุด (epoch ms)
  start: number;
  // YYYY-MM-DD ของวันเกม เวลาไทย (ตรงกับ key ที่ /api/sessions ใช้บันทึก goal_hits)
  dayStr: string;
  // อันดับเรียงแล้ว: ตัดบัญชีที่ไม่มีใน users และคนที่ถูกแบนในวันนี้ออกแล้ว
  rows: RankRow[];
  // ข้อมูลผู้ใช้ของทุกแถวใน rows (key = String(_id))
  users: Map<string, UserDoc>;
  // คนที่ถูกแบนในวันนี้ (คะแนนทั้งวันถูกตัด)
  voided: Set<string>;
};

export async function getDayRanking(
  db: Db,
  now = Date.now()
): Promise<DayRanking> {
  // ต้นวันเกม = 06:00 น. ไทยล่าสุด
  const start = gameDayStart(now);
  // ต้องตรงกับ key ที่ /api/sessions ใช้บันทึก goal_hits (YYYY-MM-DD ของวันเกม เวลาไทย)
  const dayStr = gameDayKey(now);

  const rawRows = (await db
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
    .toArray()) as RankRow[];

  // กันไว้อีกชั้น: ตัดบัญชีที่ไม่มีใน users ออกจากอันดับ
  // (กรณีรอบ purge ยังไม่ถึงเวลา)
  const existing = await db
    .collection<UserDoc>("users")
    .find({ _id: { $in: rawRows.map((r) => toId(r._id)) } })
    .project({
      _id: 1,
      nickname: 1,
      avatarUrl: 1,
      companyId: 1,
      departmentId: 1,
      branchId: 1,
    })
    .toArray();
  const users = new Map(existing.map((u) => [String(u._id), u as UserDoc]));

  // คนที่ถูกแบนในวันนี้ถูกตัดคะแนนทั้งวัน ซ่อนจากอันดับเหมือนไม่ได้เล่น
  const voided = await voidedUsersOfDay(db, dayStr);
  const rows = rawRows.filter(
    (r) => users.has(String(r._id)) && !voided.has(String(r._id))
  );

  return { start, dayStr, rows, users, voided };
}