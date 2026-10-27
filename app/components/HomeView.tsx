"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ICONS,
  Icon,
  POINT_QUOTA,
  POINT_REWARD,
} from "./auth-shared";
import type { User } from "./auth-shared";
import type { Session } from "./History";
import DepartmentCard from "./DepartmentCard";
import Jumper from "./Jumper";
import { BanCountdown } from "./BanNotice";
import { GOAL_WEEKS, fmtGoalRange, goalRangeOfTime } from "./goal";

/* ------------------------------------------------------------------ */
/* หน้าหลัก (แท็บ "หน้าหลัก")                                            */
/* แยกมาจาก app/page.tsx รวม Ring / RulesBoard / รายการรอบล่าสุดไว้ในไฟล์นี้เลย */
/* ------------------------------------------------------------------ */

// สี
const LIME = "#C9F25B";

const card = "rounded-3xl bg-white pj-lift";

// กติกาการเล่น: เป้าและช่วงวันที่ของแต่ละสัปดาห์ดึงจาก goal.ts (GOAL_WEEKS) ที่เดียว
// แก้ตารางที่ goal.ts แล้วหน้านี้เปลี่ยนตามเอง

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

// สถิติเล็ก ๆ ในการ์ดเป้าหมายวันนี้ (ไอคอน + ตัวเลข + ป้าย)
function MiniStat({
  icon,
  value,
  label,
  className = "",
}: {
  icon: string;
  value: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#C9F25B]">
        <Icon d={icon} size={14} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-[15px] font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] text-white/55">{label}</div>
      </div>
    </div>
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
// currentFrom = วันเริ่มของสัปดาห์ปัจจุบัน (ใช้ไฮไลต์แถว) null ถ้าวันนี้อยู่นอกตาราง
function RulesBoard({ currentFrom }: { currentFrom: string | null }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <section className="relative flex min-h-0 flex-col justify-end overflow-hidden rounded-[32px] lg:min-h-[560px] bg-gradient-to-t from-[#1B2A21] to-[#8FB54A] text-white shadow-lg">
      {imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/img/jump.PNG"
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
          {GOAL_WEEKS.map((r) => {
            const current = r.from === currentFrom;
            return (
              <li
                key={r.week}
                aria-current={current ? "date" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 backdrop-blur-md ${
                  current
                    ? "bg-white/25 ring-2 ring-[#C9F25B]"
                    : "bg-white/15 ring-1 ring-white/20"
                }`}
              >
                <span className="flex h-9 shrink-0 items-center rounded-full bg-[#C9F25B] px-3 text-[13px] font-semibold text-[#1B2A21]">
                  Week {r.week}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[16px] font-semibold tabular-nums">
                    โดด {fmtNum(r.goal)} ครั้ง/วัน
                  </div>
                  <div className="mt-0.5 text-[12px] text-white/70">
                    {fmtGoalRange(r.from, r.to)}
                  </div>
                </div>
                {current && (
                  <span className="shrink-0 rounded-full bg-[#C9F25B] px-2.5 py-1 text-[11px] font-semibold text-[#1B2A21]">
                    สัปดาห์นี้
                  </span>
                )}
              </li>
            );
          })}
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
  banned = null,
  onShowBan,
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
  // แบนที่ยังมีผลอยู่ (null = เล่นได้ปกติ)
  banned?: { reason: string; expiresAt: number } | null;
  onShowBan?: () => void;
}) {
  const goalPct = Math.min(1, todayTotal / Math.max(1, dailyGoal));
  const left = Math.max(0, dailyGoal - todayTotal);

  // สัปดาห์ปัจจุบันตามตารางเป้า (เวลาไทย) null ถ้าวันนี้อยู่นอกตาราง
  const range = now0 ? goalRangeOfTime(now0) : null;
  const weekNo = range
    ? (GOAL_WEEKS.find((w) => w.from === range.from)?.week ?? null)
    : null;
  const weekLine = range
    ? `${weekNo ? `สัปดาห์ที่ ${weekNo} · ` : ""}${fmtGoalRange(range.from, range.to)}`
    : null;

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
          <section className="rounded-3xl bg-[#1B2A21] p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[15px] font-semibold">เป้าหมายวันนี้</span>
              {streak > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-[#C9F25B]">
                  <Icon d={ICONS.flame} size={14} />
                  ต่อเนื่อง {streak} วัน
                </span>
              )}
            </div>
            {weekLine && (
              <p className="mt-1 text-[12px] text-white/55">{weekLine}</p>
            )}
            <div className="mt-3 flex flex-row-reverse items-center gap-4">
              {/* ขวา: วงกลม + Jumper + % ใต้วง */}
              <div className="flex shrink-0 flex-col items-center">
                <Ring
                  value={goalPct}
                  size={124}
                  stroke={9}
                  track="rgba(255,255,255,0.12)"
                  color={LIME}
                >
                  <Jumper size={78} />
                </Ring>
                <div className="mt-1.5 flex items-baseline gap-1.5 leading-none">
                  <span className="text-[20px] font-semibold tabular-nums text-[#C9F25B]">
                    {Math.round(goalPct * 100)}%
                  </span>
                  <span className="text-[11px] text-white/60">ทำได้แล้ว</span>
                </div>
              </div>

              {/* ซ้าย: ตัวเลขหลัก + ข้อความ + สถิติวันนี้ */}
              <div className="min-w-0 flex-1">
                <div className="text-[40px] font-semibold leading-none tabular-nums tracking-tight lg:text-[56px]">
                  <CountUp value={todayTotal} />
                </div>
                <div className="mt-1.5 text-[13px] text-white/60">
                  จาก {fmtNum(dailyGoal)} ครั้ง
                </div>
                <div className="mt-1 text-[13px] font-medium text-[#C9F25B]">
                  {left > 0
                    ? `อีก ${fmtNum(left)} ครั้งก็ถึงเป้า!`
                    : "ถึงเป้าวันนี้แล้ว เก่งมาก!"}
                </div>

                <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                  <MiniStat
                    icon={ICONS.clock}
                    value={formatTime(todayMs)}
                    label="นาทีที่กระโดด"
                  />
                  <MiniStat
                    icon={ICONS.flame}
                    value={todayKcal}
                    label="กิโลแคลอรี่"
                  />
                  <MiniStat
                    icon={ICONS.bolt}
                    value={todayRounds}
                    label="รอบวันนี้"
                    className="hidden lg:flex"
                  />
                </div>
              </div>
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="pj-in rounded-2xl bg-white px-4 py-3 text-[14px] text-[#D92D20]"
            >
              {error}
            </p>
          )}

          {banned ? (
            <div className="rounded-3xl bg-[#FDE8E6] p-4 text-[#D92D20]">
              <div className="text-[16px] font-bold">
                บัญชีถูกแบน เล่นไม่ได้ชั่วคราว
              </div>
              <div className="mt-2 text-[12px]">เหลือเวลาอีก</div>
              <BanCountdown
                expiresAt={banned.expiresAt}
                className="block text-[34px] font-bold leading-none"
              />
              <p className="mt-2 text-[13px]">
                หมดแบน{" "}
                {new Date(banned.expiresAt).toLocaleString("th-TH", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <button
                onClick={onShowBan}
                className="mt-2 text-[13px] font-semibold underline"
              >
                ดูเหตุผล
              </button>
            </div>
          ) : (
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-x-2 -inset-y-1 animate-pulse rounded-full bg-[#E4FF4D] opacity-80 blur-xl motion-reduce:animate-none"
              />
              <button
                onClick={onStart}
                className="relative z-10 flex h-16 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-b from-[#F6FF8A] via-[#E2FC5C] to-[#C4F230] text-[18px] font-extrabold text-[#1B2A21] shadow-[0_0_28px_rgba(214,255,64,0.75),0_8px_20px_rgba(118,255,3,0.25)] ring-2 ring-inset ring-white/70 transition-all duration-150 hover:brightness-105 active:scale-[0.98] active:brightness-95"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B2A21] text-[#E2FC5C] shadow-md">
                  <Icon d={ICONS.play} size={18} fill />
                </span>
                เริ่มกระโดด
              </button>
            </div>
          )}

          {user && (
            <DepartmentCard
              companyId={user.companyId}
              departmentId={user.departmentId}
              branchId={user.branchId}
              myUsername={user.username}
            />
          )}
        </div>

        <div className="pj-stagger space-y-4">
          <RulesBoard currentFrom={range?.from ?? null} />

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