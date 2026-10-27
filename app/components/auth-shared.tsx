"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* ของที่ใช้ร่วมกันระหว่าง page.tsx / login / register                  */
/* ------------------------------------------------------------------ */

export const APP_NAME = "Daily Jump Challenge – ท้าให้กระโดด ลุ้นให้ได้แต้ม";
// ชื่อสั้นสำหรับแสดงใน UI กันล้น APP_NAME เต็มใช้กับ document.title / meta
export const APP_SHORT = "ท้าให้กระโดด ลุ้นให้ได้แต้ม";

// point: 100 คนแรกของวันที่ทำเป้าหมายรายวันสำเร็จ ได้ 50 point (คำนวณฝั่งเซิร์ฟเวอร์)
export const POINT_QUOTA = 100;
export const POINT_REWARD = 50;

// แบนที่ยังมีผลอยู่ (มาจาก /api/auth/me) null/ไม่มี = ไม่ถูกแบน
export type UserBan = {
  id: string;
  reason: string;
  bannedAt: number;
  expiresAt: number;
  day: string;
  active: boolean;
};

export type User = {
  name: string;
  username?: string;
  employeeId?: string; // รหัสพนักงาน
  avatarUrl?: string; // เพิ่มฟิลด์รูปโปรไฟล์สำหรับแสดงผล
  points?: number;
  companyId?: number | null; // รหัสบริษัท (ดู departments.ts)
  departmentId?: number | null; // รหัสแผนก (ดู departments.ts)
  branchId?: number | null; // รหัสสาขา (ดู branches.ts)
  ban?: UserBan | null; // ถูกแบนอยู่หรือไม่
};

export type AuthMode = "login" | "register" | "forgot";

export type AuthErrors = Partial<
  Record<
    | "nickname"
    | "username"
    | "employeeId"
    | "password"
    | "confirm"
    | "companyId"
    | "departmentId"
    | "branchId"
    | "form",
    string
  >
>;

// props ของหน้า login / register / forgot (ส่งมาจาก app/page.tsx)
export type AuthFormProps = {
  onAuthed: (u: User) => void;
  onSwitch: (m: AuthMode) => void;
};

export const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chart: "M5 20V11M12 20V4M19 20v-6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4",
  play: "M7 4l13 8-13 8z",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 13l4 4 10-10",
  flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  down: "M12 4v15M6 13l6 6 6-6",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z",
  user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout:
    "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff:
    "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
};

export function Icon({
  d,
  size = 22,
  fill,
}: {
  d: string;
  size?: number;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

// โลโก้แอป: รูปจาก public/img/logo.png พื้นหลังโปร่งใส ไม่ตัดกรอบ
export function Logo({
  size = 32,
  className = "",
  src = "/img/logo.png",
}: {
  size?: number;
  className?: string;
  src?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 border-0 bg-transparent object-contain shadow-none outline-none ring-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// โลโก้หน้า login/register: ไม่มีกรอบวงกลม แสดงโลโก้เต็มขนาด
export function AuthLogo({
  size = 160,
  src = "/img/logo.png",
}: {
  size?: number;
  src?: string;
}) {
  return <Logo size={size} src={src} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div
      className="grid rounded-full bg-[#E3EAD6] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full font-semibold transition-all duration-200 ${
            small ? "h-8 text-[14px]" : "h-10 text-[15px]"
          } ${value === v ? "bg-white text-[#1B2A21] shadow-sm" : "text-[#6B7A6E]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  error,
  hint,
  maxLength,
  autoFocus,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  autoFocus?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-white/80 lg:text-[#6B7A6E]">
        {label}
      </span>
      <span className="relative block">
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!error}
          className={`h-12 w-full select-text rounded-2xl bg-white px-4 text-[16px] text-[#1B2A21] outline-none ring-2 transition-shadow placeholder:text-[#A9B79A] focus:ring-[#C9F25B] ${
            error ? "ring-[#D92D20]/60" : "ring-transparent"
          } ${trailing ? "pr-12" : ""}`}
        />
        {trailing && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        )}
      </span>
      {error ? (
        <span role="alert" className="pj-in mt-1.5 block text-[12px] text-[#FFB4AB] lg:text-[#D92D20]">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-white/70 lg:text-[#6B7A6E]">{hint}</span>
      ) : null}
    </label>
  );
}

// ช่องเลือก (dropdown) หน้าตาเหมือน Field — ใช้เลือกแผนก
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-white/80 lg:text-[#6B7A6E]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={`h-12 w-full select-text rounded-2xl bg-white px-4 text-[16px] outline-none ring-2 transition-shadow focus:ring-[#C9F25B] ${
          error ? "ring-[#D92D20]/60" : "ring-transparent"
        } ${value ? "text-[#1B2A21]" : "text-[#A9B79A]"}`}
      >
        <option value="">{placeholder ?? "เลือก"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-[#1B2A21]">
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="pj-in mt-1.5 block text-[12px] text-[#FFB4AB] lg:text-[#D92D20]">
          {error}
        </span>
      )}
    </label>
  );
}

// ปุ่มตาแสดง/ซ่อนรหัสผ่าน
export function EyeButton({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-[#6B7A6E] transition-colors hover:bg-[#F3F6EC] active:scale-90"
    >
      <Icon d={show ? ICONS.eyeOff : ICONS.eye} size={20} />
    </button>
  );
}

// โครงหน้า login/register/forgot: พื้นหลัง + แผงแบรนด์ (เดสก์ท็อป) + โลโก้ (มือถือ)
// title: ป้ายสำหรับโปรแกรมอ่านหน้าจอ (ไม่ใส่ = ใช้ "สมัครสมาชิก" / "เข้าสู่ระบบ" ตาม isReg)
export function AuthShell({
  isReg,
  title,
  children,
}: {
  isReg: boolean;
  title?: string;
  children: ReactNode;
}) {
  const [imgOk, setImgOk] = useState(true);

  const perks = [
    "นับการกระโดดอัตโนมัติด้วยกล้อง",
    "ตั้งเป้าหมายรายวัน ดูความคืบหน้า",
    "ปฏิทินติ๊กถูกทุกวันที่ทำถึงเป้า",
    `${POINT_QUOTA} คนแรกที่ถึงเป้าทุกวัน รับ ${POINT_REWARD} point`,
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? (isReg ? "สมัครสมาชิก" : "เข้าสู่ระบบ")}
      className="pj-in fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-gradient-to-t from-[#1B2A21] to-[#8FB54A] text-white lg:grid lg:grid-cols-[1fr_1fr] lg:bg-none lg:bg-[#F3F6EC] lg:text-[#1B2A21]"
    >
      <div className="pointer-events-none fixed inset-0 lg:hidden" aria-hidden>
        {imgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/img/jump.PNG"
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A21] via-[#1B2A21]/90 via-50% to-[#3F5E1F]/10" />
      </div>

      <aside className="hidden flex-col justify-between bg-[#1B2A21] p-12 text-white lg:flex">
        <div className="flex min-w-0 flex-col items-start gap-3">
          <AuthLogo size={128} />
          <span className="min-w-0 text-[22px] font-bold leading-tight tracking-tight text-[#C9F25B]">
            {APP_SHORT}
          </span>
        </div>
        <div>
          <h2 className="text-[48px] font-bold leading-[1.1] tracking-tight">
            โดดทุกวัน
            <br />
            <span className="text-[#C9F25B]">สร้างสถิติใหม่</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[16px] text-white/80">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                  <Icon d={ICONS.check} size={14} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-white/50">
          สถิติของคุณซิงก์ข้ามอุปกรณ์ได้
        </p>
      </aside>

      <div className="relative flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] lg:px-12">
        <div className="flex flex-col items-center gap-3 pt-4 lg:hidden">
          <AuthLogo size={220} src="/img/logo.png" />
          <span className="max-w-full text-center text-[22px] font-bold leading-tight tracking-tight text-[#C9F25B]">
            {APP_SHORT}
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}