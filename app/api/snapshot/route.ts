import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";
import { gameDayKey } from "../../components/goal";

// วางที่ app/api/snapshot/route.ts
// POST: รับ FormData: kind ("first-of-day" | "near-goal"), photo (ไฟล์รูป)
//   อัปโหลดขึ้น Google Drive ผ่าน Apps Script ตัวเดียวกับรูปโปรไฟล์ (ลงโฟลเดอร์ย่อยตาม kind)
//   เก็บได้ 1 รูปต่อ kind ต่อผู้ใช้ต่อวัน (วันเกม รีเซ็ต 06:00 น. เวลาไทย) ถ้ามีแล้วจะไม่บันทึกซ้ำ
// GET: คืนรูปของผู้ใช้ที่ล็อกอินสำหรับวันนี้ (หรือ ?date=YYYY-MM-DD)

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const KINDS = ["first-of-day", "near-goal"] as const;
type Kind = (typeof KINDS)[number];

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

// วันที่ของวันเกม YYYY-MM-DD (เวลาไทย รีเซ็ต 06:00 น.)
// คำนวณฝั่งเซิร์ฟเวอร์ ไม่เชื่อค่าจากเครื่องผู้ใช้
const thaiDate = (d = new Date()) => gameDayKey(d.getTime());

type SnapshotDoc = {
  userId: ObjectId | string;
  date: string;
  kind: Kind;
  imageUrl: string;
  driveFileId: string;
  createdAt: Date;
};

async function uploadToDrive(
  file: File,
  kind: Kind,
  username: string,
  date: string
): Promise<{ imageUrl: string; fileId: string } | null> {
  const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!GAS_URL) {
    console.error("snapshot: GOOGLE_APPS_SCRIPT_URL is not set");
    return null;
  }
  try {
    const buf = await file.arrayBuffer();
    const fileBase64 = Buffer.from(buf).toString("base64");
    const ext = EXT[file.type] ?? "jpg";
    const safeUser = username.replace(/[^\w\-]/g, "_");
    const fileName = `${safeUser}_${date}.${ext}`;

    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify({
        fileBase64,
        fileName,
        fileType: file.type,
        subfolder: kind,
        overwrite: true,
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
    console.error("snapshot: apps script returned failure", j);
    return null;
  } catch (e) {
    console.error("snapshot: upload via Apps Script failed", e);
    return null;
  }
}

export async function POST(req: Request) {
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

    const kindRaw = fd.get("kind");
    if (typeof kindRaw !== "string" || !KINDS.includes(kindRaw as Kind)) {
      return fail("ชนิดรูปไม่ถูกต้อง", 400);
    }
    const kind = kindRaw as Kind;

    const photo = fd.get("photo");
    if (!(photo instanceof File) || photo.size === 0) {
      return fail("ไม่พบไฟล์รูป", 400);
    }
    if (!EXT[photo.type]) {
      return fail("ไฟล์ต้องเป็นรูป JPG, PNG หรือ WebP", 400);
    }
    if (photo.size > PHOTO_MAX_BYTES) {
      return fail("ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB", 400);
    }

    const date = thaiDate();
    const db = await getDb();
    const col = db.collection<SnapshotDoc>("snapshots");
    const userId = toId(user.id);

    // มีรูปชนิดนี้ของวันนี้แล้ว ไม่บันทึกซ้ำ
    const existing = await col.findOne({ userId, date, kind });
    if (existing) {
      return NextResponse.json(
        { saved: false, imageUrl: existing.imageUrl, date, kind },
        { headers: noStore }
      );
    }

    const up = await uploadToDrive(
      photo,
      kind,
      String(user.username ?? "user"),
      date
    );
    if (!up) return fail("อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง", 502);

    // ถ้าสองคำขอเข้าพร้อมกัน upsert + $setOnInsert ทำให้มีแค่เอกสารเดียว
    await col.updateOne(
      { userId, date, kind },
      {
        $setOnInsert: {
          userId,
          date,
          kind,
          imageUrl: up.imageUrl,
          driveFileId: up.fileId,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    const saved = await col.findOne({ userId, date, kind });
    return NextResponse.json(
      { saved: true, imageUrl: saved?.imageUrl ?? up.imageUrl, date, kind },
      { headers: noStore }
    );
  } catch (e) {
    console.error("snapshot POST failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}

export async function GET(req: Request) {
  await connection();
  try {
    const user = await currentUser();
    if (!user) return fail("กรุณาเข้าสู่ระบบ", 401);

    const q = new URL(req.url).searchParams.get("date");
    const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : thaiDate();

    const db = await getDb();
    const rows = await db
      .collection<SnapshotDoc>("snapshots")
      .find({ userId: toId(user.id), date })
      .toArray();

    const out: Partial<Record<Kind, string>> = {};
    for (const r of rows) out[r.kind] = r.imageUrl;

    return NextResponse.json({ date, snapshots: out }, { headers: noStore });
  } catch (e) {
    console.error("snapshot GET failed", e);
    return fail("เซิร์ฟเวอร์ผิดพลาด", 500);
  }
}