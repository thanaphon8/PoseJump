import { NextResponse, connection } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";

// GET /api/departments/members → สมาชิกในแผนกเดียวกับผู้ใช้ที่ล็อกอิน
export async function GET() {
  await connection();
  try {
    const me = await currentUser();
    if (!me) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }
    if (me.departmentId == null) {
      return NextResponse.json(
        { members: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const db = await getDb();
    const docs = await db
      .collection("users")
      .find(
        { departmentId: me.departmentId },
        {
          projection: {
            display: 1,
            username: 1,
            nickname: 1,
            avatarUrl: 1,
            points: 1,
          },
        }
      )
      .sort({ points: -1, createdAt: 1 })
      .limit(500)
      .toArray();

    const members = docs.map((d) => ({
      name: d.nickname as string,
      username: (d.display ?? d.username) as string,
      avatarUrl: (d.avatarUrl as string) || null,
      points: typeof d.points === "number" ? d.points : 0,
      isMe: d._id.equals(me.id),
    }));

    return NextResponse.json(
      { members },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("department members failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}