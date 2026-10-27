import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import {
  computeDay,
  computeDayBanned,
  dayStartOf,
  employeeIdOf,
  validYmd,
} from "@/lib/admin-stats";
import { goalOfDate } from "@/app/components/goal";
import { activeBanOf, bansOfDay, publicBan } from "@/lib/bans";

// วางที่ app/api/admin/user-day/route.ts
// GET ?userId=...&date=YYYY-MM-DD  (เฉพาะผู้ดูแลที่ล็อกอินแล้ว)
// คืนผลของผู้เล่นคนนั้นในวันนั้น: ยอดโดดรวม รอบ ลำดับถึงเป้า point และภาพยืนยัน 2 ภาพจาก Drive
// ถ้าผู้เล่นถูกแบนในวันนั้น: ลำดับถึงเป้า/point เป็นว่าง ยอดโดดแสดงไว้ดูเท่านั้น (ไม่นับ)
// ban = แบนของวันนั้น หรือแบนที่ยังมีผลอยู่ (กรณีแบนข้ามเที่ยงคืน) ไว้โชว์และปลดแบน

const noStore = { "Cache-Control": "no-store" };

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: noStore });

type SnapshotDoc = {
  userId: ObjectId | string;
  date: string;
  kind: "first-of-day" | "near-goal";
  imageUrl: string;
};

export async function GET(req: Request) {
  await connection();
  try {
    if (!(await isAdminSession())) return fail("ไม่ได้รับอนุญาต", 401);

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "";
    const date = url.searchParams.get("date");
    if (!userId || userId.length > 64) return fail("userId ไม่ถูกต้อง", 400);
    if (!validYmd(date)) return fail("วันที่ไม่ถูกต้อง", 400);

    const db = await getDb();
    const start = dayStartOf(date);

    // ยอดรวมและอันดับของวันนั้น ใช้ตัวคำนวณเดียวกับตารางรายวัน ตัวเลขจึงตรงกัน
    const [entries, bannedList] = await Promise.all([
      computeDay(db, start),
      computeDayBanned(db, start),
    ]);
    const live = entries.find((e) => e.userId === userId);
    const bannedMe = bannedList.find((e) => e.userId === userId);
    const me = live ?? bannedMe;
    if (!me) return fail("ไม่พบข้อมูลของผู้เล่นในวันนี้", 404);

    // แบนที่จะแสดง: แบนของวันนั้น ถ้าไม่มีให้ใช้แบนที่ยังมีผลอยู่ (แบนข้ามวัน)
    const dayBans = await bansOfDay(db, date);
    const dayBan = dayBans.find((b) => String(b.userId) === userId) ?? null;
    const ban = dayBan ?? (await activeBanOf(db, userId));

    // employeeId อ่านจาก user doc โดยตรง เหมือน user-month
    const userDoc = await db.collection("users").findOne({
      _id: (ObjectId.isValid(userId) ? new ObjectId(userId) : userId) as ObjectId,
    });
    const employeeId = userDoc
      ? employeeIdOf(userDoc as Record<string, unknown>)
      : (me.employeeId ?? null);

    // userId ใน snapshots เก็บเป็น ObjectId หรือ string รองรับทั้งสองแบบ
    const ids: (ObjectId | string)[] = [userId];
    if (ObjectId.isValid(userId)) ids.unshift(new ObjectId(userId));

    const rows = await db
      .collection<SnapshotDoc>("snapshots")
      .find({ userId: { $in: ids }, date })
      .toArray();

    const pick = (kind: SnapshotDoc["kind"]) =>
      rows.find((r) => r.kind === kind)?.imageUrl ?? null;

    return NextResponse.json(
      {
        date,
        user: {
          userId: me.userId,
          name: me.name,
          username: me.username,
          employeeId,
          avatarUrl: me.avatarUrl,
          org: me.org,
        },
        total: me.total,
        rounds: me.rounds,
        goal: live ? live.goal : goalOfDate(date),
        goalRank: live ? live.goalRank : null,
        points: live ? live.points : 0,
        snapshots: {
          start: pick("first-of-day"),
          end: pick("near-goal"),
        },
        ban: ban ? publicBan(ban) : null,
      },
      { headers: noStore }
    );
  } catch (e) {
    console.error("admin user-day GET failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}
