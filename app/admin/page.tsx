"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Prompt } from "next/font/google";

const APP_NAME = "Pose Jump";

// ต้องตรงกับ lib/admin-stats.ts และฝั่งผู้ใช้
const POINT_QUOTA = 100;
const POINT_REWARD = 50;

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const FONT = `${prompt.style.fontFamily}, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", Sarabun, sans-serif`;

const STYLES = `
@keyframes pj-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pj-in { from { opacity: 0; } to { opacity: 1; } }
.pj-fade { animation: pj-fade .35s cubic-bezier(.2,.8,.2,1) both; }
.pj-in { animation: pj-in .25s ease-out both; }
.pj-stagger > * { animation: pj-fade .45s cubic-bezier(.2,.8,.2,1) both; }
.pj-stagger > *:nth-child(2) { animation-delay: .06s; }
.pj-stagger > *:nth-child(3) { animation-delay: .12s; }
.pj-stagger > *:nth-child(4) { animation-delay: .18s; }
@media (prefers-reduced-motion: reduce) { .pj-fade, .pj-in, .pj-stagger > * { animation: none; } }
`;

/* ---------------- ชนิดข้อมูล ---------------- */

type DayEntry = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
};
type DayData = {
  date: string;
  quota: number;
  reward: number;
  reachedCount: number;
  awardedCount: number;
  entries: DayEntry[];
};
type WeekEntry = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  points: number;
  total: number;
  rewardDays: number;
  perDay: number[];
};
type WeekData = { start: string; days: string[]; entries: WeekEntry[] };
type View = "day" | "week";

/* ---------------- ฟังก์ชันช่วย ---------------- */

const fmtNum = (n: number) => n.toLocaleString("en-US");
const DAY = 864e5;
const TZ = 7 * 3600e3;
const todayYmd = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const shiftYmd = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
const fmtShort = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const fmtLong = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const DAY_NAMES = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 401 || r.status === 403) throw new Error("locked");
  if (!r.ok) throw new Error("load failed");
  return (await r.json()) as T;
}

const matches = (q: string, name: string, username: string) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return name.toLowerCase().includes(s) || username.toLowerCase().includes(s);
};

/* ---------------- ส่วนประกอบ UI ---------------- */

const ICONS = {
  day: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  week: "M5 20V11M12 20V4M19 20v-6",
  check: "M5 13l4 4 10-10",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  logout:
    "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
  star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z",
};

function Icon({
  d,
  size = 20,
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

// โลโก้เหมือนฝั่งผู้ใช้: public/img/logo.png พื้นหลังโปร่งใส ไม่ตัดกรอบ
function Logo({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/img/logo.png"
      alt=""
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 border-0 bg-transparent object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
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

const rankBadge = (rank: number) =>
  rank === 1
    ? "bg-[#C9F25B] text-[#1B2A21]"
    : rank === 2
      ? "bg-[#1B2A21] text-[#C9F25B]"
      : rank === 3
        ? "bg-[#3F5E1F] text-white"
        : "text-[#6B7A6E]";

function Rank({ rank }: { rank: number }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${rankBadge(
        rank
      )}`}
    >
      {rank}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  dark,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl p-5 ${dark ? "bg-[#1B2A21] text-white" : "bg-white text-[#1B2A21]"
        }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${dark ? "bg-[#C9F25B] text-[#1B2A21]" : "bg-[#E8F5C1] text-[#3F5E1F]"
            }`}
        >
          <Icon d={icon} size={18} />
        </span>
        <span className={`text-[13px] ${dark ? "text-white/60" : "text-[#6B7A6E]"}`}>
          {label}
        </span>
      </div>
      <div className="mt-3 text-[36px] font-semibold leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {sub && (
        <div className={`mt-2 text-[12px] ${dark ? "text-[#C9F25B]" : "text-[#6B7A6E]"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function GoalTag({
  goalRank,
  points,
  quota,
}: {
  goalRank: number | null;
  points: number;
  quota: number;
}) {
  if (goalRank === null) {
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-[#C5CFB5] px-2.5 py-0.5 text-[12px] font-semibold text-[#6B7A6E]">
        ยังไม่ถึงเป้า
      </span>
    );
  }
  if (points > 0) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#3F5E1F] px-2.5 py-0.5 text-[12px] font-semibold text-[#C9F25B]">
        <Icon d={ICONS.check} size={12} />
        ลำดับ {goalRank}
      </span>
    );
  }
  return (
    <span className="inline-block whitespace-nowrap rounded-full bg-[#EEF2E4] px-2.5 py-0.5 text-[12px] font-semibold text-[#6B7A6E]">
      ลำดับ {goalRank} · ไม่ทัน {quota}
    </span>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
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
          className={`h-9 rounded-full px-5 text-[14px] font-semibold transition-all duration-200 ${value === v ? "bg-white text-[#1B2A21] shadow-sm" : "text-[#6B7A6E]"
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Shell({
  view,
  onView,
  onLogout,
  children,
}: {
  view: View;
  onView: (v: View) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const items: [View, string, string][] = [
    ["day", "รายวัน", ICONS.day],
    ["week", "รายสัปดาห์", ICONS.week],
  ];
  return (
    <div className="min-h-dvh bg-[#F3F6EC] text-[#1B2A21] lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 p-5 lg:flex">
        <div className="mb-1 flex items-center gap-2 px-3 text-[20px] font-bold tracking-tight">
          <Logo size={88} className="-my-[26px]" />
          {APP_NAME}
        </div>
        <span className="mb-5 ml-3 mt-3 w-fit rounded-full bg-[#1B2A21] px-3 py-0.5 text-[12px] font-semibold text-[#C9F25B]">
          ผู้ดูแล
        </span>
        {items.map(([v, label, d]) => (
          <button
            key={v}
            onClick={() => onView(v)}
            className={`flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-semibold transition-colors ${view === v
              ? "bg-[#C9F25B] text-[#1B2A21]"
              : "text-[#6B7A6E] hover:bg-[#E8EEDD]"
              }`}
          >
            <Icon d={d} size={20} />
            {label}
          </button>
        ))}
        <button
          onClick={onLogout}
          className="mt-auto flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-semibold text-[#D92D20] transition-colors hover:bg-[#FDE8E6]"
        >
          <Icon d={ICONS.logout} size={20} />
          ออกจากระบบ
        </button>
      </aside>

      <main className="pj-fade mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-10 lg:pb-12 lg:pt-12">
        <div className="mb-4 flex h-10 items-center justify-between lg:hidden">
          <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
            <Logo size={64} className="-my-[6px]" />
            {APP_NAME}
            <span className="rounded-full bg-[#1B2A21] px-2.5 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
              ผู้ดูแล
            </span>
          </div>
          <button
            onClick={onLogout}
            aria-label="ออกจากระบบ"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#D92D20] shadow-sm transition-transform active:scale-90"
          >
            <Icon d={ICONS.logout} size={18} />
          </button>
        </div>
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-[#E3EAD6] bg-white/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        {items.map(([v, label, d]) => (
          <button
            key={v}
            onClick={() => onView(v)}
            className="flex flex-col items-center gap-0.5 text-[11px] font-semibold"
          >
            <span
              className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${view === v ? "bg-[#C9F25B]" : "text-[#6B7A6E]"
                }`}
            >
              <Icon d={d} size={20} />
            </span>
            <span className={view === v ? "" : "text-[#6B7A6E]"}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------------- หน้าหลัก ---------------- */

export default function AdminPage() {
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState("");
  // วันนี้ตามเวลาไทย ตั้งค่าหลัง mount เท่านั้น ห้ามอ่านเวลาตอน render
  const [today, setToday] = useState("");
  const [q, setQ] = useState("");
  const [onlyAwarded, setOnlyAwarded] = useState(false);
  const [weekSort, setWeekSort] = useState<"points" | "total">("points");
  const [day, setDay] = useState<DayData | null>(null);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "locked" | "error">(
    "loading"
  );
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = todayYmd();
    setToday(t);
    setDate(t);
  }, []);

  // ธีมเดียวกับฝั่งผู้ใช้
  useEffect(() => {
    document.title = `${APP_NAME} · ผู้ดูแล`;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "#F3F6EC");
    document.documentElement.style.backgroundColor = "#F3F6EC";
    document.documentElement.style.colorScheme = "light";
  }, []);

  const load = useCallback(async () => {
    if (!date) return;
    setState("loading");
    try {
      if (view === "day") {
        setDay(await getJson<DayData>(`/api/admin/day?date=${date}`));
      } else {
        setWeek(await getJson<WeekData>(`/api/admin/week?date=${date}`));
      }
      setState("ok");
    } catch (e) {
      setState(e instanceof Error && e.message === "locked" ? "locked" : "error");
    }
  }, [view, date]);

  useEffect(() => {
    load();
  }, [load]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true);
    setPwErr("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setPwErr(d.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }
      setPw("");
      await load();
    } catch {
      setPwErr("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => { });
    setDay(null);
    setWeek(null);
    setState("locked");
  };

  const fontStyle = { fontFamily: FONT, touchAction: "manipulation" as const };

  /* ---------------- หน้ากรอกรหัสผ่าน ---------------- */

  if (state === "locked") {
    return (
      <div
        style={fontStyle}
        className="min-h-dvh bg-[#F3F6EC] text-[#1B2A21] antialiased lg:grid lg:grid-cols-2"
      >
        <style>{STYLES}</style>
        <aside className="hidden flex-col justify-between bg-[#1B2A21] p-12 text-white lg:flex">
          <div className="flex items-center gap-2 text-[20px] font-bold tracking-tight">
            <Logo size={88} className="-my-[26px]" />
            {APP_NAME}
          </div>
          <div>
            <h2 className="text-[48px] font-bold leading-[1.1] tracking-tight">
              แผงควบคุม
              <br />
              <span className="text-[#C9F25B]">ผู้ดูแลระบบ</span>
            </h2>
            <ul className="mt-8 space-y-3">
              {[
                "ดูผลวันนี้ของผู้เล่นทุกคน",
                `ย้อนหลังรายวัน ดูว่าใครเข้า ${POINT_QUOTA} คนแรก`,
                "สรุป point รายสัปดาห์",
              ].map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-3 text-[16px] text-white/80"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                    <Icon d={ICONS.check} size={14} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[13px] text-white/50">สำหรับผู้ดูแลเท่านั้น</p>
        </aside>

        <div className="pj-fade flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] lg:px-12">
          <div className="flex h-12 items-center lg:hidden">
            <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
              <Logo size={64} className="-my-[6px]" />
              {APP_NAME}
            </div>
          </div>
          <form
            onSubmit={login}
            className="mx-auto my-auto w-full max-w-sm py-6"
          >
            <h1 className="text-[30px] font-bold leading-tight tracking-tight">
              เข้าสู่ระบบผู้ดูแล
            </h1>
            <p className="mt-1 text-[14px] text-[#6B7A6E]">
              กรอกรหัสผ่านผู้ดูแลเพื่อดูข้อมูล
            </p>

            <label className="mt-6 block">
              <span className="mb-1.5 block text-[13px] font-medium text-[#6B7A6E]">
                รหัสผ่าน
              </span>
              <span className="relative block">
                <input
                  autoFocus
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => {
                    setPw(e.target.value);
                    setPwErr("");
                  }}
                  autoComplete="current-password"
                  aria-invalid={!!pwErr}
                  className={`h-12 w-full rounded-2xl bg-white px-4 pr-20 text-[16px] outline-none ring-2 transition-shadow focus:ring-[#C9F25B] ${pwErr ? "ring-[#D92D20]/60" : "ring-transparent"
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-full px-3 text-[13px] font-semibold text-[#3F5E1F]"
                >
                  {showPw ? "ซ่อน" : "แสดง"}
                </button>
              </span>
            </label>

            {pwErr && (
              <p
                role="alert"
                className="pj-in mt-4 rounded-2xl bg-[#FDE8E6] px-4 py-3 text-[14px] text-[#D92D20]"
              >
                {pwErr}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !pw}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-60"
            >
              {busy ? "กำลังตรวจสอบ" : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ---------------- ข้อมูลที่คำนวณจากผลลัพธ์ ---------------- */

  const step = view === "day" ? 1 : 7;
  const atLatest =
    !today || date >= (view === "day" ? today : shiftYmd(today, -6));

  const dayRows = day
    ? day.entries.filter(
      (e) =>
        (!onlyAwarded || e.points > 0) && matches(q, e.name, e.username)
    )
    : [];
  const weekRows = week
    ? [...week.entries]
      .sort(
        weekSort === "total"
          ? (a, b) => b.total - a.total || b.points - a.points
          : (a, b) => b.points - a.points || b.total - a.total
      )
      .map((e, i) => ({ ...e, rank: i + 1 }))
      .filter((e) => matches(q, e.name, e.username))
    : [];

  const dayTotal = day ? day.entries.reduce((a, e) => a + e.total, 0) : 0;
  const weekPoints = week ? week.entries.reduce((a, e) => a + e.points, 0) : 0;
  const weekTotal = week ? week.entries.reduce((a, e) => a + e.total, 0) : 0;

  const navBtn =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1B2A21] shadow-sm transition-transform active:scale-90 disabled:opacity-30";

  const title = view === "day" ? "ผลรายวัน" : "สรุปรายสัปดาห์";
  const subtitle =
    view === "day"
      ? date
        ? fmtLong(date)
        : ""
      : week
        ? `${fmtShort(week.days[0])} – ${fmtShort(week.days[6])} · จันทร์ถึงอาทิตย์ เวลาไทย`
        : "";

  const card = "rounded-3xl bg-white";
  const th =
    "px-4 py-3 text-left text-[12px] font-medium text-[#6B7A6E] whitespace-nowrap";

  return (
    <div style={fontStyle} className="select-text antialiased">
      <style>{STYLES}</style>
      <Shell
        view={view}
        onView={(v) => {
          setView(v);
          setQ("");
        }}
        onLogout={logout}
      >
        <header className="mb-5">
          <p className="min-h-[18px] text-[13px] text-[#6B7A6E]">{subtitle}</p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[36px]">
            {title}
          </h1>
        </header>

        {/* แถบเครื่องมือ */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(shiftYmd(date, -step))}
              disabled={!date}
              aria-label="ก่อนหน้า"
              className={navBtn}
            >
              <Icon d={ICONS.left} size={18} />
            </button>
            <input
              type="date"
              value={date}
              max={today || undefined}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-[15px] shadow-sm outline-none ring-2 ring-transparent focus:ring-[#C9F25B] lg:w-48 lg:flex-none"
            />
            <button
              onClick={() => setDate(shiftYmd(date, step))}
              disabled={atLatest}
              aria-label="ถัดไป"
              className={navBtn}
            >
              <Icon d={ICONS.right} size={18} />
            </button>
            <button
              onClick={() => today && setDate(today)}
              className="h-10 rounded-full bg-[#C9F25B] px-5 text-[14px] font-semibold text-[#1B2A21] transition-all active:scale-95 active:bg-[#B8E348]"
            >
              {view === "day" ? "วันนี้" : "สัปดาห์นี้"}
            </button>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-3 lg:justify-end">
            <label className="relative block min-w-0 flex-1 lg:max-w-xs lg:flex-none">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7A6E]">
                <Icon d={ICONS.search} size={16} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อหรือ username"
                className="h-10 w-full rounded-full bg-white pl-10 pr-4 text-[14px] shadow-sm outline-none ring-2 ring-transparent placeholder:text-[#A9B79A] focus:ring-[#C9F25B]"
              />
            </label>
            {view === "week" && (
              <div className="w-64 shrink-0">
                <Segmented<"points" | "total">
                  value={weekSort}
                  onChange={setWeekSort}
                  options={
                    [
                      ["points", "point สูงสุด"],
                      ["total", "โดดมากสุด"],
                    ] as const
                  }
                />
              </div>
            )}
          </div>
        </div>

        {state === "loading" && (
          <p className={`${card} px-4 py-10 text-center text-[14px] text-[#6B7A6E]`}>
            กำลังโหลด
          </p>
        )}

        {state === "error" && (
          <div className={`${card} px-4 py-10 text-center`}>
            <p className="text-[14px] text-[#D92D20]">
              โหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่
            </p>
            <button
              onClick={load}
              className="mt-3 h-10 rounded-full bg-[#C9F25B] px-6 text-[14px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* ---------------- รายวัน ---------------- */}
        {state === "ok" && view === "day" && day && (
          <>
            <div className="pj-stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              <StatCard
                dark
                icon={ICONS.users}
                label="คนที่โดด"
                value={fmtNum(day.entries.length)}
                sub="คนลงสนามวันนี้"
              />
              <StatCard
                icon={ICONS.bolt}
                label="โดดรวม"
                value={fmtNum(dayTotal)}
                sub="ครั้ง"
              />
              <StatCard
                icon={ICONS.check}
                label="ถึงเป้า"
                value={fmtNum(day.reachedCount)}
                sub="คน"
              />
              <StatCard
                icon={ICONS.star}
                label={`ได้ ${fmtNum(day.reward)} point`}
                value={`${day.awardedCount}/${day.quota}`}
                sub={`โควตา ${fmtNum(day.quota)} คนแรก`}
              />
            </div>

            <section className={`${card} mt-4 overflow-hidden`}>
              {dayRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
                  ไม่มีข้อมูล
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#EEF2E4]">
                        <th className={`${th} w-16`}>#</th>
                        <th className={th}>ผู้เล่น</th>
                        <th className={`${th} text-right`}>โดด (ครั้ง)</th>
                        <th className={`${th} hidden text-right md:table-cell`}>
                          รอบ
                        </th>
                        <th className={`${th} hidden w-56 lg:table-cell`}>
                          ความคืบหน้าสู่เป้า
                        </th>
                        <th className={th}>ถึงเป้า</th>
                        <th className={`${th} text-right`}>point</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2E4]">
                      {dayRows.map((e) => {
                        const pct = Math.min(
                          100,
                          (e.total / Math.max(1, e.goal)) * 100
                        );
                        return (
                          <tr
                            key={e.userId}
                            className={e.points > 0 ? "bg-[#F7FBEA]" : ""}
                          >
                            <td className="px-4 py-3">
                              <Rank rank={e.rank} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar name={e.name} />
                                <div className="min-w-0">
                                  <div className="truncate text-[15px] font-semibold">
                                    {e.name}
                                  </div>
                                  {e.username && (
                                    <div className="truncate text-[12px] text-[#6B7A6E]">
                                      @{e.username}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-[18px] font-semibold tabular-nums">
                              {fmtNum(e.total)}
                            </td>
                            <td className="hidden px-4 py-3 text-right text-[14px] tabular-nums text-[#6B7A6E] md:table-cell">
                              {e.rounds}
                            </td>
                            <td className="hidden px-4 py-3 lg:table-cell">
                              <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF2E4]">
                                <div
                                  className="h-full rounded-full transition-[width] duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    background:
                                      e.goalRank !== null ? "#3F5E1F" : "#A9B79A",
                                  }}
                                />
                              </div>
                              <div className="mt-1 text-[11px] tabular-nums text-[#6B7A6E]">
                                {fmtNum(e.total)} / {fmtNum(e.goal)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <GoalTag
                                goalRank={e.goalRank}
                                points={e.points}
                                quota={day.quota}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              {e.points > 0 ? (
                                <span className="text-[16px] font-semibold tabular-nums text-[#3F5E1F]">
                                  +{fmtNum(e.points)}
                                </span>
                              ) : (
                                <span className="text-[#A9B79A]">–</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
              เรียงตามยอดโดดรวมของวัน ลำดับถึงเป้า = ลำดับเวลาที่ยอดสะสมของวันนั้นถึงเป้ารายวันของคนนั้น
              ตัดวันที่เที่ยงคืนเวลาไทย
            </p>
          </>
        )}

        {/* ---------------- รายสัปดาห์ ---------------- */}
        {state === "ok" && view === "week" && week && (
          <>
            <div className="pj-stagger grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
              <StatCard
                dark
                icon={ICONS.users}
                label="คนที่โดด"
                value={fmtNum(week.entries.length)}
                sub="คนในสัปดาห์นี้"
              />
              <StatCard
                icon={ICONS.star}
                label="point ที่แจกรวม"
                value={fmtNum(weekPoints)}
                sub="point"
              />
              <div className="col-span-2 lg:col-span-1">
                <StatCard
                  icon={ICONS.bolt}
                  label="โดดรวม"
                  value={fmtNum(weekTotal)}
                  sub="ครั้ง"
                />
              </div>
            </div>

            <section className={`${card} mt-4 overflow-hidden`}>
              {weekRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
                  สัปดาห์นี้ยังไม่มีข้อมูล
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#EEF2E4]">
                        <th className={`${th} w-16`}>#</th>
                        <th className={th}>ผู้เล่น</th>
                        {week.days.map((d, i) => (
                          <th
                            key={d}
                            className={`${th} hidden text-center md:table-cell`}
                          >
                            <div>{DAY_NAMES[i]}</div>
                            <div className="text-[10px] font-normal opacity-70">
                              {fmtShort(d)}
                            </div>
                          </th>
                        ))}
                        <th className={`${th} text-right`}>โดดรวม</th>
                        <th className={`${th} text-right`}>point รวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2E4]">
                      {weekRows.map((e) => (
                        <tr key={e.userId}>
                          <td className="px-4 py-3">
                            <Rank rank={e.rank} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={e.name} />
                              <div className="min-w-0">
                                <div className="truncate text-[15px] font-semibold">
                                  {e.name}
                                </div>
                                <div className="truncate text-[12px] text-[#6B7A6E]">
                                  {e.username && `@${e.username} · `}
                                  ได้ point {e.rewardDays} วัน
                                </div>
                              </div>
                            </div>
                          </td>
                          {e.perDay.map((p, i) => (
                            <td
                              key={i}
                              className="hidden px-1 py-3 text-center md:table-cell"
                            >
                              <span
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[12px] tabular-nums ${p > 0
                                  ? "bg-[#3F5E1F] font-semibold text-[#C9F25B]"
                                  : "bg-[#EEF2E4] text-[#A9B79A]"
                                  }`}
                              >
                                {p > 0 ? `+${p}` : "–"}
                              </span>
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right text-[15px] tabular-nums text-[#6B7A6E]">
                            {fmtNum(e.total)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-[22px] font-semibold tabular-nums ${e.points > 0 ? "text-[#3F5E1F]" : "text-[#A9B79A]"
                                }`}
                            >
                              {fmtNum(e.points)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
              {weekSort === "total"
                ? "เรียงตามยอดโดดรวมของสัปดาห์ ถ้าเท่ากันเรียงตาม point"
                : "เรียงตาม point รวมของสัปดาห์ ถ้าเท่ากันเรียงตามยอดโดดรวม"}
              point คำนวณจากกติกา {POINT_QUOTA} คนแรกที่ถึงเป้ารายวัน ได้ {POINT_REWARD} point
            </p>
          </>
        )}
      </Shell>
    </div>
  );
}