"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  Ref,
} from "react";
import { EyeButton, Field } from "./auth-shared";
import type {
  AuthErrors,
  AuthFormProps,
  User,
} from "./auth-shared";
import { COMPANIES, DEPARTMENTS, departmentsOf, getCompany } from "./departments";
import {
  branchCode,
  branchesOf,
  branchFullLabel,
  branchLabel,
  branchProvince,
  branchRegion,
  getBranch,
} from "./branches";

/* ------------------------------------------------------------------ */
/* ค่าคงที่ / ตัวช่วย                                                    */
/* ------------------------------------------------------------------ */

// ลำดับขั้น: 0 ชื่อเล่น → 1 บริษัท → 2 ที่ทำงาน (สำนักงานใหญ่/หน้าร้าน) → 3 แผนกหรือสาขา → 4 บัญชี → 5 โปรไฟล์
// ขั้น 2 จะข้ามไปเองถ้าบริษัทนั้นมีแค่แผนกหรือแค่สาขาอย่างเดียว
const STEPS = ["ชื่อเล่น", "บริษัท", "ที่ทำงาน", "แผนก/สาขา", "บัญชี", "โปรไฟล์"] as const;
// ข้อความใต้วงกลมแต่ละขั้น: บอกว่าผู้ใช้ต้องทำอะไร (ขั้น 3 เปลี่ยนเป็น "เลือกสาขา" ตอนเลือกหน้าร้าน)
const STEP_LABELS = [
  "ใส่ชื่อเล่น",
  "เลือกบริษัท",
  "ที่ทำงาน",
  "เลือกแผนก",
  "ตั้งรหัสผ่าน",
  "เพิ่มรูป",
] as const;
const LAST_STEP = STEPS.length - 1; // 5 = หน้าตั้งค่าโปรไฟล์
const WELCOME = STEPS.length; // 6 = หน้า welcome

// สาขาที่แสดงก่อนพิมพ์ค้นหา (Com7 มี 1,000+ สาขา)
const BRANCH_PREVIEW = 80;

type Mate = { name: string; username: string; avatarUrl: string | null };
type Mates = { count: number; members: Mate[] };
// รายการเลือก (บริษัท / แผนก / สาขา ใช้โครงเดียวกัน)
type Item = { id: number; label: string; sub?: string };
// สำนักงานใหญ่ = เลือกแผนก / หน้าร้าน = เลือกสาขา
type Place = "hq" | "store";

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// ตัวอักษรของ q เรียงอยู่ใน h ตามลำดับ (พิมพ์ย่อก็เจอ เช่น "acc" → "accounting")
const isSubseq = (q: string, h: string) => {
  let i = 0;
  for (const c of h) if (c === q[i] && ++i === q.length) return true;
  return false;
};

// คะแนนความใกล้เคียง: 0 ขึ้นต้นตรง, 1 มีคำนี้อยู่ข้างใน, 2 พิมพ์ย่อ, -1 ไม่ตรง
function matchScore(q: string, texts: string[]): number {
  let best = -1;
  for (const raw of texts) {
    const h = fold(raw);
    let s = -1;
    if (h.startsWith(q)) s = 0;
    else if (h.includes(q)) s = 1;
    else if (q.length >= 2 && isSubseq(q, h)) s = 2;
    if (s >= 0 && (best < 0 || s < best)) best = s;
  }
  return best;
}

// กรอง + เรียงรายการตามที่พิมพ์ (ใกล้เคียงที่สุดขึ้นก่อน)
function searchItems(query: string, list: Item[]): Item[] {
  const q = fold(query);
  if (!q) return list;
  return list
    .map((x) => ({ x, s: matchScore(q, [x.label, x.sub ?? ""]) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s || a.x.label.length - b.x.label.length)
    .map((r) => r.x);
}

// step ที่มี error ของฟิลด์นั้นอยู่ (ไว้เด้งกลับไปแก้เมื่อเซิร์ฟเวอร์ตีกลับ)
const stepOfErrors = (e: AuthErrors): number | null =>
  e.nickname
    ? 0
    : e.companyId
      ? 1
      : e.departmentId || e.branchId
        ? 3
        : e.username || e.password || e.confirm
          ? 4
          : null;

/* ------------------------------------------------------------------ */
/* ส่วนประกอบย่อย                                                        */
/* ------------------------------------------------------------------ */

function Avatar({
  name,
  src,
  size,
}: {
  name: string;
  src?: string | null;
  size: number;
}) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setErr(true)}
        className="block shrink-0 rounded-full bg-[#1B2A21] object-cover"
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
      {(Array.from(name.trim())[0] ?? "?").toUpperCase()}
    </span>
  );
}

// รายการให้เลือก (ใช้ร่วมกันทั้งบริษัท / แผนก / สาขา)
function PickList({
  items,
  selectedId,
  hi,
  onHover,
  onPick,
  listRef,
  limit,
  label,
}: {
  items: Item[];
  selectedId: string;
  hi: number;
  onHover: (i: number) => void;
  onPick: (id: number) => void;
  listRef?: Ref<HTMLDivElement>;
  limit?: number;
  label: string;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="relative -mx-2 mt-3 max-h-[min(52dvh,460px)] overflow-y-auto rounded-2xl bg-white text-[#1B2A21] shadow-lg ring-1 ring-black/5 sm:-mx-3"
    >
      {shown.length === 0 ? (
        <p className="px-4 py-5 text-center text-[14px] text-[#6B7A6E]">
          ไม่พบรายการที่ตรงกัน ลองพิมพ์คำอื่น
        </p>
      ) : (
        shown.map((it, i) => {
          const selected = String(it.id) === selectedId;
          return (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={selected}
              data-hi={i === hi ? "true" : undefined}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(it.id)}
              className={`flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors ${
                selected ? "bg-[#C9F25B]" : i === hi ? "bg-[#E8F5C1]" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-semibold">
                  {it.label}
                </span>
                {it.sub && (
                  <span className="block truncate text-[12px] text-[#6B7A6E]">
                    {it.sub}
                  </span>
                )}
              </span>
              {selected && (
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </button>
          );
        })
      )}
      {items.length > shown.length && (
        <p className="px-4 py-3 text-center text-[12px] text-[#6B7A6E]">
          พิมพ์ค้นหาเพื่อดูอีก {items.length - shown.length} รายการ
        </p>
      )}
    </div>
  );
}

// สีพลุกระดาษ: โทนเขียว-มะนาวของธีม + เหลืองอุ่นนิดเดียวให้ดูสนุก
const FIREWORK_COLORS = [
  "#C9F25B",
  "#8FB54A",
  "#3F5E1F",
  "#1B2A21",
  "#FFFFFF",
  "#FFC857",
];

type Burst = {
  at: number; // เวลาเริ่มยิง (ms)
  x: number; // ตำแหน่งยิง เป็นสัดส่วนของจอ 0-1
  y: number;
  angle: number; // ทิศหลัก (องศา, -90 = พุ่งขึ้น)
  spread: number; // ช่วงกระจาย (องศา)
  min: number; // ความเร็วต่ำสุด/สูงสุด
  max: number;
  count: number;
};

// ลำดับพลุ: ยิงขึ้นจากมุมล่างซ้าย-ขวา แล้วแตกกลางจอ ตามด้วยแตกสองข้าง
const BURSTS: Burst[] = [
  { at: 250, x: 0.06, y: 1.02, angle: -62, spread: 40, min: 13, max: 22, count: 60 },
  { at: 250, x: 0.94, y: 1.02, angle: -118, spread: 40, min: 13, max: 22, count: 60 },
  { at: 1150, x: 0.5, y: 0.36, angle: -90, spread: 360, min: 3, max: 9, count: 80 },
  { at: 1750, x: 0.22, y: 0.28, angle: -90, spread: 360, min: 2.5, max: 7, count: 45 },
  { at: 1950, x: 0.78, y: 0.28, angle: -90, spread: 360, min: 2.5, max: 7, count: 45 },
];

// พลุกระดาษเต็มจอ ยิงครั้งเดียวตอนเมานต์ ไม่รับการกด
// (ตั้งใจไม่เช็ก prefers-reduced-motion เพราะเป็นเอฟเฟกต์สั้นๆ ครั้งเดียวตอนต้อนรับ)
function Fireworks() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const LIFE = 2800;
    const FADE = 700;

    const pieces = BURSTS.flatMap((b) =>
      Array.from({ length: b.count }, () => {
        const a =
          ((b.angle + (Math.random() - 0.5) * b.spread) * Math.PI) / 180;
        const sp = b.min + Math.random() * (b.max - b.min);
        return {
          born: b.at + Math.random() * 120,
          x: b.x * w,
          y: b.y * h,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.35,
          pw: 6 + Math.random() * 6,
          ph: 4 + Math.random() * 4,
          color:
            FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
          round: Math.random() < 0.25,
        };
      })
    );
    const END = Math.max(...pieces.map((p) => p.born)) + LIFE;

    let raf = 0;
    let start = 0;
    let last = 0;
    const tick = (t: number) => {
      if (!start) {
        start = t;
        last = t;
      }
      const dt = Math.min(32, t - last) / 16.67;
      last = t;
      const el = t - start;
      ctx.clearRect(0, 0, w, h);

      for (const p of pieces) {
        const age = el - p.born;
        if (age < 0 || age > LIFE) continue;
        p.vx *= Math.pow(0.985, dt);
        p.vy = p.vy * Math.pow(0.985, dt) + 0.18 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;

        ctx.globalAlpha = age > LIFE - FADE ? Math.max(0, (LIFE - age) / FADE) : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // พลิกแกนให้ดูเป็นกระดาษที่ร่วงหมุน
        ctx.scale(1, Math.cos(p.rot * 2));
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.ph * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.pw / 2, -p.ph / 2, p.pw, p.ph);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (el < END) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    />
  );
}

function Sparkle({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`rf-twinkle pointer-events-none absolute ${className}`}
    >
      <path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z" />
    </svg>
  );
}

// ถ่ายรูปโปรไฟล์: เปิดกล้องในกรอบวงกลม กดชัตเตอร์แล้วตัดเป็นสี่เหลี่ยมจัตุรัสกลางภาพ
function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (f: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("เบราว์เซอร์นี้ไม่รองรับกล้อง");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: facing,
          // 4:3 = เต็มเซนเซอร์ ไม่โดนครอปจนซูม (ขอจัตุรัสตรงๆ เบราว์เซอร์จะครอปกลางภาพ)
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled)
          setErr("เปิดกล้องไม่ได้ ตรวจสอบสิทธิ์กล้องของเบราว์เซอร์ หรือเลือกรูปจากเครื่องแทน");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  // กด Esc เพื่อปิด
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const size = Math.min(side, 800);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // กล้องหน้า: พลิกซ้ายขวาให้ตรงกับที่เห็นในกรอบ
    if (facing === "user") {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      v,
      (v.videoWidth - side) / 2,
      (v.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    );
    c.toBlob(
      (b) => {
        if (!b) return;
        onCapture(
          new File([b], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" })
        );
      },
      "image/jpeg",
      0.9
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ถ่ายรูปโปรไฟล์"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/95 px-6 text-white"
    >
      <p className="mb-5 text-center text-[15px] font-semibold text-white/90">
        จัดหน้าให้อยู่ในวงกลม
      </p>

      <div className="relative aspect-square w-[min(80vw,360px)] overflow-hidden rounded-full bg-[#1B2A21] ring-4 ring-[#C9F25B]">
        <video
          ref={videoRef}
          playsInline
          muted
          onLoadedData={() => setReady(true)}
          className="h-full w-full object-cover"
          style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
        />
        {!ready && !err && (
          <span className="absolute inset-0 flex items-center justify-center text-[14px] text-white/70">
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

      <div className="mt-8 flex w-full max-w-xs items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="h-11 min-w-[84px] rounded-full px-4 text-[15px] font-semibold text-white/80 hover:text-white"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={snap}
          disabled={!ready || !!err}
          aria-label="ถ่ายรูป"
          className="h-[72px] w-[72px] rounded-full bg-white ring-4 ring-[#C9F25B] ring-offset-2 ring-offset-black transition-transform active:scale-90 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          className="h-11 min-w-[84px] rounded-full px-4 text-[15px] font-semibold text-white/80 hover:text-white"
        >
          สลับกล้อง
        </button>
      </div>
    </div>
  );
}

// กรอบหน้าสมัคร (ไม่มีโลโก้/ชื่อแอป): มือถือ = กรอบเต็มจอ / จอ ≥640px = การ์ดลอยบนพื้นเขียวอ่อนเหมือนหน้า welcome
// การ์ดเป็นสีเข้มจนถึง lg แล้วเปลี่ยนเป็นสีขาว ให้ตรงกับที่ Field ถูกออกแบบไว้
function RegShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85]">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-white/40 blur-2xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-20 h-64 w-64 rounded-full bg-[#C9F25B]/50 blur-2xl"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg items-stretch justify-center sm:items-center sm:px-4 sm:py-8">
        <div className="flex min-h-dvh w-full flex-col justify-start bg-[#1B2A21] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))] text-white sm:min-h-0 sm:rounded-[32px] sm:p-6 sm:shadow-2xl sm:ring-1 sm:ring-black/5 lg:bg-white lg:text-[#1B2A21]">
          {children}
        </div>
      </div>
    </div>
  );
}

const primaryBtn =
  "flex h-14 w-full items-center justify-center rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-60";
const ghostBtn =
  "mt-3 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-white/80 transition-colors hover:text-white disabled:opacity-60 lg:text-[#6B7A6E] lg:hover:text-[#1B2A21]";

/* ------------------------------------------------------------------ */
/* ฟอร์มสมัครสมาชิกแบบทีละขั้น                                             */
/* ------------------------------------------------------------------ */

export default function RegisterForm({ onAuthed, onSwitch }: AuthFormProps) {
  const [step, setStep] = useState(0);

  const [nickname, setNickname] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [workplace, setWorkplace] = useState<Place | "">(""); // สำนักงานใหญ่ / หน้าร้าน
  const [departmentId, setDepartmentId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [deptQuery, setDeptQuery] = useState(""); // คำค้นหา (ใช้กรองรายการแผนก)
  const [branchQuery, setBranchQuery] = useState(""); // คำค้นหา (ใช้กรองรายการสาขา)
  const [hi, setHi] = useState(-1); // แถวที่ไฮไลต์ในรายการ (-1 = ไม่มี)
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [busy, setBusy] = useState(false);

  // รูปโปรไฟล์ (ไม่บังคับ)
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [canCam, setCanCam] = useState(false); // เช็กฝั่งไคลเอนต์ (ต้องเป็น https / localhost)
  useEffect(() => {
    setCanCam(!!navigator.mediaDevices?.getUserMedia);
  }, []);

  // หลังสมัครสำเร็จ: เก็บ user ไว้ก่อน แล้วค่อย onAuthed ตอนกด GO!
  const [user, setUser] = useState<User | null>(null);
  const [mates, setMates] = useState<Mates | null>(null);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview]
  );

  // เปลี่ยนขั้น = ล้างแถวที่ไฮไลต์
  useEffect(() => {
    setHi(-1);
  }, [step]);

  // รายการบริษัท / แผนก / สาขา (แผนกและสาขาขึ้นกับบริษัทที่เลือก)
  const companyItems = useMemo<Item[]>(
    () => COMPANIES.map((c) => ({ id: c.id, label: c.name })),
    []
  );
  const deptItems = useMemo<Item[]>(
    () =>
      departmentsOf(Number(companyId)).map((d) => ({ id: d.id, label: d.name })),
    [companyId]
  );
  // สาขา: แสดง "ID xxx · ชื่อสาขา" และใต้ชื่อเป็น "จังหวัด · ภาค" ดึงจากข้อมูลสาขาอัตโนมัติ
  // (ค้นหาด้วยเลข ID / ชื่อสาขา / จังหวัด / ภาค ได้หมด เพราะ searchItems ค้นทั้ง label และ sub)
  const branchItems = useMemo<Item[]>(
    () =>
      branchesOf(Number(companyId)).map((b) => ({
        id: b.id,
        label: branchFullLabel(b),
        sub: [branchProvince(b), branchRegion(b)].filter(Boolean).join(" · "),
      })),
    [companyId]
  );

  // ถามว่าสำนักงานใหญ่/หน้าร้าน เฉพาะบริษัทที่มีทั้งแผนกและสาขา
  // บริษัทที่มีอย่างเดียวจะเลือกให้เอง (มีแต่แผนก = สำนักงานใหญ่ / มีแต่สาขา = หน้าร้าน)
  const askType = deptItems.length > 0 && branchItems.length > 0;
  const place: Place | "" = askType
    ? workplace
    : deptItems.length > 0
      ? "hq"
      : branchItems.length > 0
        ? "store"
        : "";
  // ขั้นที่ผู้ใช้ต้องผ่านจริง (ข้ามขั้น 2 ถ้าไม่ต้องถาม)
  const flow = askType ? [0, 1, 2, 3, 4, 5] : [0, 1, 3, 4, 5];
  const stepLabel = (id: number) =>
    id === 3 && place === "store" ? "เลือกสาขา" : STEP_LABELS[id];

  // ยังไม่พิมพ์ = ทุกรายการ / พิมพ์แล้ว = กรองและเรียงตามความใกล้เคียง
  const visibleDepts = useMemo(
    () => searchItems(deptQuery, deptItems),
    [deptQuery, deptItems]
  );
  const visibleBranches = useMemo(
    () => searchItems(branchQuery, branchItems),
    [branchQuery, branchItems]
  );

  const selectedCompany = useMemo(
    () => getCompany(Number(companyId)),
    [companyId]
  );
  const selectedDept = useMemo(
    () => DEPARTMENTS.find((d) => String(d.id) === departmentId) ?? null,
    [departmentId]
  );
  const selectedBranch = useMemo(
    () => (branchId ? getBranch(Number(branchId)) : null),
    [branchId]
  );

  // เลื่อนรายการให้เห็นแถวที่ไฮไลต์ (เลื่อนในกล่องรายการเท่านั้น ไม่เลื่อนทั้งหน้า)
  useEffect(() => {
    if (step !== 3 || hi < 0) return;
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-hi="true"]');
    if (!box || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [hi, step]);

  const clearErr = (key: keyof AuthErrors) =>
    setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));

  const edit =
    (key: keyof AuthErrors, set: (v: string) => void) => (v: string) => {
      set(v);
      clearErr(key);
    };

  /* ---------------- บริษัท / ที่ทำงาน / แผนก / สาขา ---------------- */

  // เปลี่ยนบริษัท = ล้างที่ทำงาน แผนก และสาขาที่เลือกไว้ (เพราะเป็นของบริษัทเดิม)
  const pickCompany = (id: number) => {
    if (String(id) !== companyId) {
      setCompanyId(String(id));
      setWorkplace("");
      setDepartmentId("");
      setBranchId("");
      setDeptQuery("");
      setBranchQuery("");
    }
    clearErr("companyId");
  };

  // เลือกสำนักงานใหญ่ = ล้างสาขา / เลือกหน้าร้าน = ล้างแผนก
  const pickPlace = (p: Place) => {
    setWorkplace(p);
    if (p === "hq") {
      setBranchId("");
      setBranchQuery("");
    } else {
      setDepartmentId("");
      setDeptQuery("");
    }
    clearErr("form");
  };

  const pickDept = (id: number) => {
    setDepartmentId(String(id));
    clearErr("departmentId");
  };

  const pickBranch = (id: number) => {
    setBranchId(String(id));
    clearErr("branchId");
  };

  const onDeptQuery = (v: string) => {
    setDeptQuery(v);
    setHi(v.trim() ? 0 : -1);
    clearErr("departmentId");
  };

  const onBranchQuery = (v: string) => {
    setBranchQuery(v);
    setHi(v.trim() ? 0 : -1);
    clearErr("branchId");
  };

  // ลูกศรขึ้น/ลง เลื่อนรายการ, Enter (ตอนมีคำค้น) เลือกแถวที่ไฮไลต์
  const onListKey =
    (
      list: Item[],
      query: string,
      selectedId: string,
      pick: (id: number) => void
    ) =>
    (e: KeyboardEvent<HTMLDivElement>) => {
      const n = list.length;
      if (n === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((i) => (i + 1) % n);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((i) => (i <= 0 ? n - 1 : i - 1));
      } else if (e.key === "Enter" && query.trim()) {
        const it = list[Math.min(Math.max(hi, 0), n - 1)];
        // ถ้าแถวนั้นเลือกอยู่แล้ว ปล่อยให้ Enter ส่งฟอร์มไปขั้นถัดไป
        if (it && String(it.id) !== selectedId) {
          e.preventDefault();
          pick(it.id);
        }
      }
    };

  /* ---------------- รูปโปรไฟล์ ---------------- */

  // ใช้ร่วมกันทั้งเลือกไฟล์และถ่ายรูป
  const applyAvatar = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setErrors((p) => ({ ...p, form: "ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB" }));
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setErrors((p) => ({ ...p, form: undefined }));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyAvatar(file);
    e.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
  };

  /* ---------------- ตรวจทีละขั้น ---------------- */

  const validate = (s: number): AuthErrors => {
    const err: AuthErrors = {};
    if (s === 0) {
      if (!nickname.trim()) err.nickname = "กรอกชื่อเล่น";
    } else if (s === 1) {
      if (!companyId) err.companyId = "เลือกบริษัทของคุณ";
    } else if (s === 2) {
      // ต้องเลือกสำนักงานใหญ่/หน้าร้าน เฉพาะบริษัทที่มีทั้งสองแบบ
      if (askType && !place)
        err.form = "เลือกว่าคุณอยู่สำนักงานใหญ่หรือหน้าร้าน";
    } else if (s === 3) {
      // สำนักงานใหญ่ = ต้องเลือกแผนก / หน้าร้าน = ต้องเลือกสาขา
      if (place === "hq" && !departmentId)
        err.departmentId = "เลือกแผนกของคุณจากรายการ";
      if (place === "store" && !branchId)
        err.branchId = "เลือกสาขาของคุณจากรายการ";
    } else if (s === 4) {
      const uname = username.trim();
      if (!uname) err.username = "กรอก username";
      else if (!/^[A-Za-z0-9_]{3,20}$/.test(uname))
        err.username = "3-20 ตัว ใช้ a-z 0-9 และ _ เท่านั้น";
      if (!password) err.password = "กรอกรหัสผ่าน";
      else if (password.length < 6)
        err.password = "รหัสผ่านอย่างน้อย 6 ตัวอักษร";
      if (!err.password && confirm !== password)
        err.confirm = "รหัสผ่านไม่ตรงกัน";
    }
    return err;
  };

  // ใช้ /api/departments/members เดิม (อ่านแผนก/สาขาจากคนที่ล็อกอินอยู่ จึงต้องเรียกหลังสมัครสำเร็จ)
  const loadMates = () => {
    fetch("/api/departments/members", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { members: (Mate & { isMe?: boolean })[] }) => {
        const others = d.members.filter((m) => !m.isMe);
        // คนที่มีรูปโปรไฟล์ขึ้นก่อน (sort เสถียร ลำดับเดิมคงอยู่ภายในกลุ่ม)
        others.sort((a, b) => Number(!!b.avatarUrl) - Number(!!a.avatarUrl));
        setMates({ count: others.length, members: others.slice(0, 12) });
      })
      .catch(() => setMates({ count: 0, members: [] }));
  };

  const register = async (withAvatar: boolean) => {
    if (busy) return;
    for (let s = 0; s <= 4; s++) {
      const err = validate(s);
      if (Object.keys(err).length > 0) {
        setErrors(err);
        setStep(s);
        return;
      }
    }
    if (!withAvatar) {
      setAvatarFile(null);
      setAvatarPreview(null);
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("nickname", nickname.trim());
      formData.append("username", username.trim());
      formData.append("companyId", companyId);
      // สำนักงานใหญ่ส่งแค่แผนก / หน้าร้านส่งแค่สาขา
      if (place === "hq" && departmentId)
        formData.append("departmentId", departmentId);
      if (place === "store" && branchId) formData.append("branchId", branchId);
      formData.append("password", password);
      if (withAvatar && avatarFile) formData.append("avatar", avatarFile);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: User;
        errors?: AuthErrors;
        error?: string;
      };
      if (!res.ok || !data.user) {
        if (data.errors) {
          setErrors(data.errors);
          const s = stepOfErrors(data.errors);
          if (s !== null) setStep(s); // เด้งกลับไปขั้นที่มีปัญหา
        } else {
          setErrors({
            form: data.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง",
          });
        }
        return;
      }
      setUser(data.user);
      setStep(WELCOME);
      loadMates();
    } catch {
      setErrors({ form: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const err = validate(step);
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }
    setErrors({});
    if (step < LAST_STEP) {
      let n = step + 1;
      if (n === 2 && !askType) n = 3; // ข้ามขั้นถามที่ทำงาน
      setStep(n);
    } else register(true);
  };

  const back = () => {
    if (busy || step === 0) return;
    setErrors({});
    let p = step - 1;
    if (p === 2 && !askType) p = 1; // ข้ามขั้นถามที่ทำงาน
    setStep(p);
  };

  // แตะวงกลมของขั้นที่ผ่านมาแล้วเพื่อย้อนกลับไปแก้
  const goTo = (i: number) => {
    if (busy || i >= step) return;
    setErrors({});
    setStep(i);
  };

  /* ---------------- หน้า welcome (เต็มจอ สีเขียวอ่อน) ---------------- */

  if (step === WELCOME && user) {
    const avatarSrc =
      avatarPreview ?? (user as User & { avatarUrl?: string | null }).avatarUrl;
    const others = (mates?.members ?? []).slice(0, 4);
    const moreCount = Math.max(0, (mates?.count ?? 0) - others.length);
    const totalInDept = (mates?.count ?? 0) + 1;

    // แถวเพื่อนร่วมแผนก (ตัวเองแสดงใหญ่ตรงกลางแล้ว)
    const row = others;

    // ชื่อหลักบนหน้า welcome: แผนก > สาขา > บริษัท
    const branchName = selectedBranch ? branchLabel(selectedBranch) : null;
    // บรรทัดรอง (หน้าร้าน): "ID 115 · ปทุมธานี" ดึงรหัสสาขาและจังหวัดจากข้อมูลสาขาอัตโนมัติ
    const branchInfo = selectedBranch
      ? [
          branchCode(selectedBranch) ? `ID ${branchCode(selectedBranch)}` : null,
          branchProvince(selectedBranch),
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
    const mainTitle =
      selectedDept?.name ?? branchName ?? selectedCompany?.name ?? "แผนกของคุณ";
    // หน้าร้าน เพื่อนร่วมกลุ่มคือคนในสาขาเดียวกัน
    const groupLabel = selectedDept ? "แผนก" : "สาขา";

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] text-[#1B2A21]">
        <style>{`
          @keyframes rf-drop {
            0% { transform: translateY(-170px) scale(.8,1.15); opacity: 0; }
            50% { transform: translateY(0) scale(1.15,.85); opacity: 1; }
            68% { transform: translateY(-22px) scale(.95,1.06); }
            84% { transform: translateY(0) scale(1.06,.94); }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          @keyframes rf-hop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
          @keyframes rf-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes rf-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          @keyframes rf-twinkle { 0%,100% { opacity: .3; transform: scale(.8) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(20deg); } }
          .rf-twinkle { animation: rf-twinkle 2.4s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .rf-hop, .rf-twinkle { animation: none !important; }
          }
        `}</style>

        <Fireworks />

        {/* ลายตกแต่งพื้นหลัง */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-white/40 blur-2xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 bottom-40 h-64 w-64 rounded-full bg-[#C9F25B]/50 blur-2xl"
        />
        <Sparkle className="left-[12%] top-[14%] h-6 w-6 fill-[#8FB54A]" />
        <Sparkle className="right-[14%] top-[22%] h-5 w-5 fill-white" />
        <Sparkle className="left-[20%] top-[38%] h-4 w-4 fill-white" />
        <Sparkle className="right-[10%] top-[46%] h-6 w-6 fill-[#8FB54A]" />

        <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
          {/* ชื่อบริษัท / แผนก / สาขา */}
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <p
              className="text-[16px] font-semibold text-[#3F5E1F]"
              style={{ animation: "rf-fade .6s ease-out .1s both" }}
            >
              ยินดีต้อนรับ
            </p>

            {/* รูปโปรไฟล์เรา อยู่กลางจอ ชื่ออยู่ใต้รูป */}
            <div className="mt-5 flex w-full flex-col items-center">
              <span
                className="block"
                style={{ animation: "rf-drop .95s ease-out .5s both" }}
              >
                <span
                  className="rf-hop block"
                  style={{ animation: "rf-hop 1.7s ease-in-out 1.8s infinite" }}
                >
                  <span className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-xl ring-4 ring-[#1B2A21]">
                    <Avatar name={nickname.trim()} src={avatarSrc} size={128} />
                  </span>
                </span>
              </span>
              <p
                className="mt-3 w-full truncate px-4 text-center text-[22px] font-bold"
                style={{ animation: "rf-fade .5s ease-out 1s both" }}
              >
                {nickname.trim()}
              </p>
            </div>
            {selectedCompany && (
              <p
                className="mt-3 text-[16px] font-semibold text-[#3F5E1F]"
                style={{ animation: "rf-fade .6s ease-out .3s both" }}
              >
                {selectedCompany.name}
              </p>
            )}
            <h1
              className="mt-1 break-words text-[40px] font-bold leading-tight tracking-tight"
              style={{ animation: "rf-pop .7s ease-out .25s both" }}
            >
              {mainTitle}
            </h1>
            {!selectedDept && branchInfo && (
              <p
                className="mt-1 break-words text-[16px] font-semibold text-[#3F5E1F]"
                style={{ animation: "rf-fade .6s ease-out .45s both" }}
              >
                {branchInfo}
              </p>
            )}
            {selectedDept && branchName && (
              <p
                className="mt-1 break-words text-[16px] font-semibold text-[#3F5E1F]"
                style={{ animation: "rf-fade .6s ease-out .45s both" }}
              >
                {branchName}
              </p>
            )}
            <p
              className="mt-3 inline-flex rounded-full bg-white/70 px-4 py-1.5 text-[14px] font-semibold text-[#3F5E1F]"
              style={{ animation: "rf-fade .6s ease-out .6s both" }}
            >
              {mates
                ? `${totalInDept} คนใน${groupLabel}นี้`
                : `กำลังโหลดเพื่อนร่วม${groupLabel}`}
            </p>
          </div>

          {/* โปรไฟล์ + ชื่อ กระโดดลงมาทีละคน */}
          <div className="pb-6">
            <ul className="flex items-start justify-center gap-3">
              {row.map((m, i) => {
                const drop = 0.9 + i * 0.14;
                const hop = 2.2 + i * 0.18;
                return (
                  <li
                    key={`${m.username}-${i}`}
                    className="flex w-[64px] flex-col items-center"
                  >
                    <span
                      className="block"
                      style={{ animation: `rf-drop .95s ease-out ${drop}s both` }}
                    >
                      <span
                        className="rf-hop block"
                        style={{
                          animation: `rf-hop 1.7s ease-in-out ${hop}s infinite`,
                        }}
                      >
                        <span
                          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-lg ring-[3px] ring-white"
                        >
                          <Avatar name={m.name} src={m.avatarUrl} size={56} />
                        </span>
                      </span>
                    </span>
                    <span
                      className="mt-2 w-full truncate text-center text-[12px] font-semibold"
                      style={{
                        animation: `rf-fade .5s ease-out ${drop + 0.5}s both`,
                      }}
                    >
                      {m.name}
                    </span>
                  </li>
                );
              })}

              {moreCount > 0 && (
                <li className="flex w-[64px] flex-col items-center">
                  <span
                    className="block"
                    style={{
                      animation: `rf-drop .95s ease-out ${0.9 + row.length * 0.14}s both`,
                    }}
                  >
                    <span
                      className="rf-hop flex h-14 w-14 items-center justify-center rounded-full bg-[#C9F25B] text-[15px] font-bold text-[#1B2A21] shadow-lg ring-[3px] ring-white"
                      style={{
                        animation: `rf-hop 1.7s ease-in-out ${2.2 + row.length * 0.18}s infinite`,
                      }}
                    >
                      +{moreCount}
                    </span>
                  </span>
                  <span
                    className="mt-2 text-[12px] font-semibold text-[#3F5E1F]"
                    style={{
                      animation: `rf-fade .5s ease-out ${1.4 + row.length * 0.14}s both`,
                    }}
                  >
                    คน
                  </span>
                </li>
              )}
            </ul>

            {mates && mates.count === 0 && (
              <p
                className="mt-5 text-center text-[13px] text-[#3F5E1F]"
                style={{ animation: "rf-fade .6s ease-out 1.4s both" }}
              >
                คุณเป็นคนแรกของ{groupLabel}นี้ ชวนเพื่อนมาโดดด้วยกันเลย
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onAuthed(user)}
            className="flex h-14 w-full items-center justify-center rounded-full bg-[#1B2A21] text-[22px] font-bold tracking-wide text-[#C9F25B] shadow-lg transition-transform duration-150 active:scale-[0.97]"
            style={{ animation: "rf-pop .6s ease-out 1.3s both" }}
          >
            GO!
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- ฟอร์มทีละขั้น ---------------- */

  const heading = [
    {
      t: "ชื่อเล่นของคุณคืออะไร",
      s: "ชื่อนี้จะแสดงบนอันดับให้คนอื่นเห็น",
    },
    {
      t: "คุณอยู่บริษัทไหน",
      s: "เลือกบริษัทของคุณ",
    },
    {
      t: "คุณทำงานที่ไหน",
      s: "เลือกสำนักงานใหญ่ หรือหน้าร้าน",
    },
    place === "store"
      ? {
          t: "คุณประจำสาขาไหน",
          s: "เลือกจากรายการ หรือพิมพ์ค้นหาเลข ID / ชื่อสาขา / จังหวัด",
        }
      : {
          t: "คุณอยู่แผนกไหน",
          s: selectedCompany
            ? `แผนกใน ${selectedCompany.name} เลือกจากรายการ หรือพิมพ์ค้นหา`
            : "เลือกจากรายการ ถ้าหาไม่เจอพิมพ์ค้นหาได้",
        },
    { t: "ตั้งค่าบัญชี", s: "ใช้ username และรหัสผ่านนี้เข้าสู่ระบบ" },
    { t: "ใส่รูปโปรไฟล์", s: "เลือกรูปให้เพื่อนจำคุณได้ หรือข้ามไปก่อนก็ได้" },
  ][step];

  // ตำแหน่งของขั้นปัจจุบันในลำดับที่แสดงจริง (ใช้วาดวงกลมลำดับขั้น)
  const pos = Math.max(0, flow.indexOf(step));

  const noItemsCls =
    "mt-4 rounded-2xl bg-white/10 px-4 py-5 text-center text-[14px] lg:bg-[#1B2A21]/5";

  return (
    <RegShell>
      <form onSubmit={next} noValidate className="w-full">
        {/* ขั้นตอน: วงกลมมีลำดับที่ + ข้อความบอกว่าต้องทำอะไร (แตะขั้นที่ผ่านแล้วเพื่อย้อนกลับ) */}
        <ol className="flex items-start" aria-label="ขั้นตอนการสมัคร">
          {flow.map((id, p) => {
            const label = stepLabel(id);
            const done = p < pos;
            const cur = p === pos;
            const circle = done
              ? "bg-[#C9F25B] text-[#1B2A21] lg:bg-[#3F5E1F] lg:text-white"
              : cur
                ? "bg-[#C9F25B] text-[#1B2A21] ring-4 ring-[#C9F25B]/30 lg:bg-[#3F5E1F] lg:text-white lg:ring-[#3F5E1F]/20"
                : "border border-white/30 text-white/60 lg:border-[#1B2A21]/20 lg:text-[#6B7A6E]";
            const inner = done ? (
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12l5 5 9-10" />
              </svg>
            ) : (
              p + 1
            );
            const circleCls = `relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold tabular-nums transition-all duration-300 ${circle}`;
            return (
              <li
                key={id}
                className="relative flex flex-1 flex-col items-center"
                aria-current={cur ? "step" : undefined}
              >
                {/* เส้นเชื่อมไปขั้นถัดไป */}
                {p < flow.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[calc(50%+22px)] top-[17px] h-0.5 w-[calc(100%-44px)] transition-colors duration-300 ${
                      done
                        ? "bg-[#C9F25B] lg:bg-[#3F5E1F]"
                        : "bg-white/20 lg:bg-[#1B2A21]/10"
                    }`}
                  />
                )}
                {done ? (
                  <button
                    type="button"
                    onClick={() => goTo(id)}
                    disabled={busy}
                    aria-label={`ย้อนกลับไปขั้นที่ ${p + 1}: ${label}`}
                    className={`${circleCls} active:scale-90`}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className={circleCls}>{inner}</span>
                )}
                <span
                  className={`mt-1.5 px-0.5 text-center text-[11px] font-semibold leading-tight ${
                    cur
                      ? "text-white lg:text-[#1B2A21]"
                      : done
                        ? "text-white/80 lg:text-[#3F5E1F]"
                        : "text-white/50 lg:text-[#6B7A6E]"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div key={step} className="pj-in">
          <h1 className="mt-6 text-[30px] font-bold leading-tight tracking-tight">
            {heading.t}
          </h1>
          <p className="mt-1 text-[14px] text-white/80 lg:text-[#6B7A6E]">
            {heading.s}
          </p>

          {/* ขั้น 1: ชื่อเล่น */}
          {step === 0 && (
            <div className="mt-6">
              <Field
                label="ชื่อเล่น"
                value={nickname}
                onChange={edit("nickname", setNickname)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="เช่น มะนาว"
                error={errors.nickname}
                autoFocus
              />
            </div>
          )}

          {/* ขั้น 2: บริษัท */}
          {step === 1 && (
            <div className="mt-4">
              <PickList
                label="รายการบริษัท"
                items={companyItems}
                selectedId={companyId}
                hi={-1}
                onHover={() => {}}
                onPick={pickCompany}
              />
              {errors.companyId && (
                <p
                  role="alert"
                  className="mt-2 text-[13px] text-[#FDA29B] lg:text-[#D92D20]"
                >
                  {errors.companyId}
                </p>
              )}
            </div>
          )}

          {/* ขั้น 3: สำนักงานใหญ่ หรือ หน้าร้าน (แสดงเฉพาะบริษัทที่มีทั้งแผนกและสาขา) */}
          {step === 2 && (
            <div
              role="radiogroup"
              aria-label="ที่ทำงาน"
              className="mt-6 grid gap-3"
            >
              {(
                [
                  ["hq", "สำนักงานใหญ่", "ทำงานที่ออฟฟิศ เลือกแผนกของคุณ"],
                  ["store", "หน้าร้าน", "ประจำที่สาขา เลือกสาขาของคุณ"],
                ] as const
              ).map(([k, title, sub]) => {
                const sel = place === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => pickPlace(k)}
                    className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left text-[#1B2A21] transition-all active:scale-[0.99] ${
                      sel
                        ? "bg-[#C9F25B] shadow-lg"
                        : "bg-white shadow-lg ring-1 ring-black/5"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[18px] font-bold">
                        {title}
                      </span>
                      <span className="block text-[13px] text-[#6B7A6E]">
                        {sub}
                      </span>
                    </span>
                    {sel && (
                      <svg
                        className="h-5 w-5 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ขั้น 4: สำนักงานใหญ่ = เลือกแผนก (แสดงให้เลือกเลย พิมพ์ค้นหาเมื่อหาไม่เจอ) */}
          {step === 3 && place === "hq" && (
            <div
              className="mt-4"
              onKeyDown={onListKey(visibleDepts, deptQuery, departmentId, pickDept)}
            >
              <Field
                label="ค้นหาแผนก"
                value={deptQuery}
                onChange={onDeptQuery}
                placeholder="พิมพ์ชื่อแผนก (ถ้าหาไม่เจอในรายการ)"
                autoComplete="off"
                error={errors.departmentId}
              />
              <PickList
                label="รายการแผนก"
                items={visibleDepts}
                selectedId={departmentId}
                hi={hi}
                onHover={setHi}
                onPick={pickDept}
                listRef={listRef}
              />
            </div>
          )}

          {/* ขั้น 4: หน้าร้าน = เลือกสาขา */}
          {step === 3 && place === "store" && (
            <div
              className="mt-4"
              onKeyDown={onListKey(
                visibleBranches,
                branchQuery,
                branchId,
                pickBranch
              )}
            >
              <Field
                label="ค้นหาสาขา"
                value={branchQuery}
                onChange={onBranchQuery}
                placeholder="พิมพ์เลข ID, ชื่อสาขา หรือจังหวัด"
                autoComplete="off"
                error={errors.branchId}
              />
              <PickList
                label="รายการสาขา"
                items={visibleBranches}
                selectedId={branchId}
                hi={hi}
                onHover={setHi}
                onPick={pickBranch}
                listRef={listRef}
                limit={branchQuery.trim() ? undefined : BRANCH_PREVIEW}
              />
            </div>
          )}

          {/* ขั้น 4: บริษัทที่ไม่มีทั้งแผนกและสาขา */}
          {step === 3 && place === "" && (
            <p className={noItemsCls}>
              บริษัทนี้ยังไม่มีรายการแผนกหรือสาขา กด ถัดไป ได้เลย
            </p>
          )}

          {/* ขั้น 5: username / password */}
          {step === 4 && (
            <div className="mt-6 space-y-4">
              <Field
                label="Username"
                value={username}
                onChange={edit("username", setUsername)}
                maxLength={20}
                autoComplete="username"
                placeholder="เช่น manao_99"
                error={errors.username}
                hint="3-20 ตัว ใช้ a-z 0-9 และ _"
                autoFocus
              />
              <Field
                label="รหัสผ่าน"
                value={password}
                onChange={edit("password", setPassword)}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                error={errors.password}
                trailing={
                  <EyeButton show={show} onToggle={() => setShow((v) => !v)} />
                }
              />
              <Field
                label="ยืนยันรหัสผ่าน"
                value={confirm}
                onChange={edit("confirm", setConfirm)}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                error={errors.confirm}
              />
            </div>
          )}

          {/* ขั้น 6: รูปโปรไฟล์ (ข้ามได้) */}
          {step === 5 && (
            <div className="mt-6 flex flex-col items-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="เลือกรูปโปรไฟล์"
                className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/40 bg-white/10 transition-all hover:border-[#C9F25B] active:scale-95 lg:border-[#6B7A6E]"
              >
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarPreview}
                    alt="ตัวอย่างรูปโปรไฟล์"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center text-[13px] text-white/70 group-hover:text-[#C9F25B] lg:text-[#6B7A6E]">
                    <svg
                      className="mb-1 h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    <span>เลือกรูป</span>
                  </div>
                )}
              </button>
              <div className="mt-4 flex items-center gap-3">
                {canCam && (
                  <button
                    type="button"
                    onClick={() => setCamOpen(true)}
                    className="flex h-11 items-center gap-2 rounded-full bg-[#C9F25B] px-5 text-[14px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                    {avatarFile ? "ถ่ายใหม่" : "ถ่ายรูป"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-11 items-center rounded-full border border-white/30 px-5 text-[14px] font-semibold text-white/90 transition-colors hover:bg-white/10 active:scale-95 lg:border-[#1B2A21]/20 lg:text-[#1B2A21] lg:hover:bg-[#1B2A21]/5"
                >
                  {avatarFile ? "เลือกรูปใหม่" : "เลือกรูป"}
                </button>
              </div>
              <span className="mt-3 text-[12px] text-white/60 lg:text-[#6B7A6E]">
                ไฟล์ไม่เกิน 5MB
              </span>
            </div>
          )}
        </div>

        {errors.form && (
          <p
            role="alert"
            className="pj-in mt-4 rounded-2xl bg-[#FDE8E6] px-4 py-3 text-[14px] text-[#D92D20]"
          >
            {errors.form}
          </p>
        )}

        {/* ปุ่มหลัก: ย้อนกลับ + ถัดไป อยู่แถวเดียวกัน (ไม่ต้องเลื่อนหน้าจอ) */}
        <div className="mt-5 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              disabled={busy}
              className="flex h-14 shrink-0 items-center justify-center rounded-full border border-white/30 px-5 text-[15px] font-semibold text-white/90 transition-colors hover:bg-white/10 disabled:opacity-60 lg:border-[#1B2A21]/20 lg:text-[#1B2A21] lg:hover:bg-[#1B2A21]/5"
            >
              ย้อนกลับ
            </button>
          )}
          {step < LAST_STEP ? (
            <button type="submit" className={`${primaryBtn} flex-1`}>
              ถัดไป
            </button>
          ) : avatarFile ? (
            <button
              type="submit"
              disabled={busy}
              className={`${primaryBtn} flex-1`}
            >
              {busy ? "กำลังสร้างบัญชี" : "เสร็จสิ้น"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => register(false)}
              className={`${primaryBtn} flex-1`}
            >
              {busy ? "กำลังสร้างบัญชี" : "ข้ามไปก่อน"}
            </button>
          )}
        </div>

        {/* ขั้นสุดท้ายที่เลือกรูปแล้ว ยังข้ามได้ */}
        {step === LAST_STEP && avatarFile && (
          <button
            type="button"
            disabled={busy}
            onClick={() => register(false)}
            className={ghostBtn}
          >
            ข้ามขั้นตอนนี้
          </button>
        )}

        {step === 0 && (
          <>
            <p className="mt-5 text-center text-[14px] text-white/80 lg:text-[#6B7A6E]">
              มีบัญชีอยู่แล้ว?{" "}
              <button
                type="button"
                onClick={() => onSwitch("login")}
                className="font-semibold text-[#C9F25B] underline-offset-2 hover:underline lg:text-[#3F5E1F]"
              >
                เข้าสู่ระบบ
              </button>
            </p>
            <p className="mt-3 text-center text-[12px] text-white/60 lg:hidden">
              สถิติของคุณซิงก์ข้ามอุปกรณ์ได้
            </p>
          </>
        )}
      </form>

      {camOpen && (
        <CameraCapture
          onClose={() => setCamOpen(false)}
          onCapture={(f) => {
            applyAvatar(f);
            setCamOpen(false);
          }}
        />
      )}
    </RegShell>
  );
}