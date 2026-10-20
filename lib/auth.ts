import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { ObjectId } from "mongodb";
import { getDb } from "./mongodb";

export const COOKIE = "pj_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 วัน

// เก็บเฉพาะแฮชของ token ในฐานข้อมูล
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type AuthUser = {
  id: ObjectId;
  username: string;
  display: string;
  nickname: string;
  avatarUrl?: string; // <--- เพิ่มฟิลด์รูปโปรไฟล์ตรงนี้
};

export async function createSession(userId: ObjectId) {
  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.collection("sessions").insertOne({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + MAX_AGE_SEC * 1000),
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.collection("sessions").deleteOne({ tokenHash: hashToken(token) });
  }
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const s = await db.collection("sessions").findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!s) return null;

  const u = await db.collection("users").findOne({ _id: s.userId });
  if (!u) return null;
  return {
    id: u._id,
    username: u.username as string,
    display: u.display as string,
    nickname: u.nickname as string,
    avatarUrl: u.avatarUrl as string, // <--- ดึงค่า avatarUrl จาก MongoDB มาส่งต่อ
  };
}