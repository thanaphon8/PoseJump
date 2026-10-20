"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ICONS,
  Icon,
  POINT_QUOTA,
  POINT_REWARD,
} from "../auth-shared";
import type { User } from "../auth-shared";
import type { Session } from "../history/page";

/* ------------------------------------------------------------------ */
/* หน้าหลัก (แท็บ "หน้าหลัก")                                            */
/* แยกมาจาก app/page.tsx รวม Ring / RulesBoard / รายการรอบล่าสุดไว้ในไฟล์นี้เลย */
/* ------------------------------------------------------------------ */

// สี
const LIME = "#C9F25B";

const card = "rounded-3xl bg-white pj-lift";

// กติกาการเล่น: ใส่ reward ในแถวไหนก็ได้ ถ้าสัปดาห์นั้นมีแต้ม
const WEEK_RULES: { week: number; jumps: number; reward?: number }[] = [
  { week: 1, jumps: 100, reward: POINT_REWARD },
  { week: 2, jumps: 200, reward: POINT_REWARD },
  { week: 3, jumps: 300, reward: POINT_REWARD },
  { week: 4, jumps: 500, reward: POINT_REWARD },
];

/* ---------------------------- ฟังก์ชันช่วย ---------------------------- */

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtNum = (n: number) => n.toLocaleString("en-US");

/* ---------------------------- ส่วนประกอบ UI ---------------------------- */

function Ring({
  value,
  size,
  stroke,
  track,
  color,
  children,
}: {
  value: number;
  size: number;
  stroke: number;
  track: string;
  color: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ป้าย point รวมของบัญชี
function PointBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3F5E1F]">
      <Icon d={ICONS.star} size={12} fill />
      {fmtNum(points)} point
    </span>
  );
}

// ตัวเลขนับขึ้นจาก 0 (ไม่นับถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว)
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

// ป้ายประกาศกติกาการเล่น: สไตล์เดียวกับป๊อปอัพ รูปเต็มการ์ด ข้อความอยู่ในรูป พื้นไล่สีเขียวเข้ม→อ่อน
function RulesBoard() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <section className="relative flex min-h-0 flex-col justify-end overflow-hidden rounded-[32px] lg:min-h-[560px] bg-gradient-to-t from-[#1B2A21] to-[#8FB54A] text-white shadow-lg">
      {imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/img/jump.jpg"
          alt=""
          draggable={false}
          onError={() => setImgOk(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* ไล่สีเขียว: เข้มล่าง (ที่ข้อความ) → จางบน (เห็นรูป) */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A21] via-[#1B2A21]/90 via-55% to-[#3F5E1F]/10" />

      <div className="relative px-5 pb-5 pt-24 lg:pt-48">
        <div className="text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#C9F25B] px-3 py-1 text-[12px] font-semibold text-[#1B2A21]">
            <Icon d={ICONS.star} size={12} fill />
            กติกาการเล่น
          </span>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight drop-shadow-sm">
            {POINT_QUOTA} คนแรกของทุกวัน รับ{" "}
            <span className="inline-flex items-center gap-1.5 align-middle text-[#C9F25B]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                <Icon d={ICONS.star} size={18} fill />
              </span>
              {POINT_REWARD} point!
            </span>
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-white/85">
            ทำเป้าหมายรายวันให้สำเร็จ เซ็ตใหม่ทุกเที่ยงคืนเวลาไทย
          </p>
        </div>

        <ul className="pj-stagger mt-4 space-y-2">
          {WEEK_RULES.map((r) => (
            <li
              key={r.week}
              className="flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-2.5 ring-1 ring-white/20 backdrop-blur-md"
            >
              <span className="flex h-9 shrink-0 items-center rounded-full bg-[#C9F25B] px-3 text-[13px] font-semibold text-[#1B2A21]">
                Week {r.week}
              </span>
              <span className="flex-1 text-[16px] font-semibold tabular-nums">
                โดด {fmtNum(r.jumps)} ครั้ง
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const sessionRow = (s: Session) => (
  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F5C1] text-[#3F5E1F]">
      <Icon d={ICONS.bolt} size={18} />
    </span>
    <div className="min-w-0 flex-1">
      <div className="text-[16px] font-semibold tabular-nums">
        {fmtNum(s.total)} ครั้ง
      </div>
      <div className="truncate text-[12px] text-[#6B7A6E]">
        {fmtDate(s.ts)} · {fmtClock(s.ts)} · {formatTime(s.durationMs)} นาที
      </div>
    </div>
    <div className="text-right text-[12px] tabular-nums text-[#6B7A6E]">
      {s.kcal} kcal
      <br />
      {s.perMin}/นาที
    </div>
  </li>
);

/* ------------------------------------------------------------------ */
/* หน้าหลัก                                                              */
/* ------------------------------------------------------------------ */

export default function Home({
  user,
  now0,
  dailyGoal,
  todayTotal,
  todayMs,
  todayKcal,
  todayRounds,
  streak,
  history,
  error,
  onStart,
  onViewHistory,
}: {
  user: User | null;
  now0: number | null;
  dailyGoal: number;
  todayTotal: number;
  todayMs: number;
  todayKcal: number;
  todayRounds: number;
  streak: number;
  history: Session[];
  error: string | null;
  onStart: () => void;
  onViewHistory: () => void;
}) {
  const goalPct = Math.min(1, todayTotal / Math.max(1, dailyGoal));
  const left = Math.max(0, dailyGoal - todayTotal);

  return (
    <>
      <header className="mb-5">
        <p className="min-h-[18px] text-[13px] text-[#6B7A6E]">
          {now0
            ? new Date(now0).toLocaleDateString("th-TH", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : ""}
        </p>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[36px]">
          พร้อมโดดไหม{user ? ` ${user.name}` : ""} 👋
        </h1>
        {user && (
          <div className="mt-1 hidden lg:block">
            <PointBadge points={user.points ?? 0} />
          </div>
        )}
      </header>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <div className="pj-stagger space-y-4">
          <section className="rounded-3xl bg-[#1B2A21] p-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[15px] font-semibold">เป้าหมายวันนี้</span>
              {streak > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-[#C9F25B]">
                  <Icon d={ICONS.flame} size={14} />
                  ต่อเนื่อง {streak} วัน
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[56px] font-semibold leading-none tabular-nums tracking-tight lg:text-[72px]">
                  <CountUp value={todayTotal} />
                </div>
                <div className="mt-2 text-[14px] text-white/60">
                  จาก {fmtNum(dailyGoal)} ครั้ง
                </div>
                <div className="mt-2 text-[13px] font-medium text-[#C9F25B]">
                  {left > 0
                    ? `อีก ${fmtNum(left)} ครั้งก็ถึงเป้า!`
                    : "ถึงเป้าวันนี้แล้ว เก่งมาก!"}
                </div>
              </div>
              <Ring
                value={goalPct}
                size={112}
                stroke={10}
                track="rgba(255,255,255,0.12)"
                color={LIME}
              >
                <span className="text-[24px] font-semibold tabular-nums text-[#C9F25B]">
                  {Math.round(goalPct * 100)}%
                </span>
                <span className="text-[11px] text-white/60">ทำได้แล้ว</span>
              </Ring>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className={`${card} flex items-center gap-3 p-4`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
                <Icon d={ICONS.clock} size={20} />
              </span>
              <div>
                <div className="text-[20px] font-semibold tabular-nums">
                  {formatTime(todayMs)}
                </div>
                <div className="text-[12px] text-[#6B7A6E]">นาทีที่กระโดด</div>
              </div>
            </div>
            <div className={`${card} flex items-center gap-3 p-4`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
                <Icon d={ICONS.flame} size={20} />
              </span>
              <div>
                <div className="text-[20px] font-semibold tabular-nums">
                  {todayKcal}
                </div>
                <div className="text-[12px] text-[#6B7A6E]">กิโลแคลอรี่</div>
              </div>
            </div>
            <div className={`${card} hidden items-center gap-3 p-4 lg:flex`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
                <Icon d={ICONS.bolt} size={20} />
              </span>
              <div>
                <div className="text-[20px] font-semibold tabular-nums">
                  {todayRounds}
                </div>
                <div className="text-[12px] text-[#6B7A6E]">รอบวันนี้</div>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="pj-in rounded-2xl bg-white px-4 py-3 text-[14px] text-[#D92D20]"
            >
              {error}
            </p>
          )}

          <div className="relative">
            <span aria-hidden className="pj-wave" />
            <span aria-hidden className="pj-wave pj-wave-2" />
            <span aria-hidden className="pj-wave pj-wave-3" />
            <button
              onClick={onStart}
              className="relative z-10 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#EEFF41] to-[#76FF03] text-[17px] font-bold text-[#1B2A21] shadow-lg shadow-[#76FF03]/50 transition-all duration-150 active:scale-[0.98] active:brightness-95"
            >
              <Icon d={ICONS.play} size={20} fill />
              เริ่มกระโดด
            </button>
          </div>
          <p className="text-center text-[12px] text-[#6B7A6E]">
            พิงมือถือกับลังหรือผนังให้หงายขึ้นเล็กน้อย สูงระดับเอว ยืนให้เห็นศีรษะถึงเท้า แล้วกางมือเหมือนจับเชือก
          </p>
        </div>

        <div className="pj-stagger space-y-4">
          <RulesBoard />

          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[16px] font-semibold">รอบล่าสุด</h2>
              <button
                onClick={onViewHistory}
                className="text-[13px] font-medium text-[#3F5E1F]"
              >
                ดูทั้งหมด →
              </button>
            </div>
            {history.length === 0 ? (
              <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
                ยังไม่มีประวัติ เริ่มกระโดดรอบแรกได้เลย
              </p>
            ) : (
              <ul className={`${card} divide-y divide-[#EEF2E4]`}>
                {history.slice(0, 3).map(sessionRow)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}