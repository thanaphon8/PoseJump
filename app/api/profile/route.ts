import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";
import { getUserPoints } from "../../../lib/points";

// วางที่ app/api/profile/route.ts
// รับ FormData: nickname (ไม่บังคับ), avatar (ไฟล์รูป ไม่บังคับ)
// อัปโหลดรูปขึ้น Google Drive ผ่าน Apps Script ตัวเดียวกับตอน register
const NAME_MAX = 20;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const toId = (v: ObjectId | string) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

const noStore = { "Cache-Control": "no-store" };

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: noStore });

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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
    const fileName = `avatar_${username}_${Date.now()}.${ext}`;

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
  await connection();
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

    // ชื่อ (ไม่บังคับ)
    const nickRaw = fd.get("nickname");
    if (nickRaw !== null) {
      const nick = typeof nickRaw === "string" ? nickRaw.trim() : "";
      const len = Array.from(nick).length;
      if (len < 1 || len > NAME_MAX) {
        return fail(`ชื่อต้องยาว 1-${NAME_MAX} ตัวอักษร`, 400);
      }
      set.nickname = nick;
    }

    // รูป (ไม่บังคับ)
    const avatar = fd.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      if (!avatar.type.startsWith("image/")) {
        return fail("ไฟล์ต้องเป็นรูปภาพ", 400);
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
      return fail("ไม่มีข้อมูลที่จะแก้ไข", 400);
    }

    const db = await getDb();
    const users = db.collection<{ _id: ObjectId | string }>("users");
    await users.updateOne({ _id: toId(user.id) }, { $set: set });

    const fresh = (await users.findOne({ _id: toId(user.id) })) as {
      nickname?: string;
      username?: string;
      avatarUrl?: string | null;
    } | null;

    const points = await getUserPoints(user.id);

    return NextResponse.json(
      {
        user: {
          name: fresh?.nickname ?? user.nickname,
          username: fresh?.username ?? user.username,
          avatarUrl: fresh?.avatarUrl || null,
          points,
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    console.error("profile PATCH failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}