import { NextResponse, connection } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getUserPoints } from "../../../../lib/points";

export async function GET() {
  await connection();
  try {
    const u = await currentUser();
    const points = u ? await getUserPoints(u.id) : 0;
    return NextResponse.json(
      {
        user: u ? { name: u.nickname, username: u.username, points } : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("me failed", e);
    return NextResponse.json(
      { error: "เซิร์ฟเวอร์ผิดพลาด" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}