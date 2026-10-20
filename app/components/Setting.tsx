"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS, Icon, Segmented } from "./auth-shared";
import type { User } from "./auth-shared";

/* ------------------------------------------------------------------ */
/* หน้าตั้งค่า (แท็บ "ตั้งค่า")                                          */
/* โปรไฟล์: เปลี่ยนรูป (เลือกไฟล์ / ถ่ายใหม่ / ลบ) และเปลี่ยนชื่อ          */
/* ------------------------------------------------------------------ */

const card = "rounded-3xl bg-white pj-lift";
const NAME_MAX = 20;
const AVATAR_SIZE = 512; // px ย่อรูปก่อนอัปโหลดขึ้น Drive (ครอปกลางเป็นสี่เหลี่ยมจัตุรัส)

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

function Avatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src?: string | null;
  size?: number;
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
        className="shrink-0 rounded-full object-cover bg-[#1B2A21]"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[#1B2A21] font-semibold text-[#C9F25B]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
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
        on ? "bg-[#3F5E1F]" : "bg-[#D5DCC8]"
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

function CameraModal({
  initialFacing,
  onCapture,
  onClose,
}: {
  initialFacing: "user" | "environment";
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState(initialFacing);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<string | null>(null);

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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: cam,
            width: { ideal: 720 },
            height: { ideal: 720 },
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

  const mirror = cam === "user";

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      setShot(toAvatar(v, v.videoWidth, v.videoHeight, mirror));
    } catch {
      setErr("ถ่ายรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ถ่ายรูปโปรไฟล์"
      className="pj-in fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A21]/90 p-5"
    >
      <div className="w-full max-w-sm rounded-[32px] bg-[#F3F6EC] p-5 text-[#1B2A21] shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">ถ่ายรูปโปรไฟล์</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white transition-transform active:scale-90"
          >
            <Icon d={ICONS.close} size={16} />
          </button>
        </div>

        <div className="relative mx-auto mt-4 aspect-square w-full overflow-hidden rounded-full bg-[#1B2A21]">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shot}
              alt="ตัวอย่างรูปโปรไฟล์"
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: mirror ? "scaleX(-1)" : undefined }}
            />
          )}
          {!shot && !ready && !err && (
            <div className="pj-pulse absolute inset-0 flex items-center justify-center text-[13px] text-white/70">
              กำลังเปิดกล้อง
            </div>
          )}
        </div>

        {err && (
          <p className="mt-3 text-center text-[13px] text-[#D92D20]">{err}</p>
        )}

        {shot ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShot(null)}
              className="h-12 flex-1 rounded-full bg-white text-[15px] font-semibold transition-transform active:scale-[0.98]"
            >
              ถ่ายใหม่
            </button>
            <button
              onClick={() => onCapture(shot)}
              className="h-12 flex-1 rounded-full bg-[#C9F25B] text-[15px] font-semibold transition-all active:scale-[0.98] active:bg-[#B8E348]"
            >
              ใช้รูปนี้
            </button>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setCam((c) => (c === "user" ? "environment" : "user"))}
              className="h-12 rounded-full bg-white px-5 text-[15px] font-semibold transition-transform active:scale-[0.98]"
            >
              สลับกล้อง
            </button>
            <button
              onClick={snap}
              disabled={!ready}
              className="h-12 flex-1 rounded-full bg-[#C9F25B] text-[15px] font-semibold transition-all active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-40"
            >
              ถ่ายรูป
            </button>
          </div>
        )}
      </div>
    </div>
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

  // ซิงก์ชื่อเมื่อ user เปลี่ยนจากภายนอก (เช่น ล็อกอินบัญชีอื่น)
  useEffect(() => {
    setName(user.name);
    setDraftAvatar(null);
  }, [user.name, user.username]);

  // เปลี่ยนบัญชี ล้างรูปที่เก็บไว้ชั่วคราว
  useEffect(() => {
    setSavedAvatar(null);
  }, [user.username]);

  const trimmed = name.trim();
  const nameLen = Array.from(trimmed).length;
  const nameValid = nameLen >= 1 && nameLen <= NAME_MAX;
  const nameChanged = trimmed !== user.name;
  const avatarChanged = draftAvatar !== null;
  const dirty = nameChanged || avatarChanged;
  const canSave = dirty && nameValid && !busy;

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
    <section className={`${card} p-5`}>
      <h2 className="text-[15px] font-semibold">โปรไฟล์</h2>

      <div className="mt-4 flex flex-col items-center text-center">
        <div className="relative">
          <span
            className={`block rounded-full ${
              avatarChanged ? "ring-4 ring-[#C9F25B] ring-offset-2" : ""
            }`}
          >
            <Avatar
              name={user.name}
              src={draftAvatar ?? savedAvatar ?? user.avatarUrl}
              size={96}
            />
          </span>
        </div>
        <div className="mt-3 max-w-full truncate text-[18px] font-semibold">
          {user.name}
        </div>
        {user.username && (
          <div className="max-w-full truncate text-[12px] text-[#6B7A6E]">
            @{user.username}
          </div>
        )}
        {avatarChanged && (
          <span className="mt-2 rounded-full bg-[#E8F5C1] px-3 py-1 text-[12px] font-semibold text-[#3F5E1F]">
            รูปใหม่ กดบันทึกเพื่อใช้งาน
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="h-11 rounded-full bg-[#EEF2E4] text-[14px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
        >
          เลือกรูป
        </button>
        <button
          onClick={() => setCamOpen(true)}
          disabled={busy}
          className="h-11 rounded-full bg-[#1B2A21] text-[14px] font-semibold text-[#C9F25B] transition-transform active:scale-[0.97] disabled:opacity-40"
        >
          ถ่ายรูปใหม่
        </button>
      </div>
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
          className="mt-1 h-12 w-full rounded-full bg-[#EEF2E4] px-5 text-[16px] font-medium text-[#1B2A21] outline-none ring-2 ring-transparent transition-shadow placeholder:text-[#A9B79A] focus:bg-white focus:ring-[#3F5E1F]"
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
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:bg-[#E3EAD6] disabled:text-[#A9B79A]"
      >
        {busy ? "กำลังบันทึก" : "บันทึก"}
      </button>
      {dirty && !busy && (
        <button
          onClick={reset}
          className="mt-2 h-10 w-full rounded-full text-[14px] font-semibold text-[#3F5E1F] active:opacity-60"
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
/* ------------------------------------------------------------------ */

export default function Setting({
  user,
  onUserChange,
  facing,
  onFacing,
  sound,
  onSound,
  onClearHistory,
}: {
  user: User | null;
  onUserChange: (patch: Partial<User>) => void;
  facing: "user" | "environment";
  onFacing: (v: "user" | "environment") => void;
  sound: boolean;
  onSound: (v: boolean) => void;
  onClearHistory: () => void;
}) {
  return (
    <>
      <h1 className="text-[30px] font-bold tracking-tight lg:text-[36px]">
        ตั้งค่า
      </h1>
      <div className="mt-5 space-y-4 lg:max-w-md">
        {user && (
          <ProfileCard user={user} facing={facing} onUserChange={onUserChange} />
        )}

        <div className="space-y-4">
          <ul className={`${card} divide-y divide-[#EEF2E4]`}>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
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
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[16px]">เสียงนับและเตือน</span>
              <Switch on={sound} onChange={onSound} label="เสียงนับและเตือน" />
            </li>
          </ul>

          <button
            onClick={() => {
              if (window.confirm("ลบประวัติการกระโดดทั้งหมด?")) onClearHistory();
            }}
            className="h-12 w-full rounded-full bg-white text-[15px] font-semibold text-[#D92D20] transition-transform active:scale-[0.98]"
          >
            ล้างประวัติ
          </button>
        </div>
      </div>
    </>
  );
}