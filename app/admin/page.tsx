"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Prompt } from "next/font/google";
import UserDayModal from "../components/UserDayModal";
import UserMonthModal from "../components/UserMonthModal";
import { DeptBoardView } from "../components/DepartmentRank";
import type { DeptEntry } from "../components/DepartmentRank";
import { buildGroups, matchesGroup } from "../components/adminGroups";
import WeekCalendar from "../components/WeekCalendar";

const APP_NAME = "Daily Jump Challenge – ท้าให้กระโดด ลุ้นให้ได้แต้ม";
// ชื่อสั้นสำหรับแสดงใน UI (แถบข้าง / หัวหน้าจอมือถือ) กันล้นและทับปุ่มอื่น
// APP_NAME เต็มใช้เฉพาะ document.title
const APP_SHORT = "Daily Jump Challenge";

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
@keyframes pj-rise { from { transform: scaleY(.2); opacity: 0; } to { opacity: 1; transform: scaleY(1); } }
@keyframes pj-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.pj-rise { transform-origin: bottom; animation: pj-rise .6s cubic-bezier(.2,.8,.2,1) both; }
.pj-float { animation: pj-float 2.4s ease-in-out infinite; }
.pj-lift { transition: transform .15s ease, box-shadow .15s ease; }
.pj-lift:hover { box-shadow: 0 4px 14px rgba(27,42,33,.08); }
@media (prefers-reduced-motion: reduce) { .pj-fade, .pj-in, .pj-stagger > *, .pj-rise, .pj-float { animation: none; } }
`;

/* ---------------- ชนิดข้อมูล ---------------- */

type DayEntry = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
  org?: OrgInfo;
};
// ผู้เล่นที่ถูกแบนในวันนั้น (ไม่อยู่ในอันดับ ไม่นับคะแนน)
type BannedEntry = {
  userId: string;
  name: string;
  username: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  org?: OrgInfo;
  total: number;
  rounds: number;
  ban: {
    id: string;
    reason: string;
    bannedAt: number;
    expiresAt: number;
    day: string;
    active: boolean;
  };
};
type DayData = {
  date: string;
  quota: number;
  reward: number;
  reachedCount: number;
  awardedCount: number;
  entries: DayEntry[];
  banned?: BannedEntry[];
};
type WeekEntry = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  points: number;
  total: number;
  rewardDays: number;
  perDay: number[];
  org?: OrgInfo;
};
type WeekData = { start: string; days: string[]; entries: WeekEntry[] };
type MonthEntry = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  points: number;
  total: number;
  rounds: number;
  rewardDays: number;
  activeDays: number;
  bestDay: number;
  org?: OrgInfo;
};
type MonthData = {
  scope: "month" | "all";
  month: string;
  since: string;
  dayCount: number;
  activeDays: number;
  entries: MonthEntry[];
  // ยอดสะสมรายกลุ่ม key "d:<id>" / "b:<id>" ตรงกับหน้าอันดับฝั่งผู้ใช้
  // API ส่งมาเฉพาะ scope=all (ตั้งแต่เริ่มกิจกรรม)
  deptTotals?: Record<string, number>;
};
// สังกัดของผู้เล่น ต้องตรงกับ OrgInfo ใน lib/admin-stats.ts
type OrgInfo = {
  company: string | null;
  workplace: "สำนักงานใหญ่" | "หน้าร้าน" | null;
  department: string | null;
  branch: string | null;
  branchCode: string | null;
  province: string | null;
  region: string | null;
  groupKey: string | null;
  groupName: string | null;
};
type Group = "player" | "group";
type WorkFilter = "all" | "hq" | "store";
type View = "day" | "week" | "month";
type Sort = "points" | "total";
type Scope = "month" | "all";

/* ---------------- ฟังก์ชันช่วย ---------------- */

const fmtNum = (n: number) => n.toLocaleString("en-US");
const DAY = 864e5;
const TZ = 7 * 3600e3;
const todayYmd = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const shiftYmd = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
// เลื่อนเดือน คืนวันที่ 1 ของเดือนใหม่
const shiftMonth = (ymd: string, n: number) => {
  const [y, m] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};
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
const fmtMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("th-TH", {
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

// สังกัดเป็นข้อความบรรทัดเดียว เช่น "Com7 · หน้าร้าน · ID 115 Studio 7_... · ปทุมธานี"
const orgText = (o?: OrgInfo) =>
  !o
    ? ""
    : [
        o.company,
        o.workplace,
        o.department,
        o.branch ? (o.branchCode ? `ID ${o.branchCode} ${o.branch}` : o.branch) : null,
        o.province,
      ]
        .filter(Boolean)
        .join(" · ");

// ค้นหาได้ทั้งชื่อ username รหัสพนักงาน และสังกัด (พิมพ์เลข ID สาขา ชื่อสาขา จังหวัด แผนก ก็เจอ)
const matches = (
  q: string,
  name: string,
  username: string,
  org?: OrgInfo,
  employeeId?: string | null
) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    name.toLowerCase().includes(s) ||
    username.toLowerCase().includes(s) ||
    (employeeId ?? "").toLowerCase().includes(s) ||
    orgText(org).toLowerCase().includes(s)
  );
};

// บรรทัด "@username · รหัส A12345" ใต้ชื่อผู้เล่น (ไม่มีทั้งคู่ = null)
const idLine = (username: string, employeeId?: string | null) => {
  const parts = [
    username ? `@${username}` : null,
    employeeId ? `รหัส ${employeeId}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
};

// ดาวน์โหลด CSV (ใส่ BOM ให้ Excel อ่านไทยได้ และกันสูตรแทรกจากชื่อผู้เล่น)
function downloadCsv(
  filename: string,
  head: string[],
  body: (string | number)[][]
) {
  const esc = (v: string | number) => {
    let t = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const text = [head, ...body].map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- ส่วนประกอบ UI ---------------- */

const ICONS = {
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  day: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  week: "M5 20V11M12 20V4M19 20v-6",
  month: "M4 6h16M4 12h16M4 18h16",
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

// รูปโปรไฟล์ ถ้าไม่มีหรือโหลดไม่ได้ใช้ตัวอักษรแรกของชื่อแทน
// รูปที่เพิ่งอัปโหลดขึ้น Drive บางครั้งยังโหลดไม่ได้ทันที ลองใหม่ได้ 3 ครั้ง
function Avatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const [bad, setBad] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    setBad(false);
    setTries(0);
  }, [src]);

  useEffect(() => {
    if (!bad || !src || tries >= 3) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      setBad(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [bad, src, tries]);

  if (src && !bad) {
    const url =
      tries > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${tries}` : src;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setBad(true)}
        className="shrink-0 rounded-full bg-[#1B2A21] object-cover"
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
      className={`rounded-3xl p-5 ${
        dark ? "bg-[#1B2A21] text-white" : "bg-white text-[#1B2A21]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            dark ? "bg-[#C9F25B] text-[#1B2A21]" : "bg-[#E8F5C1] text-[#3F5E1F]"
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
          className={`h-9 rounded-full px-5 text-[14px] font-semibold transition-all duration-200 ${
            value === v ? "bg-white text-[#1B2A21] shadow-sm" : "text-[#6B7A6E]"
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
    ["month", "รายเดือน", ICONS.month],
  ];
  return (
    <div className="min-h-dvh bg-[#F3F6EC] text-[#1B2A21] lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 p-4 lg:flex">
        <div className="flex h-full w-full flex-col gap-1 rounded-[32px] bg-white p-5 shadow-sm">
          <div className="mb-1 flex min-w-0 flex-col items-start gap-1 px-3">
            <Logo size={72} />
            <span className="min-w-0 text-[18px] font-bold leading-tight tracking-tight text-[#3F5E1F]">
              {APP_SHORT}
            </span>
          </div>
          <span className="mb-5 ml-3 mt-3 w-fit rounded-full bg-[#1B2A21] px-3 py-0.5 text-[12px] font-semibold text-[#C9F25B]">
            ผู้ดูแล
          </span>
          {items.map(([v, label, d]) => (
            <button
              key={v}
              onClick={() => onView(v)}
              className={`flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-semibold transition-colors ${
                view === v
                  ? "bg-[#C9F25B] text-[#1B2A21]"
                  : "text-[#6B7A6E] hover:bg-[#F3F6EC]"
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
        </div>
      </aside>

      <main className="pj-fade mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-10 lg:pb-12 lg:pt-12">
        <div className="mb-4 flex h-10 items-center justify-between gap-3 lg:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[15px] font-bold tracking-tight">
            <Logo size={48} className="-my-[4px]" />
            <span className="min-w-0 truncate text-[#3F5E1F]">{APP_SHORT}</span>
            <span className="shrink-0 rounded-full bg-[#1B2A21] px-2.5 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
              ผู้ดูแล
            </span>
          </div>
          <button
            onClick={onLogout}
            aria-label="ออกจากระบบ"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#D92D20] shadow-sm transition-transform active:scale-90"
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
              className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                view === v ? "bg-[#C9F25B]" : "text-[#6B7A6E]"
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

/* ---------------- สังกัด / กลุ่ม ---------------- */

// สังกัดของผู้เล่นเป็นป้ายแยก: บริษัท / ที่ทำงาน / แผนกหรือสาขา / จังหวัด
function OrgLine({ org }: { org?: OrgInfo }) {
  if (!org) return null;
  const place = org.department
    ? `แผนก ${org.department}`
    : org.branch
      ? `สาขา ${org.branchCode ? `ID ${org.branchCode} ` : ""}${org.branch}`
      : null;
  if (!org.company && !org.workplace && !place) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {org.company && (
        <span className="rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
          {org.company}
        </span>
      )}
      {org.workplace && (
        <span className="rounded-full bg-[#E8F5C1] px-2 py-0.5 text-[11px] font-semibold text-[#3F5E1F]">
          {org.workplace}
        </span>
      )}
      {place && (
        <span
          className="max-w-full truncate rounded-full bg-[#EEF2E4] px-2 py-0.5 text-[11px] text-[#1B2A21]"
          title={place}
        >
          {place}
        </span>
      )}
      {org.province && (
        <span className="text-[11px] text-[#8A9A7C]">{org.province}</span>
      )}
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
  const [sort, setSort] = useState<Sort>("points");
  const [scope, setScope] = useState<Scope>("month");
  // มุมมอง (รายคน / แผนก-สาขา) ใช้ได้เฉพาะหน้ารายเดือน ตัวกรองสังกัดใช้ร่วมกันทั้ง 3 หน้า
  const [group, setGroup] = useState<Group>("player");
  // ปฏิทินรายเดือนในหน้ารายสัปดาห์
  const [calOpen, setCalOpen] = useState(false);
  const [fCompany, setFCompany] = useState("");
  const [fWork, setFWork] = useState<WorkFilter>("all");
  const [fProvince, setFProvince] = useState("");
  const [day, setDay] = useState<DayData | null>(null);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [month, setMonth] = useState<MonthData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "locked" | "error">(
    "loading"
  );
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [busy, setBusy] = useState(false);
  // ผู้เล่นที่ถูกกดดูผลของวัน (หน้ารายวัน) null = ไม่เปิด
  const [detail, setDetail] = useState<{
    userId: string;
    date: string;
    avatarUrl?: string | null;
  } | null>(null);
  // ผู้เล่นที่ถูกกดดูผลรายเดือน (หน้ารายเดือน) null = ไม่เปิด
  const [monthDetail, setMonthDetail] = useState<{
    userId: string;
    month: string;
    avatarUrl?: string | null;
  } | null>(null);

  // มุมมองแผนกในหน้ารายเดือนแสดงยอดสะสมตั้งแต่เริ่มกิจกรรมเสมอ
  // เลยบังคับดึงข้อมูล scope=all ไม่ขึ้นกับเดือนที่เลือก
  const effScope: Scope = view === "month" && group === "group" ? "all" : scope;

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
      } else if (view === "week") {
        setWeek(await getJson<WeekData>(`/api/admin/week?date=${date}`));
      } else {
        setMonth(
          await getJson<MonthData>(
            `/api/admin/month?month=${date.slice(0, 7)}&scope=${effScope}`
          )
        );
      }
      setState("ok");
    } catch (e) {
      setState(e instanceof Error && e.message === "locked" ? "locked" : "error");
    }
  }, [view, date, effScope]);

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
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    setDay(null);
    setWeek(null);
    setMonth(null);
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
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Logo size={80} />
            <span className="min-w-0 text-[20px] font-bold leading-tight tracking-tight text-[#C9F25B]">
              {APP_SHORT}
            </span>
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
                "สรุป point รายสัปดาห์ รายเดือน และตั้งแต่เริ่มกิจกรรม",
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
            <div className="flex min-w-0 items-center gap-2 text-[15px] font-bold tracking-tight">
              <Logo size={48} className="-my-[4px]" />
              <span className="min-w-0 truncate text-[#3F5E1F]">{APP_SHORT}</span>
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
                  className={`h-12 w-full rounded-2xl bg-white px-4 pr-20 text-[16px] outline-none ring-2 transition-shadow focus:ring-[#C9F25B] ${
                    pwErr ? "ring-[#D92D20]/60" : "ring-transparent"
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

  const isAll = view === "month" && effScope === "all";
  const step = view === "day" ? 1 : 7;
  const atLatest =
    !today ||
    (view === "day"
      ? date >= today
      : view === "week"
        ? date >= shiftYmd(today, -6)
        : date.slice(0, 7) >= today.slice(0, 7));

  const goPrev = () =>
    setDate(view === "month" ? shiftMonth(date, -1) : shiftYmd(date, -step));
  const goNext = () =>
    setDate(view === "month" ? shiftMonth(date, 1) : shiftYmd(date, step));

  const byKey = <T extends { points: number; total: number }>(rows: T[]) =>
    [...rows]
      .sort(
        sort === "total"
          ? (a, b) => b.total - a.total || b.points - a.points
          : (a, b) => b.points - a.points || b.total - a.total
      )
      .map((e, i) => ({ ...e, rank: i + 1 }));

  /* ---- ตัวกรองสังกัด (เติมค่าได้เมื่อ API ส่ง org มาให้) ---- */
  const activeEntries: { org?: OrgInfo }[] =
    view === "day"
      ? (day?.entries ?? [])
      : view === "week"
        ? (week?.entries ?? [])
        : (month?.entries ?? []);
  const hasOrg = activeEntries.some((e) => !!e.org);
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) =>
      a.localeCompare(b, "th")
    );
  const companyOpts = uniq(activeEntries.map((e) => e.org?.company));
  const provinceOpts = uniq(activeEntries.map((e) => e.org?.province));
  const filterActive = !!fCompany || fWork !== "all" || !!fProvince;
  const orgOk = (o?: OrgInfo) => {
    if (!filterActive || !hasOrg) return true;
    if (fCompany && o?.company !== fCompany) return false;
    if (fWork === "hq" && o?.workplace !== "สำนักงานใหญ่") return false;
    if (fWork === "store" && o?.workplace !== "หน้าร้าน") return false;
    if (fProvince && o?.province !== fProvince) return false;
    return true;
  };
  const clearFilters = () => {
    setFCompany("");
    setFWork("all");
    setFProvince("");
  };

  // อันดับ (rank) คงเป็นอันดับรวมทั้งระบบ ตัวกรองและช่องค้นหาแค่ซ่อนแถว
  const dayScoped = day ? day.entries.filter((e) => orgOk(e.org)) : [];
  const weekScoped = week ? week.entries.filter((e) => orgOk(e.org)) : [];
  const monthScoped = month ? month.entries.filter((e) => orgOk(e.org)) : [];

  const bannedRows = day
    ? (day.banned ?? []).filter(
        (e) =>
          orgOk(e.org) && matches(q, e.name, e.username, e.org, e.employeeId)
      )
    : [];
  const fmtBanTime = (t: number) =>
    new Date(t).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const dayRows = dayScoped.filter(
    (e) =>
      (!onlyAwarded || e.points > 0) &&
      matches(q, e.name, e.username, e.org, e.employeeId)
  );
  const weekRows = week
    ? byKey(week.entries).filter(
        (e) =>
          orgOk(e.org) && matches(q, e.name, e.username, e.org, e.employeeId)
      )
    : [];
  const monthRows = month
    ? byKey(month.entries).filter(
        (e) =>
          orgOk(e.org) && matches(q, e.name, e.username, e.org, e.employeeId)
      )
    : [];

  // สถิติในการ์ดนับเฉพาะคนที่ตรงตัวกรองสังกัด (ไม่กรองด้วยช่องค้นหา)
  const sum = <T extends object>(rows: T[], f: (r: T) => number) =>
    rows.reduce((a, r) => a + f(r), 0);
  const dayTotal = sum(dayScoped, (e) => e.total);
  const dayReached =
    filterActive && hasOrg
      ? dayScoped.filter((e) => e.goalRank !== null).length
      : (day?.reachedCount ?? 0);
  const dayAwarded =
    filterActive && hasOrg
      ? dayScoped.filter((e) => e.points > 0).length
      : (day?.awardedCount ?? 0);
  const weekPoints = sum(weekScoped, (e) => e.points);
  const weekTotal = sum(weekScoped, (e) => e.total);
  const monthPoints = sum(monthScoped, (e) => e.points);
  const monthTotal = sum(monthScoped, (e) => e.total);

  // มุมมองแผนก/สาขา (ใช้เฉพาะหน้ารายเดือน)
  // ใช้ข้อมูล scope=all + deptTotals (ยอดสะสมตั้งแต่เริ่ม ตรงหน้าอันดับของผู้ใช้)
  // รอให้ข้อมูลที่โหลดมาเป็น scope=all ก่อน กันแสดงข้อมูลเดือนเก่าค้างตอนสลับมุมมอง
  const groupReady =
    view === "month" && group === "group" && month?.scope === "all";
  const cum = groupReady ? month?.deptTotals : undefined;
  const groupList =
    groupReady && cum
      ? buildGroups(monthScoped, "points", cum).filter((g) =>
          matchesGroup(q, g)
        )
      : [];

  const groupUnit = "ครั้งสะสม";
  const deptEntries: DeptEntry[] = groupList.map((g) => ({
    rank: g.rank,
    id: 0,
    key: g.key,
    kind: g.kind ?? undefined,
    name: g.name,
    en: "",
    company: g.company,
    total: g.cum,
    // ค่าอีกตัว แสดงใต้ตัวเลขหลัก
    sub: `${fmtNum(g.points)} point`,
    active: g.players,
    me: false,
    memberCount: g.players,
    members: g.members.map((mb) => ({
      name: mb.name,
      username: mb.username || mb.userId,
      avatarUrl: mb.avatarUrl,
      total: mb.total,
    })),
  }));
  const groupBoard = (
    <div className="mt-4">
      <DeptBoardView
        entries={deptEntries}
        unit={groupUnit}
        cumulative={false}
        emptyText="ไม่มีข้อมูล"
      />
      <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
        กลุ่ม = แผนก (สำนักงานใหญ่) หรือ 1 สาขา (หน้าร้าน) · ตัวเลขหลัก = ยอดสะสมนับตั้งแต่เริ่มกิจกรรม
        เหมือนหน้าอันดับของผู้ใช้ ไม่ขึ้นกับเดือนที่เลือก (เรียงตามนี้) · ใต้ตัวเลข = point สะสมของคนที่ตรงตัวกรอง ·
        กดที่กลุ่มเพื่อดูสมาชิก
      </p>
    </div>
  );

  const periodTag =
    view === "day"
      ? date
      : view === "week"
        ? (week?.start ?? date)
        : isAll
          ? "all"
          : date.slice(0, 7);

  const exportCsv = () => {
    const oc = (o?: OrgInfo) => [
      o?.company ?? "",
      o?.workplace ?? "",
      o?.department ?? "",
      o?.branchCode ?? "",
      o?.branch ?? "",
      o?.province ?? "",
      o?.region ?? "",
    ];
    const oh = ["บริษัท", "ที่ทำงาน", "แผนก", "รหัสสาขา", "สาขา", "จังหวัด", "ภาค"];
    if (group === "group") {
      downloadCsv(
        `pose-jump-groups-${periodTag}`,
        [
          "#",
          "กลุ่ม",
          "รายละเอียด",
          "จำนวนคน",
          "โดดรวม (คนที่ตรงตัวกรอง)",
          "เฉลี่ยต่อคน",
          "ยอดสะสม",
          "point",
        ],
        groupList.map((g) => [
          g.rank,
          g.name,
          g.sub,
          g.players,
          g.total,
          Math.round(g.total / Math.max(1, g.players)),
          g.cum,
          g.points,
        ])
      );
    } else if (view === "day") {
      downloadCsv(
        `pose-jump-day-${periodTag}`,
        ["#", "ชื่อ", "username", "รหัสพนักงาน", ...oh, "โดด (ครั้ง)", "รอบ", "ลำดับถึงเป้า", "point"],
        dayRows.map((e) => [
          e.rank,
          e.name,
          e.username,
          e.employeeId ?? "",
          ...oc(e.org),
          e.total,
          e.rounds,
          e.goalRank ?? "",
          e.points,
        ])
      );
    } else if (view === "week") {
      downloadCsv(
        `pose-jump-week-${periodTag}`,
        ["#", "ชื่อ", "username", "รหัสพนักงาน", ...oh, ...(week?.days ?? []), "โดดรวม", "point รวม", "วันที่ได้ point"],
        weekRows.map((e) => [
          e.rank,
          e.name,
          e.username,
          e.employeeId ?? "",
          ...oc(e.org),
          ...e.perDay,
          e.total,
          e.points,
          e.rewardDays,
        ])
      );
    } else {
      downloadCsv(
        `pose-jump-month-${periodTag}`,
        ["#", "ชื่อ", "username", "รหัสพนักงาน", ...oh, "วันที่โดด", "วันที่ได้ point", "รอบ", "วันที่ดีที่สุด", "โดดรวม", "point รวม"],
        monthRows.map((e) => [
          e.rank,
          e.name,
          e.username,
          e.employeeId ?? "",
          ...oc(e.org),
          e.activeDays,
          e.rewardDays,
          e.rounds,
          e.bestDay,
          e.total,
          e.points,
        ])
      );
    }
  };
  const canExport =
    group === "group"
      ? groupList.length > 0
      : (view === "day" ? dayRows : view === "week" ? weekRows : monthRows)
          .length > 0;

  const selCls =
    "h-10 min-w-0 rounded-full bg-white px-4 text-[14px] shadow-sm outline-none ring-2 ring-transparent focus:ring-[#C9F25B]";

  const navBtn =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#1B2A21] shadow-sm transition-transform active:scale-90 disabled:opacity-30";

  const title =
    view === "day"
      ? "ผลรายวัน"
      : view === "week"
        ? "สรุปรายสัปดาห์"
        : group === "group"
          ? "อันดับแผนก"
          : isAll
            ? "สรุปตั้งแต่เริ่มกิจกรรม"
            : "สรุปรายเดือน";
  const subtitle =
    view === "day"
      ? date
        ? fmtLong(date)
        : ""
      : view === "week"
        ? week
          ? `${fmtShort(week.days[0])} – ${fmtShort(week.days[6])} · จันทร์ถึงอาทิตย์ เวลาไทย`
          : ""
        : isAll
          ? month && month.dayCount > 0
            ? `ตั้งแต่ ${fmtShort(month.since)} ถึงวันนี้ · ${fmtNum(month.dayCount)} วัน`
            : ""
          : date
            ? fmtMonth(date.slice(0, 7))
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
          setDetail(null);
          setMonthDetail(null);
          setCalOpen(false);
          // มุมมองแผนกมีเฉพาะหน้ารายเดือน
          if (v !== "month") setGroup("player");
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
          {view === "month" && group === "player" && (
            <div className="w-full shrink-0 lg:w-64">
              <Segmented<Scope>
                value={scope}
                onChange={setScope}
                options={
                  [
                    ["month", "รายเดือน"],
                    ["all", "ตั้งแต่เริ่ม"],
                  ] as const
                }
              />
            </div>
          )}

          {!isAll && (
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={!date}
                aria-label="ก่อนหน้า"
                className={navBtn}
              >
                <Icon d={ICONS.left} size={18} />
              </button>
              {view === "month" ? (
                <input
                  type="month"
                  value={date.slice(0, 7)}
                  max={today ? today.slice(0, 7) : undefined}
                  onChange={(e) =>
                    e.target.value && setDate(`${e.target.value}-01`)
                  }
                  className="h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-[15px] shadow-sm outline-none ring-2 ring-transparent focus:ring-[#C9F25B] lg:w-48 lg:flex-none"
                />
              ) : (
                <input
                  type="date"
                  value={date}
                  max={today || undefined}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-[15px] shadow-sm outline-none ring-2 ring-transparent focus:ring-[#C9F25B] lg:w-48 lg:flex-none"
                />
              )}
              <button
                onClick={goNext}
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
                {view === "day"
                  ? "วันนี้"
                  : view === "week"
                    ? "สัปดาห์นี้"
                    : "เดือนนี้"}
              </button>
              {view === "week" && (
                <button
                  onClick={() => setCalOpen((v) => !v)}
                  aria-expanded={calOpen}
                  className={`flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold shadow-sm transition-all active:scale-95 ${
                    calOpen
                      ? "bg-[#1B2A21] text-[#C9F25B]"
                      : "bg-white text-[#1B2A21]"
                  }`}
                >
                  <Icon d={ICONS.day} size={16} />
                  {date ? fmtMonth(date.slice(0, 7)) : "ปฏิทิน"}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-1 flex-wrap items-center gap-3 lg:justify-end">
            {view === "month" && (
              <div className="w-56 shrink-0">
                <Segmented<Group>
                  value={group}
                  onChange={setGroup}
                  options={
                    [
                      ["player", "รายคน"],
                      ["group", "แผนก"],
                    ] as const
                  }
                />
              </div>
            )}
            <label className="relative block min-w-0 flex-1 lg:max-w-xs lg:flex-none">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7A6E]">
                <Icon d={ICONS.search} size={16} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  group === "group"
                    ? "ค้นหาแผนกหรือสาขา"
                    : "ค้นหาชื่อ, username หรือรหัสพนักงาน"
                }
                className="h-10 w-full rounded-full bg-white pl-10 pr-4 text-[14px] shadow-sm outline-none ring-2 ring-transparent placeholder:text-[#A9B79A] focus:ring-[#C9F25B]"
              />
            </label>
            {(view === "week" || (view === "month" && group === "player")) && (
              <div className="w-64 shrink-0">
                <Segmented<Sort>
                  value={sort}
                  onChange={setSort}
                  options={
                    [
                      ["points", "point สูงสุด"],
                      ["total", "โดดมากสุด"],
                    ] as const
                  }
                />
              </div>
            )}
            {view === "day" && (
              <div className="w-56 shrink-0">
                <Segmented<"all" | "awarded">
                  value={onlyAwarded ? "awarded" : "all"}
                  onChange={(v) => setOnlyAwarded(v === "awarded")}
                  options={
                    [
                      ["all", "ทุกคน"],
                      ["awarded", `ได้ point`],
                    ] as const
                  }
                />
              </div>
            )}
          </div>
        </div>

        {view === "week" && calOpen && date && (
          <WeekCalendar
            date={date}
            today={today}
            onPick={(start) => {
              setDate(start);
              setCalOpen(false);
            }}
            onLocked={() => setState("locked")}
          />
        )}

        {/* ตัวกรองสังกัด + ส่งออก */}
        {state === "ok" && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {hasOrg && (
              <>
                {companyOpts.length > 1 && (
                  <select
                    value={fCompany}
                    onChange={(e) => setFCompany(e.target.value)}
                    aria-label="บริษัท"
                    className={selCls}
                  >
                    <option value="">ทุกบริษัท</option>
                    {companyOpts.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                <div className="w-full sm:w-96">
                  <Segmented<WorkFilter>
                    value={fWork}
                    onChange={(v) => {
                      setFWork(v);
                      if (v === "hq") setFProvince("");
                    }}
                    options={
                      [
                        ["all", "ทั้งหมด"],
                        ["hq", "สำนักงานใหญ่"],
                        ["store", "หน้าร้าน"],
                      ] as const
                    }
                  />
                </div>
                {fWork !== "hq" && provinceOpts.length > 0 && (
                  <select
                    value={fProvince}
                    onChange={(e) => setFProvince(e.target.value)}
                    aria-label="จังหวัด"
                    className={selCls}
                  >
                    <option value="">ทุกจังหวัด</option>
                    {provinceOpts.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
                {filterActive && (
                  <button
                    onClick={clearFilters}
                    className="h-10 rounded-full px-4 text-[14px] font-semibold text-[#3F5E1F] transition-opacity active:opacity-60"
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </>
            )}
            <button
              onClick={exportCsv}
              disabled={!canExport}
              className="ml-auto flex h-10 items-center gap-2 rounded-full bg-[#1B2A21] px-5 text-[14px] font-semibold text-[#C9F25B] transition-transform active:scale-95 disabled:opacity-40"
            >
              <Icon d={ICONS.download} size={16} />
              ส่งออก CSV
            </button>
          </div>
        )}

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
                value={fmtNum(dayScoped.length)}
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
                value={fmtNum(dayReached)}
                sub="คน"
              />
              <StatCard
                icon={ICONS.star}
                label={`ได้ ${fmtNum(day.reward)} point`}
                value={`${dayAwarded}/${day.quota}`}
                sub={`โควตา ${fmtNum(day.quota)} คนแรก`}
              />
            </div>

            {bannedRows.length > 0 && (
              <section className={`${card} mt-4 overflow-hidden`}>
                <div className="border-b border-[#EEF2E4] px-4 py-3 text-[14px] font-semibold text-[#D92D20]">
                  ถูกแบน {fmtNum(bannedRows.length)} คน · คะแนนของวันนี้ไม่ถูกนับ ไม่อยู่ในอันดับ
                </div>
                <ul className="divide-y divide-[#EEF2E4]">
                  {bannedRows.map((e) => (
                    <li key={e.userId}>
                      <button
                        onClick={() =>
                          setDetail({
                            userId: e.userId,
                            date,
                            avatarUrl: e.avatarUrl,
                          })
                        }
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FDF3F2]"
                      >
                        <Avatar name={e.name} src={e.avatarUrl} size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-semibold">
                            {e.name}
                          </div>
                          {idLine(e.username, e.employeeId) && (
                            <div className="truncate text-[12px] text-[#6B7A6E]">
                              {idLine(e.username, e.employeeId)}
                            </div>
                          )}
                          <div className="truncate text-[12px] text-[#D92D20]">
                            เหตุผล: {e.ban.reason}
                          </div>
                          <OrgLine org={e.org} />
                        </div>
                        <div className="shrink-0 text-right text-[12px] text-[#6B7A6E]">
                          <div className="font-semibold text-[#D92D20]">
                            {e.ban.active ? "ถูกแบนอยู่" : "หมดแบนแล้ว"}
                          </div>
                          <div>หมด {fmtBanTime(e.ban.expiresAt)}</div>
                          <div className="tabular-nums">
                            เคยโดด {fmtNum(e.total)} (ไม่นับ)
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
                            role="button"
                            tabIndex={0}
                            aria-label={`ดูผลวันนี้ของ ${e.name}`}
                            onClick={() =>
                              setDetail({
                                userId: e.userId,
                                date,
                                avatarUrl: e.avatarUrl,
                              })
                            }
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                setDetail({
                                  userId: e.userId,
                                  date,
                                  avatarUrl: e.avatarUrl,
                                });
                              }
                            }}
                            className={`cursor-pointer transition-colors hover:bg-[#EEF2E4] focus-visible:bg-[#EEF2E4] focus-visible:outline-none ${
                              e.points > 0 ? "bg-[#F7FBEA]" : ""
                            }`}
                          >
                            <td className="px-4 py-3">
                              <Rank rank={e.rank} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar name={e.name} src={e.avatarUrl} size={44} />
                                <div className="min-w-0">
                                  <div className="truncate text-[15px] font-semibold">
                                    {e.name}
                                  </div>
                                  {idLine(e.username, e.employeeId) && (
                                    <div className="truncate text-[12px] text-[#6B7A6E]">
                                      {idLine(e.username, e.employeeId)}
                                    </div>
                                  )}
                                  <OrgLine org={e.org} />
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
              ตัดวันที่เที่ยงคืนเวลาไทย · กดที่แถวเพื่อดูผลและภาพยืนยันของคนนั้น
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
                value={fmtNum(weekScoped.length)}
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
                              <Avatar name={e.name} src={e.avatarUrl} size={44} />
                              <div className="min-w-0">
                                <div className="truncate text-[15px] font-semibold">
                                  {e.name}
                                </div>
                                <div className="truncate text-[12px] text-[#6B7A6E]">
                                  {e.username && `@${e.username} · `}
                                  {e.employeeId && `รหัส ${e.employeeId} · `}
                                  ได้ point {e.rewardDays} วัน
                                </div>
                                <OrgLine org={e.org} />
                              </div>
                            </div>
                          </td>
                          {e.perDay.map((p, i) => (
                            <td
                              key={i}
                              className="hidden px-1 py-3 text-center md:table-cell"
                            >
                              <span
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[12px] tabular-nums ${
                                  p > 0
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
                              className={`text-[22px] font-semibold tabular-nums ${
                                e.points > 0 ? "text-[#3F5E1F]" : "text-[#A9B79A]"
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
              {sort === "total"
                ? "เรียงตามยอดโดดรวมของสัปดาห์ ถ้าเท่ากันเรียงตาม point"
                : "เรียงตาม point รวมของสัปดาห์ ถ้าเท่ากันเรียงตามยอดโดดรวม"}{" "}
              point คำนวณจากกติกา {POINT_QUOTA} คนแรกที่ถึงเป้ารายวัน ได้ {POINT_REWARD} point
            </p>
          </>
        )}

        {/* ---------------- รายเดือน / ตั้งแต่เริ่ม ---------------- */}
        {state === "ok" && view === "month" && month && (
          <>
            <div className="pj-stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              <StatCard
                dark
                icon={ICONS.users}
                label="คนที่โดด"
                value={fmtNum(monthScoped.filter((e) => e.total > 0).length)}
                sub={`จากสมาชิก ${fmtNum(monthScoped.length)} คน`}
              />
              <StatCard
                icon={ICONS.star}
                label="point ที่แจกรวม"
                value={fmtNum(monthPoints)}
                sub="point"
              />
              <StatCard
                icon={ICONS.bolt}
                label="โดดรวม"
                value={fmtNum(monthTotal)}
                sub="ครั้ง"
              />
              <StatCard
                icon={ICONS.day}
                label="วันที่มีคนโดด"
                value={fmtNum(month.activeDays)}
                sub={`จาก ${fmtNum(month.dayCount)} วัน`}
              />
            </div>

            {group === "group" ? (
              groupReady ? (
                groupBoard
              ) : null
            ) : (
              <>
            <section className={`${card} mt-4 overflow-hidden`}>
              {monthRows.length === 0 ? (
                <p className="px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
                  ไม่มีข้อมูล
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#EEF2E4]">
                        <th className={`${th} w-16`}>#</th>
                        <th className={th}>ผู้เล่น</th>
                        <th className={`${th} hidden text-right md:table-cell`}>
                          วันที่โดด
                        </th>
                        <th className={`${th} hidden text-right md:table-cell`}>
                          วันที่ได้ point
                        </th>
                        <th className={`${th} hidden text-right lg:table-cell`}>
                          รอบ
                        </th>
                        <th className={`${th} hidden text-right lg:table-cell`}>
                          วันที่ดีที่สุด
                        </th>
                        <th className={`${th} text-right`}>โดดรวม</th>
                        <th className={`${th} text-right`}>point รวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2E4]">
                      {monthRows.map((e) => (
                        <tr
                          key={e.userId}
                          role="button"
                          tabIndex={0}
                          aria-label={`ดูรายเดือนของ ${e.name}`}
                          onClick={() =>
                            setMonthDetail({
                              userId: e.userId,
                              month: isAll ? today.slice(0, 7) : date.slice(0, 7),
                              avatarUrl: e.avatarUrl,
                            })
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              setMonthDetail({
                                userId: e.userId,
                                month: isAll
                                  ? today.slice(0, 7)
                                  : date.slice(0, 7),
                                avatarUrl: e.avatarUrl,
                              });
                            }
                          }}
                          className="cursor-pointer transition-colors hover:bg-[#EEF2E4] focus-visible:bg-[#EEF2E4] focus-visible:outline-none"
                        >
                          <td className="px-4 py-3">
                            <Rank rank={e.rank} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={e.name} src={e.avatarUrl} size={44} />
                              <div className="min-w-0">
                                <div className="truncate text-[15px] font-semibold">
                                  {e.name}
                                </div>
                                {idLine(e.username, e.employeeId) && (
                                  <div className="truncate text-[12px] text-[#6B7A6E]">
                                    {idLine(e.username, e.employeeId)}
                                  </div>
                                )}
                                <OrgLine org={e.org} />
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 text-right text-[14px] tabular-nums text-[#6B7A6E] md:table-cell">
                            {fmtNum(e.activeDays)}
                          </td>
                          <td className="hidden px-4 py-3 text-right md:table-cell">
                            <span
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
                                e.rewardDays > 0
                                  ? "bg-[#3F5E1F] text-[#C9F25B]"
                                  : "bg-[#EEF2E4] text-[#A9B79A]"
                              }`}
                            >
                              {e.rewardDays}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 text-right text-[14px] tabular-nums text-[#6B7A6E] lg:table-cell">
                            {fmtNum(e.rounds)}
                          </td>
                          <td className="hidden px-4 py-3 text-right text-[14px] tabular-nums text-[#6B7A6E] lg:table-cell">
                            {fmtNum(e.bestDay)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              sort === "total"
                                ? "text-[22px] font-semibold text-[#3F5E1F]"
                                : "text-[15px] text-[#6B7A6E]"
                            }`}
                          >
                            {fmtNum(e.total)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`font-semibold tabular-nums ${
                                sort === "total" ? "text-[15px]" : "text-[22px]"
                              } ${
                                e.points > 0 ? "text-[#3F5E1F]" : "text-[#A9B79A]"
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
              {sort === "total"
                ? "เรียงตามยอดโดดรวม ถ้าเท่ากันเรียงตาม point"
                : "เรียงตาม point รวม ถ้าเท่ากันเรียงตามยอดโดดรวม"}{" "}
              วันที่ดีที่สุด = ยอดโดดสูงสุดในหนึ่งวัน ·{" "}
              {isAll ? "นับตั้งแต่รอบกระโดดแรกของระบบ " : "นับทั้งเดือน "}
              ตัดวันที่เที่ยงคืนเวลาไทย · point จากกติกา {POINT_QUOTA} คนแรกที่ถึงเป้ารายวัน ได้ {POINT_REWARD} point ·
              กดที่แถวเพื่อดูสังกัดและวันที่ถึงเป้าของคนนั้น
              {isAll ? " (แสดงเดือนปัจจุบัน)" : ""}
            </p>
              </>
            )}
          </>
        )}

        {monthDetail && (
          <UserMonthModal
            userId={monthDetail.userId}
            month={monthDetail.month}
            avatarUrl={monthDetail.avatarUrl}
            onClose={() => setMonthDetail(null)}
            onLocked={() => {
              setMonthDetail(null);
              setState("locked");
            }}
            onPickDay={(d) =>
              setDetail({
                userId: monthDetail.userId,
                date: d,
                avatarUrl: monthDetail.avatarUrl,
              })
            }
          />
        )}

        {detail && (
          <UserDayModal
            onChanged={load}
            userId={detail.userId}
            date={detail.date}
            avatarUrl={detail.avatarUrl}
            onClose={() => setDetail(null)}
            onLocked={() => {
              setDetail(null);
              setState("locked");
            }}
          />
        )}
      </Shell>
    </div>
  );
}