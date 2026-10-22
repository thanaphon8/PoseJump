// ตัวช่วยส่งภาพยืนยันของวันขึ้นเซิร์ฟเวอร์ (วางโฟลเดอร์เดียวกับ Pose และ auth-shared)
// ภาพมาจาก captureShot() ในหน้ากระโดด เป็น data URL (JPEG) ที่ประทับเวลาแล้ว
// เซิร์ฟเวอร์ (/api/snapshot) ส่งต่อไป Google Apps Script แล้วบันทึกลง Drive

export type SnapshotKind = "first-of-day" | "near-goal";

// ชนิดที่หน้ากระโดดใช้ ("start" = ภาพแรกของวัน, "end" = ภาพใกล้ถึงเป้า) แปลงเป็นชนิดของเซิร์ฟเวอร์
const KIND_MAP: Record<"start" | "end", SnapshotKind> = {
  start: "first-of-day",
  end: "near-goal",
};

// แปลง data URL เป็น Blob โดยไม่ใช้ fetch (ใช้ได้แม้ CSP ปิด data:)
function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

// ส่งภาพขึ้นเซิร์ฟเวอร์ คืน URL รูปบน Drive หรือ null ถ้าไม่สำเร็จ (ไม่ throw เพื่อไม่กระทบการกระโดด)
// ถ้าวันนี้เซิร์ฟเวอร์มีรูปชนิดนี้แล้ว จะคืน URL เดิมและไม่บันทึกซ้ำ
export async function uploadShot(
  kind: "start" | "end",
  dataUrl: string | null
): Promise<string | null> {
  if (!dataUrl) return null;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;
  try {
    const fd = new FormData();
    fd.append("kind", KIND_MAP[kind]);
    fd.append("photo", blob, `${KIND_MAP[kind]}.jpg`);
    const r = await fetch("/api/snapshot", { method: "POST", body: fd });
    if (!r.ok) return null;
    const d = (await r.json().catch(() => null)) as {
      imageUrl?: string;
    } | null;
    return d?.imageUrl ?? null;
  } catch {
    return null;
  }
}