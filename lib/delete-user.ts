import { getDb } from "./mongodb";

// collection ที่เก็บข้อมูลผูกกับผู้ใช้ผ่าน field "userId"
// ถ้าเพิ่ม collection ใหม่ที่ผูกกับ user ในอนาคต ให้เพิ่มชื่อที่นี่
const BY_USER_ID = ["jumps", "goal_hits", "settings", "sessions"];

// ลบผู้ใช้ + ข้อมูลทั้งหมดที่ผูกอยู่ (เกลี้ยง)
// คืน null ถ้าไม่พบ user, ไม่งั้นคืนจำนวน doc ที่ลบ/ปรับในแต่ละ collection
export async function deleteUserCompletely(username: string) {
  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ username: username.trim().toLowerCase() });
  if (!user) return null;

  // userId อาจเก็บเป็น ObjectId หรือ string ลบทั้งสองแบบ
  const ids: unknown[] = [user._id, String(user._id)];
  const deleted: Record<string, number> = {};

  // จำวันที่คนนี้เคยถึงเป้า ไว้ปรับ goal_counters หลังลบ
  const hitDays = (
    await db
      .collection("goal_hits")
      .find({ userId: { $in: ids } })
      .project({ day: 1 })
      .toArray()
  ).map((h) => h.day as string);

  for (const c of BY_USER_ID) {
    const r = await db.collection(c).deleteMany({ userId: { $in: ids } });
    deleted[c] = r.deletedCount;
  }

  // goal_counters เก็บเป็นตัวนับรายวัน (_id = YYYY-MM-DD) ไม่มี userId
  // จึงลบรายคนไม่ได้ → ปรับตัวนับของวันนั้นให้เท่ากับลำดับสูงสุดที่เหลืออยู่
  // ถ้าวันนั้นไม่เหลือใครถึงเป้าเลย ลบตัวนับของวันนั้นทิ้ง
  const counters = db.collection<{ _id: string; seq: number }>("goal_counters");
  let touched = 0;
  for (const day of new Set(hitDays)) {
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
  deleted.goal_counters = touched;

  // ลบ users เป็นอันดับสุดท้าย ถ้าพลาดกลางทางยังรันซ้ำได้
  const r = await db.collection("users").deleteOne({ _id: user._id });
  deleted.users = r.deletedCount;

  return deleted;
}