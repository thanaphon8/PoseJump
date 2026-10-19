import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "../../../../lib/mongodb";
import { createSession } from "../../../../lib/auth";

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const nickname =
      typeof body.nickname === "string" ? body.nickname.trim().slice(0, 20) : "";
    const display =
      typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const errors: Record<string, string> = {};
    if (!nickname) errors.nickname = "กรอกชื่อเล่น";
    if (!/^[A-Za-z0-9_]{3,20}$/.test(display))
      errors.username = "3-20 ตัว ใช้ a-z 0-9 และ _ เท่านั้น";
    if (password.length < 6 || password.length > 72)
      errors.password = "รหัสผ่านต้องยาว 6-72 ตัวอักษร";
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const db = await getDb();
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const r = await db.collection("users").insertOne({
        username: display.toLowerCase(),
        display,
        nickname,
        passwordHash,
        // point เก็บในเอกสาร user โดยตรง (เริ่มที่ 0)
        points: 0,
        createdAt: new Date(),
      });
      await createSession(r.insertedId);
      return NextResponse.json(
        { user: { name: nickname, username: display, points: 0 } },
        { status: 201 }
      );
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        return NextResponse.json(
          { errors: { username: "username นี้ถูกใช้แล้ว" } },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("register failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}