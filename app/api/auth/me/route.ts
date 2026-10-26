import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";
import { getUserPoints } from "../../../../lib/points";

export async function GET() {
  await connection();
  try {
    const u = await currentUser();
    const points = u ? await getUserPoints(u.id) : 0;

    // employeeId อ่านจาก DB โดยตรง (currentUser อาจไม่ได้ส่งฟิลด์นี้มา)
    let employeeId: string | undefined;
    if (u) {
      const db = await getDb();
      const doc = await db
        .collection("users")
        .findOne(
          { _id: new ObjectId(String(u.id)) },
          { projection: { employeeId: 1 } }
        );
      employeeId =
        typeof doc?.employeeId === "string" ? doc.employeeId : undefined;
    }

    return NextResponse.json(
      {
        user: u
          ? {
              name: u.nickname,
              username: u.username,
              employeeId,
              avatarUrl: u.avatarUrl,
              points,
              companyId: u.companyId ?? null,
              departmentId: u.departmentId ?? null,
              branchId: u.branchId ?? null,
            }
          : null,
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