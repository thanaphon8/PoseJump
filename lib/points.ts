import { getDb } from "./mongodb";

// point รวมของผู้ใช้ (เก็บใน collection "points" เป็น { userId, points })
// userId ต้องเป็นชนิดเดียวกับที่ใช้ใน jumps / goal_hits คือ currentUser().id
export async function getUserPoints(userId: unknown): Promise<number> {
  try {
    const db = await getDb();
    const p = await db.collection("points").findOne({ userId });
    return typeof p?.points === "number" ? p.points : 0;
  } catch (e) {
    console.error("getUserPoints failed", e);
    return 0;
  }
}