"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Prompt } from "next/font/google";
import LoginForm from "./components/LoginForm";
import RegisterForm from "./components/RegisterForm";
import Pose from "./components/Pose";
import Rank from "./components/Rank";
import History from "./components/History";
import HomeView from "./components/HomeView";
import PromoPopup from "./components/PromoPopup";
import Setting from "./components/Setting";
import Navbar from "./components/Navbar";
import { uploadShot } from "./components/snapshot";
import type { Tab, NavItem } from "./components/Navbar";
import type { Session } from "./components/History";
import {
  APP_NAME,
  APP_SHORT,
  ICONS,
  Icon,
  Logo,
  POINT_QUOTA,
  POINT_REWARD,
} from "./components/auth-shared";
import type { AuthMode, User } from "./components/auth-shared";

// Prompt: ฟอนต์ไทย+อังกฤษทรงเรขาคณิตมน ดูสปอร์ตและสดใส เข้ากับโทนเขียวมะนาว
const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const FONT = `${prompt.style.fontFamily}, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", Sarabun, sans-serif`;

/* ------------------------------------------------------------------ */
/* ค่าคงที่                                                             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "pose-jump-settings";
const HISTORY_KEY = "pose-jump-history";
const SHOTS_KEY = "pose-jump-shots";
const PROMO_KEY = "pose-jump-promo-hide";
// แคลอรี่โดยประมาณต่อการกระโดด 1 ครั้ง
const KCAL_PER_JUMP = 0.1;
const DAY = 864e5;

const DAILY_GOAL = 100;

// สี
const LIME = "#C9F25B";

type Phase = "setup" | "session" | "summary";
type Mode = "time" | "count";
type EndReason = "time" | "count" | "manual";

type Summary = {
  total: number;
  durationMs: number;
  perMin: number;
  bestTenSec: number;
  consistency: number;
  buckets: number[];
  reason: EndReason;
  record: boolean;
};

type Settings = {
  mode: Mode;
  seconds: number;
  target: number;
  dailyGoal: number;
  facing: "user" | "environment";
  sound: boolean;
};

type DayShots = { day: string; start: string | null; end: string | null };
const EMPTY_SHOTS: DayShots = { day: "", start: null, end: null };

const settingsKey = (v: Settings) =>
  JSON.stringify({
    mode: v.mode,
    seconds: v.seconds,
    target: v.target,
    dailyGoal: v.dailyGoal,
    facing: v.facing,
    sound: v.sound,
  });

/* ------------------------------------------------------------------ */
/* ฟังก์ชันช่วย                                                          */
/* ------------------------------------------------------------------ */

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const fmtNum = (n: number) => n.toLocaleString("en-US");

/* ------------------------------------------------------------------ */
/* ส่วนประกอบ UI                                                         */
/* ------------------------------------------------------------------ */

const STYLES = `
@keyframes pj-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pj-pop { 0% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes pj-in { from { opacity: 0; } to { opacity: 1; } }
.pj-fade { animation: pj-fade .35s cubic-bezier(.2,.8,.2,1) both; }
.pj-pop { animation: pj-pop .18s ease-out; }
.pj-in { animation: pj-in .25s ease-out both; }
@keyframes pj-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
.pj-pulse { animation: pj-pulse 1.4s ease-in-out infinite; }
@keyframes pj-float { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-5px) rotate(4deg); } }
.pj-float { animation: pj-float 2.4s ease-in-out infinite; }
@keyframes pj-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(201,242,91,.55); } 50% { box-shadow: 0 0 0 10px rgba(201,242,91,0); } }
.pj-glow { animation: pj-glow 2s ease-out infinite; }
@keyframes pj-wave { 0% { transform: scale(1); opacity: .65; } 100% { transform: scale(1.55, 1.9); opacity: 0; } }
.pj-wave { position: absolute; inset: 0; border-radius: 9999px; background: rgba(150,255,30,.6); pointer-events: none; animation: pj-wave 2.4s ease-out infinite; }
.pj-wave.pj-wave-2 { animation-delay: .8s; }
.pj-wave.pj-wave-3 { animation-delay: 1.6s; }
@keyframes pj-coin { 0% { transform: translateY(-12vh) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(112vh) rotate(540deg); opacity: .9; } }
.pj-coin { position: absolute; top: 0; animation: pj-coin linear infinite; }
@keyframes pj-stamp { 0% { transform: scale(.2) rotate(-25deg); opacity: 0; } 60% { transform: scale(1.15) rotate(6deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
.pj-stamp { animation: pj-stamp .6s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes pj-rise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.pj-rise { transform-origin: bottom; animation: pj-rise .6s cubic-bezier(.2,.9,.3,1.1) both; }
.pj-lift { transition: transform .2s ease, box-shadow .2s ease; }
@media (hover: hover) { .pj-lift:hover { transform: translateY(-3px); box-shadow: 0 10px 24px -12px rgba(27,42,33,.25); } }
.pj-stagger > * { animation: pj-fade .45s cubic-bezier(.2,.8,.2,1) both; }
.pj-stagger > *:nth-child(2) { animation-delay: .06s; }
.pj-stagger > *:nth-child(3) { animation-delay: .12s; }
.pj-stagger > *:nth-child(4) { animation-delay: .18s; }
.pj-stagger > *:nth-child(5) { animation-delay: .24s; }
@media (prefers-reduced-motion: reduce) { .pj-fade, .pj-pop, .pj-in, .pj-pulse, .pj-float, .pj-glow, .pj-wave, .pj-coin, .pj-stamp, .pj-rise, .pj-stagger > * { animation: none; } .pj-lift { transition: none; } }
`;

function BarChart({
  bars,
  highlight,
  height = 128,
}: {
  bars: { label: string; value: number }[];
  highlight: number;
  height?: number;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
        >
          <span className="text-[11px] tabular-nums text-[#6B7A6E]">
            {b.value > 0 ? fmtNum(b.value) : ""}
          </span>
          <div
            className="w-full rounded-lg transition-[height] duration-500"
            style={{
              height: `${(b.value / max) * 100}%`,
              minHeight: 6,
              background: i === highlight ? LIME : "#1B2A21",
              opacity: b.value > 0 ? 1 : 0.15,
            }}
          />
          <span className="text-[11px] text-[#6B7A6E]">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

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

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (src && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
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

function PointBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3F5E1F]">
      <Icon d={ICONS.star} size={12} fill />
      {fmtNum(points)} point
    </span>
  );
}

function CountUp({ value, ms = 700 }: { value: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(value);
      return;
    }
    let raf = 0;
    let s = 0;
    const tick = (t: number) => {
      if (!s) s = t;
      const p = Math.min(1, (t - s) / ms);
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{fmtNum(v)}</>;
}

function ProfileMenu({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <div className="relative flex shrink-0 items-center gap-2">
      {user && (
        <div
          className="flex items-center gap-1.5 rounded-full bg-white p-1 pr-3 shadow-sm"
          aria-label={`${fmtNum(user.points ?? 0)} point`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B2A21] text-[#C9F25B]">
            <Icon d={ICONS.star} size={18} fill />
          </span>
          <span className="text-[14px] font-semibold tabular-nums">
            {fmtNum(user.points ?? 0)}
          </span>
        </div>
      )}
      {user && (
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="เมนูโปรไฟล์"
          aria-expanded={menu}
          className="flex items-center gap-2 rounded-full bg-white p-1 pr-3 shadow-sm transition-transform active:scale-95"
        >
          <Avatar name={user.name} src={user.avatarUrl} size={36} />
          <span className="max-w-[96px] truncate text-[14px] font-semibold">
            {user.name}
          </span>
        </button>
      )}

      {menu && user && (
        <>
          <button
            aria-label="ปิดเมนู"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setMenu(false)}
          />
          <div className="pj-in absolute right-0 top-12 z-30 w-64 rounded-3xl bg-white p-2 shadow-xl ring-1 ring-[#E3EAD6]">
            <div className="flex items-center gap-3 px-3 py-3">
              <Avatar name={user.name} src={user.avatarUrl} size={44} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">
                  {user.name}
                </div>
                {user.username && (
                  <div className="truncate text-[12px] text-[#6B7A6E]">
                    @{user.username}
                  </div>
                )}
              </div>
            </div>
            <div className="my-1 h-px bg-[#EEF2E4]" />
            <button
              onClick={() => {
                setMenu(false);
                onLogout();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold text-[#D92D20] transition-colors hover:bg-[#FDE8E6]"
            >
              <Icon d={ICONS.logout} size={18} />
              ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Confetti({
  count = 70,
  colors = [LIME, "#E8F5C1", "#FFFFFF", "#8FB54A"],
}: {
  count?: number;
  colors?: string[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const DURATION = 2600;
    const FADE = 700;

    const pieces = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const speed = 2.5 + Math.random() * 5;
      return {
        x: w / 2,
        y: h * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        pw: 5 + Math.random() * 5,
        ph: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.25,
      };
    });

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
      ctx.globalAlpha = el > DURATION - FADE ? Math.max(0, (DURATION - el) / FADE) : 1;

      for (const p of pieces) {
        p.vx *= Math.pow(0.97, dt);
        p.vy = p.vy * Math.pow(0.97, dt) + 0.14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
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

      if (el < DURATION) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };

    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 180);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [count]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

function RewardModal({
  name,
  gain,
  total,
  onClose,
}: {
  name: string;
  gain: number;
  total: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // ข้อความแชร์ใช้ชื่อเต็ม
  const text = `ฉันเป็น ${POINT_QUOTA} คนแรกที่โดดถึงเป้าวันนี้ ได้ +${gain} point จาก ${APP_NAME}! มาโดดเชือกด้วยกันนะ`;

  const share = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: APP_NAME, text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ยินดีด้วย"
      className="pj-in fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#1B2A21]/95 p-5"
    >
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="pj-coin text-[#C9F25B]"
          style={{
            left: `${(i * 37) % 100}%`,
            animationDuration: `${3.2 + (i % 5) * 0.6}s`,
            animationDelay: `${(i % 7) * 0.35}s`,
            opacity: 0.85,
          }}
        >
          <Icon d={ICONS.star} size={18 + (i % 4) * 6} fill />
        </span>
      ))}
      <Confetti count={160} />

      <div className="relative w-full max-w-sm rounded-[32px] bg-[#F3F6EC] p-6 text-center text-[#1B2A21] shadow-2xl">
        <div className="flex flex-col items-center gap-1 text-[15px] font-bold tracking-tight text-[#3F5E1F]">
          <Logo size={64} />
          <span className="leading-tight">{APP_SHORT}</span>
        </div>
        <span className="pj-stamp mx-auto mt-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21] ring-8 ring-[#C9F25B]/40">
          <Icon d={ICONS.star} size={52} fill />
        </span>
        <h2 className="mt-4 text-[26px] font-bold leading-tight">
          สุดยอด {name}!
        </h2>
        <p className="mt-1 text-[14px] text-[#6B7A6E]">
          คุณคือ 1 ใน {POINT_QUOTA} คนแรกที่โดดถึงเป้าวันนี้ รับ point ไปเลย
        </p>
        <div className="mt-4 rounded-3xl bg-[#1B2A21] py-4 text-white">
          <div className="text-[56px] font-semibold leading-none tabular-nums tracking-tight text-[#C9F25B]">
            +<CountUp value={gain} />
          </div>
          <div className="mt-1 text-[14px] text-white/70">point</div>
          <div className="mt-2 text-[12px] text-white/50">
            point สะสมทั้งหมด {fmtNum(total)}
          </div>
        </div>
        <p className="mt-4 text-[13px] text-[#4B5E3A]">
          แคปหน้าจอนี้ไปอวดเพื่อน แล้วชวนมาโดดเชือกด้วยกัน
        </p>
        <button
          onClick={share}
          className="pj-glow mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold transition-all active:scale-[0.98] active:bg-[#B8E348]"
        >
          {copied ? "คัดลอกข้อความแล้ว" : "ชวนเพื่อนมาโดด"}
        </button>
        <button
          onClick={onClose}
          className="mt-2 h-12 w-full rounded-full text-[15px] font-semibold text-[#3F5E1F] active:opacity-60"
        >
          ไปต่อ
        </button>
      </div>
    </div>
  );
}

function SidebarUser({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
      <Avatar name={user.name} src={user.avatarUrl} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{user.name}</div>
        {user.username && (
          <div className="truncate text-[12px] text-[#6B7A6E]">
            @{user.username}
          </div>
        )}
        <PointBadge points={user.points ?? 0} />
      </div>
      <button
        onClick={onLogout}
        aria-label="ออกจากระบบ"
        title="ออกจากระบบ"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#D92D20] transition-colors hover:bg-[#FDE8E6] active:scale-90"
      >
        <Icon d={ICONS.logout} size={18} />
      </button>
    </div>
  );
}

function AuthScreen({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  return mode === "login" ? (
    <LoginForm onAuthed={onAuthed} onSwitch={setMode} />
  ) : (
    <RegisterForm onAuthed={onAuthed} onSwitch={setMode} />
  );
}

function Shell({
  tab,
  onTab,
  profile,
  footer,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  profile: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const items: NavItem[] = [
    ["home", "หน้าหลัก", ICONS.home],
    ["today", "อันดับ", ICONS.trophy],
    ["history", "ประวัติ", ICONS.chart],
    ["settings", "ตั้งค่า", ICONS.gear],
  ];
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#F3F6EC] text-[#1B2A21] lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 p-5 lg:flex">
        <div className="mb-6 flex min-w-0 flex-col items-start gap-1 px-3">
          <Logo size={72} />
          <span className="min-w-0 text-[18px] font-bold leading-tight tracking-tight text-[#3F5E1F]">
            {APP_SHORT}
          </span>
        </div>
        {items.map(([t, label, d]) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={`flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-semibold transition-colors ${
              tab === t
                ? "bg-[#C9F25B] text-[#1B2A21]"
                : "text-[#6B7A6E] hover:bg-[#E8EEDD]"
            }`}
          >
            <Icon d={d} size={20} />
            {label}
          </button>
        ))}
        <div className="mt-auto">{footer}</div>
      </aside>

      <div
        key={tab}
        className="h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ touchAction: "pan-y" }}
      >
      <main
        className="pj-fade mx-auto w-full max-w-6xl px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-10 lg:pb-12 lg:pt-12"
      >
        <div className="mb-4 flex h-10 items-center justify-between gap-3 lg:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-bold tracking-tight lg:hidden">
            <Logo size={48} className="-my-[4px]" />
            <span className="min-w-0 truncate text-[#3F5E1F]">{APP_SHORT}</span>
          </div>
          {profile}
        </div>
        {children}
      </main>
      </div>

      <Navbar tab={tab} onTab={onTab} items={items} />
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [tab, setTab] = useState<Tab>("home");
  const [mode, setMode] = useState<Mode>("count");
  const [seconds, setSeconds] = useState(60);
  const [target, setTarget] = useState(100);
  const [dailyGoal] = useState(DAILY_GOAL);
  const [history, setHistory] = useState<Session[]>([]);
  const [now0, setNow0] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reward, setReward] = useState<{ gain: number; total: number } | null>(
    null
  );
  const [shots, setShots] = useState<DayShots>(EMPTY_SHOTS);
  const [dayMode, setDayMode] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [sound, setSound] = useState(true);
  const [vdim, setVdim] = useState({ w: 9, h: 16 });
  const [sessionKey, setSessionKey] = useState(0);
  const [gyroPromise, setGyroPromise] = useState<Promise<boolean>>(() =>
    Promise.resolve(false)
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const promoShownRef = useRef(false);

  const audioRef = useRef<AudioContext | null>(null);
  const shotsRef = useRef<DayShots>(EMPTY_SHOTS);

  const settingsRef = useRef({ mode, seconds, target, dailyGoal, facing, sound });
  const historyRef = useRef<Session[]>([]);

  const [remoteReady, setRemoteReady] = useState(false);
  const userRef = useRef<User | null>(null);
  const syncedRef = useRef("");

  const loadRemote = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/sessions"),
      ]);
      if (hRes.ok) {
        const h = (await hRes.json()) as { sessions?: Session[] };
        if (Array.isArray(h.sessions)) setHistory(h.sessions);
      }
      if (sRes.ok) {
        const s = (await sRes.json()) as { settings?: Settings | null };
        const v = s.settings;
        if (v) {
          setMode(v.mode);
          setSeconds(v.seconds);
          setTarget(v.target);
          setFacing(v.facing);
          setSound(v.sound);
          syncedRef.current = settingsKey(v);
        } else {
          setFacing("user");
          syncedRef.current = "";
        }
      }
      setRemoteReady(true);
    } catch {}
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    settingsRef.current = { mode, seconds, target, dailyGoal, facing, sound };
  }, [mode, seconds, target, dailyGoal, facing, sound]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      promoShownRef.current = false;
      return;
    }
    if (promoShownRef.current) return;
    promoShownRef.current = true;
    try {
      if (localStorage.getItem(PROMO_KEY) === "1") return;
    } catch {}
    setPromoOpen(true);
  }, [authReady, user]);

  const username = user?.username ?? null;

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    let v: DayShots = EMPTY_SHOTS;
    try {
      const raw = localStorage.getItem(`${SHOTS_KEY}:${username ?? "guest"}`);
      if (raw) {
        const d = JSON.parse(raw) as DayShots;
        if (d && d.day === dayKey(Date.now())) {
          v = { day: d.day, start: d.start ?? null, end: d.end ?? null };
        }
      }
    } catch {}
    shotsRef.current = v;
    setShots(v);

    // รูปของวันนี้ที่บันทึกไว้บนเซิร์ฟเวอร์ (Drive) ใช้เมื่อในเครื่องนี้ไม่มีรูป
    // เช่น ล็อกอินจากเครื่องหรือเบราว์เซอร์อื่น หรือล้างข้อมูลเบราว์เซอร์
    if (username) {
      fetch("/api/snapshot", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            d: {
              snapshots?: Partial<Record<"first-of-day" | "near-goal", string>>;
            } | null
          ) => {
            if (cancelled || !d?.snapshots) return;
            const dk = dayKey(Date.now());
            const cur = shotsRef.current;
            const base =
              cur.day === dk ? cur : { day: dk, start: null, end: null };
            const next: DayShots = {
              day: dk,
              start: base.start ?? d.snapshots["first-of-day"] ?? null,
              end: base.end ?? d.snapshots["near-goal"] ?? null,
            };
            if (cur.day === dk && next.start === cur.start && next.end === cur.end)
              return;
            shotsRef.current = next;
            setShots(next);
          }
        )
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [authReady, username]);

  useEffect(() => {
    setNow0(Date.now());
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.mode === "time" || v.mode === "count") setMode(v.mode);
        if (typeof v.seconds === "number") setSeconds(v.seconds);
        if (typeof v.target === "number") setTarget(v.target);
        if (v.facing === "user" || v.facing === "environment")
          setFacing(v.facing);
        if (typeof v.sound === "boolean") setSound(v.sound);
      }
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) {
        const arr = JSON.parse(h);
        if (Array.isArray(arr)) setHistory(arr);
      }
    } catch {}

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: User | null } | null) => {
        if (d?.user) {
          setUser(d.user);
          loadRemote();
        }
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [loadRemote]);

  useEffect(() => {
    const cur: Settings = { mode, seconds, target, dailyGoal, facing, sound };
    if (!user) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
      } catch {}
      return;
    }
    if (!remoteReady) return;
    const body = settingsKey(cur);
    if (body === syncedRef.current) return;
    const t = setTimeout(() => {
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then((r) => {
          if (r.ok) syncedRef.current = body;
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [user, remoteReady, mode, seconds, target, dailyGoal, facing, sound]);

  useEffect(() => {
    document.title = APP_NAME;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "#F3F6EC");
    document.documentElement.style.backgroundColor = "#F3F6EC";
    document.documentElement.style.colorScheme = "light";
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";
    document.body.style.overscrollBehaviorX = "none";
    // portal (เช่น popup สมาชิกแผนก) ต่อกับ body โดยตรง ต้องได้ฟอนต์เดียวกับทั้งแอป
    document.body.style.fontFamily = FONT;
  }, []);

  const commitShot = useCallback((kind: "start" | "end", img: string | null) => {
    if (!img) return;
    const dk = dayKey(Date.now());
    const base =
      shotsRef.current.day === dk
        ? shotsRef.current
        : { day: dk, start: null, end: null };
    const next: DayShots = { ...base, [kind]: img };
    shotsRef.current = next;
    setShots(next);
    try {
      localStorage.setItem(
        `${SHOTS_KEY}:${userRef.current?.username ?? "guest"}`,
        JSON.stringify(next)
      );
    } catch {}
    // ส่งภาพขึ้น Drive เฉพาะผู้ใช้ที่ล็อกอิน เซิร์ฟเวอร์กันบันทึกซ้ำรายวันให้เอง
    if (userRef.current) {
      uploadShot(kind, img).catch(() => {});
    }
  }, []);

  const getTodayBase = useCallback(() => {
    const dk0 = dayKey(Date.now());
    return historyRef.current.reduce(
      (a, x) => (dayKey(x.ts) === dk0 ? a + x.total : a),
      0
    );
  }, []);

  const handleFinish = useCallback((result: Summary) => {
    const prev = historyRef.current;
    result.record =
      result.total > 0 &&
      prev.length > 0 &&
      result.total > Math.max(...prev.map((s) => s.total));

    if (result.total > 0) {
      const ts = Date.now();
      const entry: Session = {
        id: ts,
        ts,
        total: result.total,
        durationMs: result.durationMs,
        perMin: result.perMin,
        best: result.bestTenSec,
        mode: settingsRef.current.mode,
        kcal: Math.round(result.total * KCAL_PER_JUMP),
      };
      setNow0(ts);
      const loggedIn = !!userRef.current;
      setHistory((p) => {
        const next = [entry, ...p].slice(0, 300);
        if (!loggedIn) {
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          } catch {}
        }
        return next;
      });
      if (loggedIn) {
        const before = userRef.current?.points ?? 0;
        fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { points?: number } | null) => {
            const pts = d?.points;
            if (typeof pts === "number") {
              if (pts > before) setReward({ gain: POINT_REWARD, total: pts });
              setUser((u) => (u ? { ...u, points: pts } : u));
            }
          })
          .catch(() => {});
      }
    }

    setSummary(result);
    setPhase("summary");
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    setTab("home");
    setPhase("setup");
  }, []);

  const handlePoints = useCallback((pts: number) => {
    setUser((u) => (u && u.points !== pts ? { ...u, points: pts } : u));
  }, []);

  // อัปเดตชื่อ/รูปโปรไฟล์ใน state หลังบันทึกจากหน้าตั้งค่า
  const updateProfile = useCallback((patch: Partial<User>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const startSession = useCallback(() => {
    setGyroPromise(Pose.prime(facing, audioRef));
    setError(null);
    setDayMode(false);
    setReward(null);
    setSessionKey((k) => k + 1);
    setPhase("session");
  }, [facing]);

  const closePromo = useCallback((hide: boolean) => {
    setPromoOpen(false);
    if (hide) {
      try {
        localStorage.setItem(PROMO_KEY, "1");
      } catch {}
    }
  }, []);

  const goHome = () => {
    setTab("home");
    setPhase("setup");
  };

  const login = (u: User) => {
    setUser(u);
    loadRemote();
  };

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setRemoteReady(false);
    syncedRef.current = "";
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      const arr = h ? JSON.parse(h) : [];
      setHistory(Array.isArray(arr) ? arr : []);
    } catch {
      setHistory([]);
    }
  };

  const todayList = now0
    ? history.filter((s) => dayKey(s.ts) === dayKey(now0))
    : [];
  const todayTotal = todayList.reduce((a, s) => a + s.total, 0);
  const todayMs = todayList.reduce((a, s) => a + s.durationMs, 0);
  const todayKcal = todayList.reduce((a, s) => a + s.kcal, 0);
  const goalPct = Math.min(1, todayTotal / Math.max(1, dailyGoal));

  let streak = 0;
  if (now0) {
    const days = new Set(history.map((s) => dayKey(s.ts)));
    let t = now0;
    if (!days.has(dayKey(t))) t -= DAY;
    while (days.has(dayKey(t))) {
      streak++;
      t -= DAY;
    }
  }

  const openToday = () => {
    if (todayList.length === 0) return;
    const rounds = [...todayList].sort((a, b) => a.ts - b.ts);
    setSummary({
      total: todayTotal,
      durationMs: Math.max(1000, todayMs),
      perMin: todayMs > 0 ? Math.round((todayTotal / todayMs) * 60000) : 0,
      bestTenSec: Math.max(0, ...rounds.map((r) => r.best)),
      consistency: 0,
      buckets: rounds.map((r) => r.total),
      reason: "manual",
      record: false,
    });
    setDayMode(true);
    setPhase("summary");
  };

  const closeSummary = () => {
    setTab(dayMode ? "today" : "home");
    setDayMode(false);
    setReward(null);
    setPhase("setup");
  };

  const fontStyle = { fontFamily: FONT, touchAction: "manipulation" as const };
  const card = "rounded-3xl bg-white pj-lift";
  const limeBtn =
    "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348]";

  if (!authReady) {
    return <div className="min-h-dvh bg-[#F3F6EC]" />;
  }

  if (phase === "session") {
    return (
      <div style={fontStyle} className="select-none antialiased">
        <style>{STYLES}</style>
        <Pose
          key={sessionKey}
          settings={{ mode, seconds, target, dailyGoal, facing, sound }}
          audioRef={audioRef}
          gyroPromise={gyroPromise}
          shotsRef={shotsRef}
          getTodayBase={getTodayBase}
          onShot={commitShot}
          onVideoSize={(w: number, h: number) => setVdim({ w, h })}
          onFinish={handleFinish}
          onCancel={goHome}
          onError={handleError}
        />
      </div>
    );
  }

  if (phase === "setup") {
    const clearHistory = () => {
      setHistory([]);
      if (user) {
        fetch("/api/sessions", { method: "DELETE" }).catch(() => {});
      } else {
        try {
          localStorage.removeItem(HISTORY_KEY);
        } catch {}
      }
    };

    return (
      <div style={fontStyle} className="select-none antialiased">
        <style>{STYLES}</style>
        <Shell
          tab={tab}
          onTab={setTab}
          profile={<ProfileMenu user={user} onLogout={logout} />}
          footer={<SidebarUser user={user} onLogout={logout} />}
        >
          {tab === "home" && (
            <HomeView
              user={user}
              now0={now0}
              dailyGoal={dailyGoal}
              todayTotal={todayTotal}
              todayMs={todayMs}
              todayKcal={todayKcal}
              todayRounds={todayList.length}
              streak={streak}
              history={history}
              error={error}
              onStart={startSession}
              onViewHistory={() => setTab("history")}
            />
          )}
          {tab === "today" && (
            <Rank
              username={user?.username ?? null}
              hasDepartment={!!(user?.departmentId || user?.branchId)}
              onStart={startSession}
              onOpenResult={openToday}
              hasToday={todayList.length > 0}
              onPoints={handlePoints}
            />
          )}
          {tab === "history" && (
            <History history={history} now0={now0} dailyGoal={dailyGoal} />
          )}
          {tab === "settings" && (
            <Setting
              user={user}
              onUserChange={updateProfile}
              facing={facing}
              onFacing={setFacing}
              sound={sound}
              onSound={setSound}
              onClearHistory={clearHistory}
            />
          )}
        </Shell>
        {user && promoOpen && tab === "home" && (
          <PromoPopup
            onClose={closePromo}
            onStart={(hide) => {
              closePromo(hide);
              setTab("home");
            }}
          />
        )}
        {!user && <AuthScreen onAuthed={login} />}
      </div>
    );
  }

  const reached = todayTotal >= dailyGoal;
  const title = dayMode
    ? reached
      ? "ถึงเป้าวันนี้แล้ว เก่งมาก!"
      : "ผลวันนี้"
    : summary?.record
      ? "สถิติใหม่!"
      : reached
        ? "เก่งมาก! ถึงเป้าแล้ว"
        : summary?.reason === "manual"
          ? "จบการกระโดด"
          : "ทำได้ดีมาก!";

  if (!summary) return null;

  const sub = dayMode
    ? `${new Date(now0 ?? Date.now()).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })} · ${todayList.length} รอบ`
    : summary.reason === "time"
      ? "ครบเวลา"
      : summary.reason === "count"
        ? "ครบจำนวนครั้ง"
        : "หยุดเอง";
  const kcal = dayMode ? todayKcal : Math.round(summary.total * KCAL_PER_JUMP);
  const bars = summary.buckets.map((n, i) => ({
    label: dayMode ? `${i + 1}` : `${i * 10}`,
    value: n,
  }));
  const peak = bars.reduce(
    (bi, b, i, arr) => (b.value > arr[bi].value ? i : bi),
    0
  );

  const tiles: [string, string, string][] = [
    ["เวลา", formatTime(summary.durationMs), "นาที"],
    ["พลังงาน", `~${kcal}`, "กิโลแคลอรี่"],
    ["เฉลี่ย", `${summary.perMin}`, "ครั้ง/นาที"],
  ];

  return (
    <div
      style={fontStyle}
      className="min-h-dvh select-none overflow-x-hidden bg-[#F3F6EC] text-[#1B2A21] antialiased"
    >
      <style>{STYLES}</style>
      <main className="pj-fade mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-5xl lg:py-10">
        <header className="flex items-start gap-3">
          <button
            onClick={closeSummary}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white transition-transform active:scale-90"
          >
            <Icon d={ICONS.close} size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight">
              {dayMode ? "ผลวันนี้" : `${APP_SHORT} · สรุปผล`}
            </h1>
            <p className="text-[13px] text-[#6B7A6E]">{sub}</p>
          </div>
        </header>

        <div className="mt-5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9F25B]">
            <Icon d={ICONS.check} size={18} />
          </span>
          <span className="text-[18px] font-semibold">{title}</span>
        </div>

        <div className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-3">
        <section className="relative overflow-hidden rounded-3xl bg-[#1B2A21] px-5 py-8 text-center text-white lg:py-12">
          {!dayMode && summary.total > 0 && (
            <Confetti count={summary.record ? 110 : 70} />
          )}
          <div className="text-[13px] text-white/60">{dayMode ? "ครั้งรวมวันนี้" : "จำนวนครั้งทั้งหมด"}</div>
          <div className="mt-1 flex items-baseline justify-center gap-2">
            <span className="pj-pop text-[88px] font-semibold leading-none tabular-nums tracking-tight">
              <CountUp value={summary.total} />
            </span>
            <span className="text-[18px] text-white/70">ครั้ง</span>
          </div>
          {summary.record && (
            <span className="mt-4 inline-block rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-medium text-[#C9F25B]">
              🏆 สถิติใหม่ของคุณ
            </span>
          )}
        </section>

        <div className="grid grid-cols-3 gap-3">
          {tiles.map(([label, v, unit]) => (
            <div key={label} className="rounded-2xl bg-white p-3 text-center">
              <div className="text-[12px] text-[#6B7A6E]">{label}</div>
              <div className="mt-1 text-[22px] font-semibold tabular-nums">
                {v}
              </div>
              <div className="text-[11px] text-[#6B7A6E]">{unit}</div>
            </div>
          ))}
        </div>

        </div>

        <div className="space-y-3">
        <section className={`${card} p-4 lg:p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              {dayMode ? "ยอดแต่ละรอบ" : "จังหวะการกระโดด"}
            </h2>
            <span className="text-[12px] text-[#6B7A6E]">
              {dayMode ? "ครั้ง / รอบ" : "ครั้ง / 10 วินาที"}
            </span>
          </div>
          <div className="mt-4">
            <BarChart bars={bars} highlight={peak} height={112} />
          </div>
          <p className="mt-3 text-[12px] text-[#6B7A6E]">
            10 วินาทีที่เร็วสุด {summary.bestTenSec} ครั้ง
            {!dayMode &&
              summary.total >= 5 &&
              ` · จังหวะสม่ำเสมอ ${summary.consistency}%`}
          </p>
        </section>

        <section className={`${card} p-4 lg:p-5`}>
          <h2 className="text-[15px] font-semibold">ภาพยืนยันการกระโดดวันนี้</h2>
          <div className="mt-3 grid grid-cols-2 items-start gap-3">
            {(
              [
                ["ภาพแรกของวัน", shots.start, "ยังไม่มีภาพ"],
                [
                  "ใกล้ถึงเป้าวันนี้",
                  shots.end,
                  `จะถ่ายเมื่อโดดถึง ${fmtNum(Math.ceil(dailyGoal * 0.9))} ครั้ง`,
                ],
              ] as const
            ).map(([label, src, empty]) => (
              <figure key={label}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`ภาพผู้กระโดด ${label}`}
                    referrerPolicy="no-referrer"
                    className="h-auto w-full rounded-2xl bg-[#EEF2E4]"
                  />
                ) : (
                  <div
                    className="flex w-full items-center justify-center rounded-2xl bg-[#EEF2E4] px-2 text-center text-[12px] text-[#6B7A6E]"
                    style={{ aspectRatio: `${vdim.w} / ${vdim.h}` }}
                  >
                    {empty}
                  </div>
                )}
                <figcaption className="mt-1.5 text-center text-[12px] text-[#6B7A6E]">
                  {label}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[#6B7A6E]">
            ถ่ายวันละ 2 ภาพ ผู้ที่เข้าสู่ระบบจะถูกบันทึกภาพไว้ใน Google Drive ของแอป และรีเซ็ตทุกวัน
          </p>
        </section>

        <section className="rounded-3xl bg-[#E8F5C1] p-4 lg:p-5">
          <div className="flex items-center justify-between text-[14px] font-semibold">
            <span>
              วันนี้ {fmtNum(todayTotal)} / {fmtNum(dailyGoal)} ครั้ง
            </span>
            <span className="tabular-nums">{Math.round(goalPct * 100)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-[#3F5E1F] transition-[width] duration-500"
              style={{ width: `${goalPct * 100}%` }}
            />
          </div>
          {user && (
            <div className="mt-3">
              <PointBadge points={user.points ?? 0} />
            </div>
          )}
        </section>

        </div>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6 lg:flex-row lg:gap-4 lg:pt-8">
          <button onClick={startSession} className={limeBtn}>
            {dayMode ? "เริ่มกระโดด" : "เริ่มอีกรอบ"}
          </button>
          <button
            onClick={closeSummary}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-[17px] font-semibold transition-all active:scale-[0.98]"
          >
            <Icon d={ICONS.home} size={20} />
            {dayMode ? "กลับหน้าวันนี้" : "กลับหน้าหลัก"}
          </button>
        </div>
      </main>

      {reward && !dayMode && (
        <RewardModal
          name={user?.name ?? ""}
          gain={reward.gain}
          total={reward.total}
          onClose={() => setReward(null)}
        />
      )}
    </div>
  );
}