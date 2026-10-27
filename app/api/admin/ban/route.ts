import { NextResponse, connection } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isAdminSession } from "@/lib/admin-auth";
import { banUser, publicBan, unbanUser } from "@/lib/bans";

// POST   /api/admin/ban            body { userId, reason }  แบน 24 ชม. นับจากตอนนี้
// DELETE /api/admin/ban?banId=...  ปลดแบน (กรณี admin ตรวจผิด)
// เฉพาะผู้ดูแลที่ล็อกอินแล้ว

const noStore = { "Cache-Control": "no-store" };

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: noStore });

export async function POST(req: Request) {
  await connection();
  try {
    if (!(await isAdminSession())) return fail("ไม่ได้รับอนุญาต", 401);

    let b: Record<string, unknown>;
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      return fail("ข้อมูลไม่ถูกต้อง", 400);
    }

    const userId = typeof b.userId === "string" ? b.userId : "";
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!userId || userId.length > 64) return fail("userId ไม่ถูกต้อง", 400);
    if (reason.length < 3) return fail("ใส่เหตุผลอย่างน้อย 3 ตัวอักษร", 400);
    if (reason.length > 500) return fail("เหตุผลยาวเกิน 500 ตัวอักษร", 400);

    const db = await getDb();
    const r = await banUser(db, userId, reason);
    if (!r.ok) {
      if (r.error === "notfound") return fail("ไม่พบผู้ใช้", 404);
      if (r.error === "active") return fail("บัญชีนี้ถูกแบนอยู่แล้ว ปลดแบนก่อน", 409);
      return fail("วันนี้บัญชีนี้ถูกแบนไปแล้ว ปลดแบนก่อน", 409);
    }
    return NextResponse.json(
      { ok: true, ban: publicBan(r.ban) },
      { headers: noStore }
    );
  } catch (e) {
    console.error("admin ban POST failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}

export async function DELETE(req: Request) {
  await connection();
  try {
    if (!(await isAdminSession())) return fail("ไม่ได้รับอนุญาต", 401);

    const banId = new URL(req.url).searchParams.get("banId") ?? "";
    if (!banId || banId.length > 64) return fail("banId ไม่ถูกต้อง", 400);

    const db = await getDb();
    const r = await unbanUser(db, banId);
    if (!r.ok) {
      if (r.error === "notfound") return fail("ไม่พบรายการแบน", 404);
      return fail("รายการแบนนี้ถูกปลดไปแล้ว", 409);
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    console.error("admin ban DELETE failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}
