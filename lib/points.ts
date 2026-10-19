import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

const toId = (id: unknown) =>
  typeof id === "string" && ObjectId.isValid(id) ? new ObjectId(id) : id;

export async function getUserPoints(userId: unknown): Promise<number> {
  try {
    const db = await getDb();
    const u = await db
      .collection("users")
      .findOne({ _id: toId(userId) as any }, { projection: { points: 1 } });
    return typeof u?.points === "number" ? u.points : 0;
  } catch (e) {
    console.error("getUserPoints failed", e);
    return 0;
  }
}

export async function addUserPoints(userId: unknown, amount: number) {
  const db = await getDb();
  const r = await db
    .collection("users")
    .updateOne({ _id: toId(userId) as any }, { $inc: { points: amount } });
  if (r.matchedCount === 0) console.error("addUserPoints: user not found", userId);
}