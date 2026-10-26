"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, ICONS, Segmented } from "./auth-shared";
import type { User } from "./auth-shared";
import {
  branchCode,
  branchLabel,
  branchProvince,
  branchRegion,
  getBranch,
  orgOf,
} from "./branches";

/* ------------------------------------------------------------------ */
/* หน้าตั้งค่า (แท็บ "ตั้งค่า")                                          */
/* โปรไฟล์: เปลี่ยนรูป (เลือกไฟล์ / ถ่ายใหม่ / ลบ) และเปลี่ยนชื่อ          */
/* ------------------------------------------------------------------ */

const card = "rounded-3xl bg-white pj-lift";
const NAME_MAX = 20;
const AVATAR_SIZE = 512; // px ย่อรูปก่อนอัปโหลดขึ้น Drive (ครอปกลางเป็นสี่เหลี่ยมจัตุรัส)

// ไอคอนดินสอ (แก้ไขรูป)
const PENCIL = "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z";

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

// ย่อ+ครอปกลางเป็นสี่เหลี่ยมจัตุรัส แล้วแปลงเป็น data URL (JPEG)
function toAvatar(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  mirror = false
): string {
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  const c = document.createElement("canvas");
  c.width = AVATAR_SIZE;
  c.height = AVATAR_SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  if (mirror) {
    ctx.translate(AVATAR_SIZE, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return c.toDataURL("image/jpeg", 0.85);
}

// size = px ตายตัว / fill = เต็มกล่องแม่ (ให้ขนาดเปลี่ยนตามหน้าจอด้วย class ของกล่องแม่)
function Avatar({
  name,
  src,
  size = 40,
  fill = false,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    setImgError(false);
    setTries(0);
  }, [src]);

  // รูปที่เพิ่งอัปโหลดขึ้น Drive บางครั้งยังโหลดไม่ได้ทันที ลองใหม่ได้ 3 ครั้ง
  useEffect(() => {
    if (!imgError || !src || src.startsWith("data:") || tries >= 3) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      setImgError(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [imgError, src, tries]);

  if (src && !imgError) {
    const url =
      tries > 0 && !src.startsWith("data:")
        ? `${src}${src.includes("?") ? "&" : "?"}r=${tries}`
        : src;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`shrink-0 rounded-full object-cover bg-[#1B2A21] ${
          fill ? "h-full w-full" : ""
        } ${className}`}
        style={fill ? undefined : { width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#1B2A21] font-semibold text-[#C9F25B] ${
        fill ? "h-full w-full" : ""
      } ${className}`}
      style={
        fill ? undefined : { width: size, height: size, fontSize: size * 0.42 }
      }
      aria-hidden
    >
      {initialOf(name)}
    </span>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-[#3F5E1F]" : "bg-[#D5DCC8] hover:bg-[#C6CFB6]"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all duration-200 ${
          on ? "left-[22px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* กล้องถ่ายรูปโปรไฟล์                                                    */
/* ------------------------------------------------------------------ */

type Shot = { img: HTMLImageElement; w: number; h: number };

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

function CameraModal({
  initialFacing,
  onCapture,
  onClose,
}: {
  initialFacing: "user" | "environment";
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [cam, setCam] = useState(initialFacing);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // ภาพเต็มเฟรมที่ถ่ายแล้ว (กลับด้านจากกล้องหน้าไว้แล้ว) รอให้ผู้ใช้เลื่อนเลือกตำแหน่ง
  const [shot, setShot] = useState<Shot | null>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [V, setV] = useState(280); // เส้นผ่านศูนย์กลางวงกลมครอป (px)

  // คำนวณขนาดวงกลมใหม่ทุกครั้งที่หน้าจอเปลี่ยน (หมุนจอ / ย่อขยายหน้าต่างบนคอม)
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // จอเตี้ย (มือถือแนวนอน) ต้องเหลือที่ให้ปุ่มด้านล่าง
      const room = h < 600 ? h - 230 : h * 0.55;
      setV(Math.round(Math.max(140, Math.min(w - 48, room, 480))));
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
    };
  }, []);

  useEffect(() => {
    if (shot) return;
    let cancelled = false;
    setReady(false);
    setErr(null);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("unsupported");
        }
        // ขอสัดส่วน 4:3 ซึ่งเป็นเต็มเซนเซอร์ของกล้องส่วนใหญ่ มุมภาพกว้างไม่โดนครอป
        // (ห้ามขอตามสัดส่วนหน้าจอ เพราะเบราว์เซอร์จะครอปด้านข้างจนภาพซูม)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: cam,
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setErr("เปิดกล้องไม่ได้ ตรวจสอบสิทธิ์กล้องของเบราว์เซอร์แล้วลองใหม่");
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cam, shot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ล็อกพื้นหลังไม่ให้เลื่อนระหว่างถ่าย
  // (ตัวที่เลื่อนจริงคือ div ใน Shell ไม่ใช่ body จึงล็อกทั้งสองที่)
  useEffect(() => {
    const els = [
      document.body,
      ...Array.from(
        document.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"]')
      ).filter((el) => !overlayRef.current?.contains(el)),
    ];
    const prev = els.map((el) => el.style.overflow);
    els.forEach((el) => {
      el.style.overflow = "hidden";
    });
    return () => {
      els.forEach((el, i) => {
        el.style.overflow = prev[i];
      });
    };
  }, []);

  const mirror = cam === "user";

  // ขนาดภาพที่แสดงในวงกลม: ด้านสั้นของภาพเต็มวงกลมพอดี แล้วคูณซูม
  const s = shot ? (V / Math.min(shot.w, shot.h)) * zoom : 1;
  const maxX = shot ? Math.max(0, (shot.w * s - V) / 2) : 0;
  const maxY = shot ? Math.max(0, (shot.h * s - V) / 2) : 0;
  const clamp = (n: number, m: number) => Math.max(-m, Math.min(m, n));
  const ox = clamp(off.x, maxX);
  const oy = clamp(off.y, maxY);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * k);
    const h = Math.round(v.videoHeight * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) {
      setErr("ถ่ายรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    const img = new Image();
    img.onload = () => {
      setOff({ x: 0, y: 0 });
      setZoom(1);
      setShot({ img, w, h });
    };
    img.src = c.toDataURL("image/jpeg", 0.92);
  };

  const confirm = () => {
    if (!shot) return;
    const r = AVATAR_SIZE / V;
    const dw = shot.w * s * r;
    const dh = shot.h * s * r;
    const c = document.createElement("canvas");
    c.width = AVATAR_SIZE;
    c.height = AVATAR_SIZE;
    const ctx = c.getContext("2d");
    if (!ctx) {
      setErr("บันทึกรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }
    ctx.drawImage(
      shot.img,
      AVATAR_SIZE / 2 + ox * r - dw / 2,
      AVATAR_SIZE / 2 + oy * r - dh / 2,
      dw,
      dh
    );
    onCapture(c.toDataURL("image/jpeg", 0.85));
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox, oy };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOff({
      x: clamp(d.ox + e.clientX - d.px, maxX),
      y: clamp(d.oy + e.clientY - d.py, maxY),
    });
  };
  const onUp = () => {
    dragRef.current = null;
  };

  // วาดผ่าน portal ไปที่ body เพื่อให้อยู่กลางจอจริง ไม่ถูก transform ของการ์ดแม่กระทบ
  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="ถ่ายรูปโปรไฟล์"
      className={`pj-in fixed left-0 top-0 z-50 w-full overflow-hidden overscroll-none text-white ${
        shot ? "bg-black" : "bg-black/95"
      }`}
      style={{ height: "100dvh" }}
    >
      {shot ? (
        /* ขั้นเลื่อนเลือกตำแหน่งในวงกลม */
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 sm:gap-5"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          <div
            className="relative touch-none select-none overflow-hidden rounded-full bg-[#1B2A21] ring-4 ring-[#C9F25B] active:cursor-grabbing"
            style={{ width: V, height: V, cursor: "grab" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.img.src}
              alt="ตัวอย่างรูปโปรไฟล์"
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: shot.w * s,
                height: shot.h * s,
                left: V / 2 - (shot.w * s) / 2 + ox,
                top: V / 2 - (shot.h * s) / 2 + oy,
              }}
            />
          </div>

          <p className="text-center text-[13px] text-white/70">
            ลากเพื่อเลื่อนหาตำแหน่งที่ต้องการ
          </p>

          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="ซูม"
            className="w-full max-w-xs cursor-pointer accent-[#C9F25B]"
          />

          {err && <p className="text-center text-[13px] text-[#FF8A80]">{err}</p>}

          <div className="flex w-full max-w-xs gap-2">
            <button
              onClick={() => setShot(null)}
              className="h-12 flex-1 rounded-full bg-white/15 text-[15px] font-semibold transition-all hover:bg-white/25 active:scale-[0.98]"
            >
              ถ่ายใหม่
            </button>
            <button
              onClick={confirm}
              className="h-12 flex-1 rounded-full bg-[#C9F25B] text-[15px] font-semibold text-[#1B2A21] transition-all hover:bg-[#D6F77F] active:scale-[0.98] active:bg-[#B8E348]"
            >
              ใช้รูปนี้
            </button>
          </div>
        </div>
      ) : (
        /* ขั้นถ่าย: กรอบวงกลมเหมือนหน้าสมัคร */
        <div
          className="flex h-full w-full flex-col items-center justify-center px-6"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          <p className="mb-4 text-center text-[15px] font-semibold text-white/90 sm:mb-5">
            จัดหน้าให้อยู่ในวงกลม
          </p>

          <div
            className="relative overflow-hidden rounded-full bg-[#1B2A21] ring-4 ring-[#C9F25B]"
            style={{ width: V, height: V }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: mirror ? "scaleX(-1)" : undefined }}
            />
            {!ready && !err && (
              <span className="pj-pulse absolute inset-0 flex items-center justify-center text-[14px] text-white/70">
                กำลังเปิดกล้อง
              </span>
            )}
          </div>

          {err && (
            <p
              role="alert"
              className="mt-5 max-w-xs rounded-2xl bg-[#FDE8E6] px-4 py-3 text-center text-[14px] text-[#D92D20]"
            >
              {err}
            </p>
          )}

          <div className="mt-6 flex w-full max-w-xs items-center justify-between sm:mt-8">
            <button
              type="button"
              onClick={onClose}
              className="h-11 min-w-[84px] rounded-full px-4 text-[15px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={snap}
              disabled={!ready || !!err}
              aria-label="ถ่ายรูป"
              className="h-[72px] w-[72px] rounded-full bg-white ring-4 ring-[#C9F25B] ring-offset-2 ring-offset-black transition-transform enabled:hover:scale-105 active:scale-90 disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => setCam((c) => (c === "user" ? "environment" : "user"))}
              className="h-11 min-w-[84px] rounded-full px-4 text-[15px] font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              สลับกล้อง
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* การ์ดโปรไฟล์                                                          */
/* ------------------------------------------------------------------ */

function ProfileCard({
  user,
  facing,
  onUserChange,
}: {
  user: User;
  facing: "user" | "environment";
  onUserChange: (patch: Partial<User>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  // รูปที่เลือก/ถ่ายใหม่ แต่ยังไม่กดบันทึก (null = ไม่ได้เปลี่ยน)
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  // รูปที่เพิ่งบันทึกสำเร็จ ใช้โชว์ต่อจนกว่ารูปจาก Drive จะโหลดได้
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  // เมนูเลือกรูป / ถ่ายรูป (เปิดเมื่อกดรูปโปรไฟล์หรือไอคอนดินสอ)
  const [pickerOpen, setPickerOpen] = useState(false);

  // ซิงก์ชื่อเมื่อ user เปลี่ยนจากภายนอก (เช่น ล็อกอินบัญชีอื่น)
  useEffect(() => {
    setName(user.name);
    setDraftAvatar(null);
  }, [user.name, user.username]);

  // เปลี่ยนบัญชี ล้างรูปที่เก็บไว้ชั่วคราว
  useEffect(() => {
    setSavedAvatar(null);
  }, [user.username]);

  // Esc ปิดเมนูเลือกรูป
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const trimmed = name.trim();
  const nameLen = Array.from(trimmed).length;
  const nameValid = nameLen >= 1 && nameLen <= NAME_MAX;
  const nameChanged = trimmed !== user.name;
  const avatarChanged = draftAvatar !== null;
  const dirty = nameChanged || avatarChanged;
  const canSave = dirty && nameValid && !busy;

  // บริษัท / แผนก / สาขา ที่เลือกตอนสมัคร (แสดงอย่างเดียว) ต้องมี id เหล่านี้อยู่ใน user
  const orgUser = user as User & {
    companyId?: number | null;
    departmentId?: number | null;
    branchId?: number | null;
  };
  const org = orgOf(orgUser);
  const branch = getBranch(orgUser.branchId);
  // มีแผนก = สำนักงานใหญ่ / มีแต่สาขา = หน้าร้าน (ตรงกับตอนสมัครและการ์ดแผนก)
  const workplace = org.department
    ? "สำนักงานใหญ่"
    : branch
      ? "หน้าร้าน"
      : null;
  const code = branch ? branchCode(branch) : null;
  const province = branch ? branchProvince(branch) : null;
  const region = branch ? branchRegion(branch) : null;
  const orgRows: [string, string][] = [];
  if (user.employeeId) orgRows.push(["รหัสพนักงาน", user.employeeId]);
  if (org.company) orgRows.push(["บริษัท", org.company]);
  if (workplace) orgRows.push(["ที่ทำงาน", workplace]);
  if (org.department) orgRows.push(["แผนก", org.department]);
  if (branch) {
    orgRows.push(["สาขา", branchLabel(branch)]);
    if (code) orgRows.push(["รหัสสาขา", `ID ${code}`]);
    if (province)
      orgRows.push(["จังหวัด", region ? `${province} · ${region}` : province]);
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg({ ok: false, text: "เลือกไฟล์รูปภาพเท่านั้น" });
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      const url = toAvatar(bmp, bmp.width, bmp.height);
      bmp.close();
      setDraftAvatar(url);
      setMsg(null);
    } catch {
      setMsg({ ok: false, text: "อ่านรูปนี้ไม่ได้ ลองรูปอื่น (JPG/PNG)" });
    }
  };

  const onCaptured = (dataUrl: string) => {
    setCamOpen(false);
    setDraftAvatar(dataUrl);
    setMsg(null);
  };

  const reset = () => {
    setName(user.name);
    setDraftAvatar(null);
    setMsg(null);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setMsg(null);
    try {
      // ส่งเป็น FormData + ไฟล์จริง เหมือนตอนสมัครสมาชิก (server อัปโหลดขึ้น Drive)
      const fd = new FormData();
      if (nameChanged) fd.append("nickname", trimmed);
      if (avatarChanged && draftAvatar) {
        const blob = await (await fetch(draftAvatar)).blob();
        fd.append("avatar", blob, "avatar.jpg");
      }
      const r = await fetch("/api/profile", {
        method: "PATCH",
        body: fd,
      });
      const d = (await r.json().catch(() => null)) as {
        user?: { name?: string; avatarUrl?: string | null };
        error?: string;
      } | null;
      if (!r.ok || !d?.user) {
        setMsg({ ok: false, text: d?.error ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" });
        return;
      }
      onUserChange({
        name: d.user.name ?? user.name,
        // type User.avatarUrl เป็น string | undefined (ไม่รับ null)
        avatarUrl: d.user.avatarUrl ?? undefined,
      });
      setName(d.user.name ?? trimmed);
      if (draftAvatar) setSavedAvatar(draftAvatar);
      setDraftAvatar(null);
      setMsg({ ok: true, text: "บันทึกแล้ว" });
    } catch {
      setMsg({ ok: false, text: "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${card} p-4 sm:p-6`}>
      <h2 className="text-[15px] font-semibold">โปรไฟล์</h2>

      <div className="mt-4 flex flex-col items-center text-center">
        <div className="relative">
          {/* มือถือ 176px / จอใหญ่ขึ้น 224px กดที่รูปหรือไอคอนดินสอเพื่อเปลี่ยนรูป */}
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={busy}
            aria-label="เปลี่ยนรูปโปรไฟล์"
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
            className="group relative block rounded-full transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            <span
              className={`block h-44 w-44 rounded-full sm:h-56 sm:w-56 ${
                avatarChanged ? "ring-4 ring-[#C9F25B] ring-offset-2" : ""
              }`}
            >
              <Avatar
                name={user.name}
                src={draftAvatar ?? savedAvatar ?? user.avatarUrl}
                fill
                className="text-7xl sm:text-8xl"
              />
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21] shadow-lg ring-4 ring-white transition-transform group-hover:scale-105 sm:bottom-2 sm:right-2"
            >
              <Icon d={PENCIL} size={20} />
            </span>
          </button>

          {pickerOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setPickerOpen(false)}
              />
              <div
                role="menu"
                className="pj-in absolute left-1/2 top-full z-20 mt-2 w-52 -translate-x-1/2 overflow-hidden rounded-2xl bg-white text-left shadow-xl ring-1 ring-black/5"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setPickerOpen(false);
                    fileRef.current?.click();
                  }}
                  className="flex h-12 w-full items-center px-5 text-[15px] font-semibold transition-colors hover:bg-[#EEF2E4] active:bg-[#E3EAD6]"
                >
                  เลือกรูป
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setPickerOpen(false);
                    setCamOpen(true);
                  }}
                  className="flex h-12 w-full items-center border-t border-[#EEF2E4] px-5 text-[15px] font-semibold transition-colors hover:bg-[#EEF2E4] active:bg-[#E3EAD6]"
                >
                  ถ่ายรูปใหม่
                </button>
              </div>
            </>
          )}
        </div>
        <div className="mt-3 max-w-full truncate text-[18px] font-semibold sm:text-[20px]">
          {user.name}
        </div>
        {user.username && (
          <div className="max-w-full truncate text-[12px] text-[#6B7A6E] sm:text-[13px]">
            @{user.username}
          </div>
        )}
        {avatarChanged && (
          <span className="mt-2 rounded-full bg-[#E8F5C1] px-3 py-1 text-[12px] font-semibold text-[#3F5E1F]">
            รูปใหม่ กดบันทึกเพื่อใช้งาน
          </span>
        )}
      </div>

      {orgRows.length > 0 && (
        <dl className="mt-4 divide-y divide-[#E3EAD6] overflow-hidden rounded-2xl bg-[#EEF2E4] text-[14px]">
          {orgRows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 px-4 py-2.5"
            >
              <dt className="shrink-0 text-[#6B7A6E]">{label}</dt>
              <dd className="min-w-0 break-words text-right font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />

      <div className="mt-5">
        <label
          htmlFor="profile-name"
          className="px-1 text-[12px] font-medium text-[#6B7A6E]"
        >
          ชื่อที่แสดง
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMsg(null);
          }}
          maxLength={NAME_MAX * 2}
          autoComplete="off"
          className="mt-1 h-12 w-full rounded-full bg-[#EEF2E4] px-5 text-[16px] font-medium text-[#1B2A21] outline-none ring-2 ring-transparent transition-shadow placeholder:text-[#A9B79A] hover:bg-[#E8EEDB] focus:bg-white focus:ring-[#3F5E1F]"
        />
        <div className="mt-1 flex items-center justify-between px-1 text-[11px]">
          <span
            className={
              nameLen > NAME_MAX || (name.length > 0 && nameLen === 0)
                ? "text-[#D92D20]"
                : "text-[#6B7A6E]"
            }
          >
            {nameLen}/{NAME_MAX} ตัวอักษร
          </span>
        </div>
      </div>

      <button
        onClick={save}
        disabled={!canSave}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 enabled:hover:bg-[#D6F77F] active:scale-[0.98] active:bg-[#B8E348] disabled:bg-[#E3EAD6] disabled:text-[#A9B79A]"
      >
        {busy ? "กำลังบันทึก" : "บันทึก"}
      </button>
      {dirty && !busy && (
        <button
          onClick={reset}
          className="mt-2 h-10 w-full rounded-full text-[14px] font-semibold text-[#3F5E1F] transition-colors hover:bg-[#EEF2E4] active:opacity-60"
        >
          ยกเลิกการเปลี่ยนแปลง
        </button>
      )}

      {msg && !busy && (
        <p
          role="status"
          className={`mt-2 text-center text-[13px] font-medium ${
            msg.ok ? "text-[#3F5E1F]" : "text-[#D92D20]"
          }`}
        >
          {msg.text}
        </p>
      )}

      {camOpen && (
        <CameraModal
          initialFacing={facing}
          onCapture={onCaptured}
          onClose={() => setCamOpen(false)}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าตั้งค่า                                                           */
/* มือถือ/แท็บเล็ตแนวตั้ง: คอลัมน์เดียว / จอ lg ขึ้นไป: 2 คอลัมน์        */
/* (โปรไฟล์ซ้าย, ตัวเลือกขวา)                                            */
/* ------------------------------------------------------------------ */

export default function Setting({
  user,
  onUserChange,
  facing,
  onFacing,
  sound,
  onSound,
  onLogout,
}: {
  user: User | null;
  onUserChange: (patch: Partial<User>) => void;
  facing: "user" | "environment";
  onFacing: (v: "user" | "environment") => void;
  sound: boolean;
  onSound: (v: boolean) => void;
  // ออกจากระบบ (page.tsx ส่งฟังก์ชันที่ใช้อยู่แล้วเข้ามา)
  onLogout: () => void;
}) {
  return (
    <>
      <h1 className="text-[30px] font-bold tracking-tight lg:text-[36px]">
        ตั้งค่า
      </h1>
      <div className="mx-auto mt-5 grid w-full max-w-md gap-4 sm:max-w-lg lg:mx-0 lg:mt-6 lg:max-w-4xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {user && (
          <ProfileCard user={user} facing={facing} onUserChange={onUserChange} />
        )}

        <div
          className={`space-y-4 ${user ? "" : "lg:col-span-2 lg:max-w-sm"}`}
        >
          <ul className={`${card} divide-y divide-[#EEF2E4]`}>
            <li className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-4">
              <span className="text-[16px]">กล้อง</span>
              <div className="w-40">
                <Segmented<"user" | "environment">
                  small
                  value={facing}
                  onChange={onFacing}
                  options={
                    [
                      ["user", "หน้า"],
                      ["environment", "หลัง"],
                    ] as const
                  }
                />
              </div>
            </li>
            <li className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-4">
              <span className="text-[16px]">เสียงนับและเตือน</span>
              <Switch on={sound} onChange={onSound} label="เสียงนับและเตือน" />
            </li>
          </ul>

          <button
            onClick={onLogout}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-[#D92D20] transition-all hover:bg-[#FDE8E6] active:scale-[0.98]"
          >
            <Icon d={ICONS.logout} size={18} />
            ออกจากระบบ
          </button>
        </div>
      </div>
    </>
  );
}