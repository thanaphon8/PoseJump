import { getDb } from "./mongodb";

// collection ที่เก็บข้อมูลผูกกับผู้ใช้ผ่าน field "userId"
// ถ้าเพิ่ม collection ใหม่ที่ผูกกับ user ในอนาคต ให้เพิ่มชื่อที่นี่
const BY_USER_ID = ["jumps", "goal_hits", "settings", "sessions"];

// ลบผู้ใช้ + ข้อมูลทั้งหมดที่ผูกอยู่ (เกลี้ยง)
// คืน null ถ้าไม่พบ user, ไม่งั้นคืนจำนวน doc ที่ลบในแต่ละ collection
export async function deleteUserCompletely(username: string) {
  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ username: username.trim().toLowerCase() });
  if (!user) return null;

  // userId อาจเก็บเป็น ObjectId หรือ string ลบทั้งสองแบบ
  const ids: unknown[] = [user._id, String(user._id)];
  const deleted: Record<string, number> = {};

  for (const c of BY_USER_ID) {
    const r = await db.collection(c).deleteMany({ userId: { $in: ids } });
    deleted[c] = r.deletedCount;
  }

  // ลบ users เป็นอันดับสุดท้าย ถ้าพลาดกลางทางยังรันซ้ำได้
  const r = await db.collection("users").deleteOne({ _id: user._id });
  deleted.users = r.deletedCount;

  return deleted;
}