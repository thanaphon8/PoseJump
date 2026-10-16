import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pj_admin";
export const ADMIN_MAX_AGE_SEC = 60 * 60 * 8; // 8 ชั่วโมง

const secret = () => process.env.ADMIN_PASSWORD ?? "";
const sign = (exp: string) =>
  createHmac("sha256", secret()).update(`pj-admin:${exp}`).digest("hex");
const sha = (s: string) => createHash("sha256").update(s).digest();

export const adminConfigured = () => secret().length > 0;

// เทียบรหัสผ่านแบบเวลาคงที่ กัน timing attack
export function checkPassword(input: unknown) {
  if (!adminConfigured() || typeof input !== "string") return false;
  return timingSafeEqual(sha(input), sha(secret()));
}

// token = เวลาหมดอายุ + ลายเซ็น HMAC ไม่เก็บอะไรในฐานข้อมูล
export function makeAdminToken() {
  const exp = String(Date.now() + ADMIN_MAX_AGE_SEC * 1000);
  return `${exp}.${sign(exp)}`;
}

export async function isAdminSession() {
  if (!adminConfigured()) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return good.length === got.length && timingSafeEqual(good, got);
}