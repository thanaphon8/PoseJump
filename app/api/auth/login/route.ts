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

    const username =
      typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "username หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    const db = await getDb();
    const u = await db.collection("users").findOne({ username });
    const ok = u ? await bcrypt.compare(password, u.passwordHash as string) : false;
    if (!u || !ok) {
      return NextResponse.json(
        { error: "username หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    await createSession(u._id);

    const points = typeof u.points === "number" ? u.points : 0;
    const num = (v: unknown) => (typeof v === "number" ? v : null);

    return NextResponse.json({
      user: {
        name: u.nickname as string,
        username: u.display as string,
        employeeId:
          typeof u.employeeId === "string" ? u.employeeId : undefined,
        avatarUrl: u.avatarUrl as string,
        points,
        companyId: num(u.companyId),
        departmentId: num(u.departmentId),
        branchId: num(u.branchId),
      },
    });
  } catch (e) {
    console.error("login failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}