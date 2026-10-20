import type { Db } from "mongodb";

// collection ที่ผูกกับผู้ใช้ผ่าน field "userId"
// ถ้าเพิ่ม collection ใหม่ที่ผูกกับ user ในอนาคต ให้เพิ่มชื่อที่นี่ (และใน lib/delete-user.ts)
const BY_USER_ID = ["jumps", "goal_hits", "settings", "sessions"];

// ลบข้อมูลของ userId ที่ไม่มี doc ใน collection "users" แล้ว (ข้อมูลกำพร้า)
// ใช้ได้ทั้งกรณีลบ user ผ่าน Compass และผ่าน API
export async function purgeOrphans(db: Db) {
  const users = await db
    .collection("users")
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const alive = new Set(users.map((u) => String(u._id)));

  const removed: Record<string, number> = {};
  const hitDays = new Set<string>();

  for (const c of BY_USER_ID) {
    const col = db.collection(c);
    const orphanIds = (await col.distinct("userId")).filter(
      (id) => !alive.has(String(id))
    );
    if (orphanIds.length === 0) continue;

    // จำวันที่ได้ลำดับถึงเป้า เพื่อปรับ goal_counters ต่อ
    if (c === "goal_hits") {
      const hits = await col
        .find({ userId: { $in: orphanIds } })
        .project({ day: 1 })
        .toArray();
      hits.forEach((h) => hitDays.add(h.day as string));
    }

    const r = await col.deleteMany({ userId: { $in: orphanIds } });
    removed[c] = r.deletedCount;
  }

  // goal_counters เป็นตัวนับรายวัน (_id = YYYY-MM-DD) ไม่มี userId
  // ปรับเฉพาะวันที่เพิ่งลบ goal_hits กำพร้าไป: seq = ลำดับสูงสุดที่เหลือ
  // ไม่เหลือใครเลย = ลบตัวนับของวันนั้นทิ้ง
  if (hitDays.size > 0) {
    const counters = db.collection<{ _id: string; seq: number }>(
      "goal_counters"
    );
    let touched = 0;
    for (const day of hitDays) {
      const top = await db
        .collection("goal_hits")
        .find({ day })
        .sort({ seq: -1 })
        .limit(1)
        .next();
      if (top) {
        const r = await counters.updateOne(
          { _id: day },
          { $set: { seq: Number(top.seq) || 0 } }
        );
        touched += r.modifiedCount;
      } else {
        const r = await counters.deleteOne({ _id: day });
        touched += r.deletedCount;
      }
    }
    removed.goal_counters = touched;
  }

  return removed;
}

// เรียกซ้ำได้ แต่รันจริงไม่เกิน 1 ครั้ง / 60 วินาที ต่อโปรเซส
// ล้มเหลวไม่กระทบคำขอหลัก
let lastRun = 0;
export async function purgeOrphansThrottled(db: Db, everyMs = 60_000) {
  const now = Date.now();
  if (now - lastRun < everyMs) return;
  lastRun = now;
  try {
    await purgeOrphans(db);
  } catch (e) {
    lastRun = 0;
    console.error("purgeOrphans failed", e);
  }
}