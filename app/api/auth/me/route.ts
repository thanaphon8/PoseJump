import { NextResponse, connection } from "next/server";
import { currentUser } from "../../../../lib/auth";

export async function GET() {
  await connection();
  try {
    const u = await currentUser();
    return NextResponse.json({
      user: u ? { name: u.nickname, username: u.display } : null,
    });
  } catch (e) {
    console.error("me failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}