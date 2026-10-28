import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";

// วางที่ app/api/profile/route.ts
// PATCH: รับ FormData  nickname (ไม่บังคับ) และ avatar (ไฟล์รูป ไม่บังคับ)
//   ส่งมาเฉพาะอย่างที่เปลี่ยน หน้าตั้งค่า (Setting.tsx) เรียกด้วยรูปแบบนี้
//   รูปอัปโหลดขึ้น Google Drive ผ่าน Apps Script ตัวเดียวกับตอนสมัครสมาชิก
//   ตอบ { user: { name, avatarUrl } }

const NAME_MAX = 20;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const noStore = { "Cache-Control": "no-store" };

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: noStore });

const toId = (v: ObjectId | string) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

async function uploadAvatar(
  file: File,
  username: string
): Promise<{ imageUrl: string; fileId: string } | null> {
  const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!GAS_URL) {
    console.error("profile: GOOGLE_APPS_SCRIPT_URL is not set");
    return null;
  }
  try {
    const buf = await file.arrayBuffer();
    const fileBase64 = Buffer.from(buf).toString("base64");
    const ext = EXT[file.type] ?? "jpg";
    const safeUser = username.replace(/[^\w\-]/g, "_");
    const fileName = `avatar_${safeUser}_${Date.now()}.${ext}`;

    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        fileBase64,
        fileName,
        fileType: file.type,
      }),
    });
    const j = (await res.json()) as {
      success?: boolean;
      imageUrl?: string;
      fileId?: string;
    };
    if (j.success && j.imageUrl) {
      return { imageUrl: j.imageUrl, fileId: j.fileId ?? "" };
    }
    console.error("profile: apps script returned failure", j);
    return null;
  } catch (e) {
    console.error("profile: upload via Apps Script failed", e);
    return null;
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("กรุณาเข้าสู่ระบบ", 401);

    let fd: FormData;
    try {
      fd = await req.formData();
    } catch {
      return fail("ข้อมูลไม่ถูกต้อง", 400);
    }

    const set: Record<string, unknown> = {};

    // ชื่อที่แสดง
    const nickRaw = fd.get("nickname");
    if (nickRaw !== null) {
      const nickname = typeof nickRaw === "string" ? nickRaw.trim() : "";
      const len = Array.from(nickname).length;
      if (len < 1 || len > NAME_MAX) {
        return fail(`ชื่อต้องยาว 1-${NAME_MAX} ตัวอักษร`, 400);
      }
      set.nickname = nickname;
    }

    // รูปโปรไฟล์
    const avatar = fd.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      if (!EXT[avatar.type]) {
        return fail("ไฟล์ต้องเป็นรูป JPG, PNG หรือ WebP", 400);
      }
      if (avatar.size > AVATAR_MAX_BYTES) {
        return fail("ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB", 400);
      }
      const up = await uploadAvatar(avatar, String(user.username ?? "user"));
      if (!up) return fail("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", 502);
      set.avatarUrl = up.imageUrl;
      set.driveFileId = up.fileId;
    }

    if (Object.keys(set).length === 0) {
      return fail("ไม่มีข้อมูลที่ต้องเปลี่ยน", 400);
    }

    const db = await getDb();
    const r = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: toId(user.id) as ObjectId },
        { $set: set },
        { returnDocument: "after", projection: { nickname: 1, avatarUrl: 1 } }
      );
    // รองรับทั้ง mongodb driver v5 (r.value) และ v6 (r เป็น doc ตรงๆ)
    const doc = (r && "value" in (r as object)
      ? (r as unknown as { value: Record<string, unknown> | null }).value
      : r) as { nickname?: string; avatarUrl?: string | null } | null;
    if (!doc) return fail("ไม่พบบัญชีผู้ใช้", 404);

    return NextResponse.json(
      {
        user: {
          name: doc.nickname ?? user.nickname,
          avatarUrl: doc.avatarUrl ?? null,
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    console.error("profile PATCH failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}