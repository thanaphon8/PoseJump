import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE_SEC,
  adminConfigured,
  checkPassword,
  makeAdminToken,
} from "@/lib/admin-auth";

// POST { password } ถูก = ตั้งคุกกี้ 8 ชั่วโมง
export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน .env.local" },
      { status: 500 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  if (!checkPassword(body.password)) {
    // หน่วงตอบ กันคนรัวเดารหัส
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, makeAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE_SEC,
  });
  return NextResponse.json({ ok: true });
}

// ออกจากระบบแอดมิน
export async function DELETE() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}