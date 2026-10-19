import { NextResponse } from "next/server";
import { deleteUserCompletely } from "../../../../lib/delete-user";
import { isAdminSession } from "../../../../lib/admin-auth";

// DELETE /api/admin/user?username=duck123
export async function DELETE(req: Request) {
  try {
    // ต้องเป็นแอดมินเท่านั้น
    if (!(await isAdminSession())) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 401 });
    }

    const username = new URL(req.url).searchParams.get("username")?.trim();
    if (!username) {
      return NextResponse.json({ error: "ระบุ username" }, { status: 400 });
    }

    const deleted = await deleteUserCompletely(username);
    if (!deleted) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error("admin delete user failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}