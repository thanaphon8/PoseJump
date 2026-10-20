"use client";

import { useState } from "react";
import { ICONS, Icon, Segmented } from "../auth-shared";

/* ------------------------------------------------------------------ */
/* หน้าประวัติ (แท็บ "ประวัติ")                                          */
/* แยกมาจาก app/page.tsx รวม Calendar / Pager / BarChart ไว้ในไฟล์นี้เลย    */
/* ------------------------------------------------------------------ */

// รอบการกระโดดที่บันทึกไว้ (app/page.tsx นำเข้าชนิดนี้ไปใช้ต่อ)
export type Session = {
  id: number;
  ts: number;
  total: number;
  durationMs: number;
  perMin: number;
  best: number;
  mode: "time" | "count";
  kcal: number;
};

// สี
const LIME = "#C9F25B";
const DAY = 864e5;
// หน้าประวัติ: แสดงหน้าละกี่รายการ เกินนี้แบ่งเป็น page 1 2 3
const HISTORY_PAGE_SIZE = 20;
const DAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const card = "rounded-3xl bg-white pj-lift";

/* ---------------------------- ฟังก์ชันช่วย ---------------------------- */

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
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtNum = (n: number) => n.toLocaleString("en-US");

/* ---------------------------- ส่วนประกอบ UI ---------------------------- */

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

// ปฏิทินรายเดือน: วันที่ทำถึงเป้าหมายต่อวันจะขึ้นติ๊กถูกสีเขียว
function Calendar({
  history,
  goal,
  now,
}: {
  history: Session[];
  goal: number;
  now: number;
}) {
  const [offset, setOffset] = useState(0);

  const base = new Date(now);
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const lead = first.getDay();

  const totals = new Map<string, number>();
  history.forEach((s) => {
    const k = dayKey(s.ts);
    totals.set(k, (totals.get(k) ?? 0) + s.total);
  });

  const todayKey = dayKey(now);
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysIn }, (_, i) => i + 1),
  ];

  let hits = 0;
  for (let d = 1; d <= daysIn; d++) {
    if ((totals.get(`${y}-${m}-${d}`) ?? 0) >= goal) hits++;
  }

  const nav =
    "flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F6EC] text-[#1B2A21] transition-transform active:scale-90 disabled:opacity-30";

  return (
    <section className="rounded-3xl bg-white p-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOffset(offset - 1)}
          aria-label="เดือนก่อนหน้า"
          className={nav}
        >
          <Icon d={ICONS.left} size={18} />
        </button>
        <div className="text-center">
          <div className="text-[16px] font-semibold">
            {first.toLocaleDateString("th-TH", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <div className="text-[12px] text-[#6B7A6E]">ถึงเป้า {hits} วัน</div>
        </div>
        <button
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= 0}
          aria-label="เดือนถัดไป"
          className={nav}
        >
          <Icon d={ICONS.right} size={18} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1.5 text-center">
        {DAY_NAMES.map((n) => (
          <div key={n} className="text-[12px] font-medium text-[#6B7A6E]">
            {n}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const k = `${y}-${m}-${d}`;
          const total = totals.get(k) ?? 0;
          const done = total >= goal;
          const isToday = k === todayKey;
          return (
            <div
              key={k}
              className="flex aspect-square items-center justify-center"
            >
              {done ? (
                <span
                  className={`pj-pop flex h-9 w-9 items-center justify-center rounded-full bg-[#3F5E1F] text-[#C9F25B] ${
                    isToday ? "ring-2 ring-[#C9F25B] ring-offset-2" : ""
                  }`}
                  aria-label={`วันที่ ${d} ถึงเป้า`}
                >
                  <Icon d={ICONS.check} size={18} />
                </span>
              ) : (
                <span
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[14px] tabular-nums ${
                    isToday
                      ? "bg-[#E8F5C1] font-semibold text-[#1B2A21]"
                      : "text-[#1B2A21]"
                  }`}
                >
                  {d}
                  {total > 0 && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#A9B79A]" />
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[12px] text-[#6B7A6E]">
        <span className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#3F5E1F] text-[#C9F25B]">
            <Icon d={ICONS.check} size={10} />
          </span>
          ถึงเป้า
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#A9B79A]" />
          โดดแต่ยังไม่ถึงเป้า
        </span>
      </div>
    </section>
  );
}

// ตัวแบ่งหน้า: ‹ 1 2 3 … 15 › แสดงเฉพาะหน้าแรก หน้าสุดท้าย และหน้าใกล้หน้าปัจจุบัน
function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const shown = [
    ...new Set([1, total, page - 1, page, page + 1]),
  ]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  shown.forEach((n, i) => {
    if (i > 0 && n - shown[i - 1] > 1) items.push("gap");
    items.push(n);
  });

  const base =
    "flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-[14px] font-semibold tabular-nums transition-transform active:scale-90";

  return (
    <nav
      aria-label="แบ่งหน้า"
      className="mt-3 flex flex-wrap items-center justify-center gap-1.5"
    >
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="หน้าก่อนหน้า"
        className={`${base} bg-white text-[#1B2A21] disabled:opacity-30`}
      >
        <Icon d={ICONS.left} size={18} />
      </button>
      {items.map((it, i) =>
        it === "gap" ? (
          <span
            key={`g${i}`}
            className="px-1 text-[14px] text-[#6B7A6E]"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={it}
            onClick={() => onChange(it)}
            aria-label={`หน้า ${it}`}
            aria-current={it === page ? "page" : undefined}
            className={`${base} ${
              it === page ? "bg-[#C9F25B] text-[#1B2A21]" : "bg-white text-[#6B7A6E]"
            }`}
          >
            {it}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= total}
        aria-label="หน้าถัดไป"
        className={`${base} bg-white text-[#1B2A21] disabled:opacity-30`}
      >
        <Icon d={ICONS.right} size={18} />
      </button>
    </nav>
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
/* หน้าประวัติ                                                           */
/* ------------------------------------------------------------------ */

export default function History({
  history,
  now0,
  dailyGoal,
}: {
  history: Session[];
  now0: number | null;
  dailyGoal: number;
}) {
  const [hTab, setHTab] = useState<"week" | "month">("week");
  const [hPage, setHPage] = useState(1);

  const sod = now0 ? startOfDay(now0) : 0;

  const sumRange = (from: number, to: number) =>
    history.reduce((a, s) => (s.ts >= from && s.ts < to ? a + s.total : a), 0);
  const span = hTab === "week" ? 7 : 28;
  const histBars =
    hTab === "week"
      ? Array.from({ length: 7 }, (_, i) => {
          const from = sod - (6 - i) * DAY;
          return {
            label: DAY_NAMES[new Date(from).getDay()],
            value: sumRange(from, from + DAY),
          };
        })
      : Array.from({ length: 4 }, (_, i) => {
          const to = sod + DAY - (3 - i) * 7 * DAY;
          return { label: `ส.${i + 1}`, value: sumRange(to - 7 * DAY, to) };
        });
  const periodStart = sod + DAY - span * DAY;
  const periodTotal = histBars.reduce((a, b) => a + b.value, 0);
  const prevTotal = sumRange(periodStart - span * DAY, periodStart);
  const delta =
    prevTotal > 0
      ? Math.round(((periodTotal - prevTotal) / prevTotal) * 100)
      : null;
  const periodList = history.filter((s) => s.ts >= periodStart);
  const periodMs = periodList.reduce((a, s) => a + s.durationMs, 0);
  const periodGoal = dailyGoal * span;
  const periodPct = Math.min(1, periodTotal / Math.max(1, periodGoal));

  // แบ่งหน้ารายการประวัติ (ลบประวัติจนหน้าที่ดูอยู่เกิน ให้ถอยมาหน้าสุดท้าย)
  const totalPages = Math.max(
    1,
    Math.ceil(history.length / HISTORY_PAGE_SIZE)
  );
  const curPage = Math.min(hPage, totalPages);
  const pageFrom = (curPage - 1) * HISTORY_PAGE_SIZE;
  const pageItems = history.slice(pageFrom, pageFrom + HISTORY_PAGE_SIZE);

  return (
    <>
      <h1 className="text-[30px] font-bold tracking-tight lg:text-[36px]">
        ยิ่งโดด ยิ่งก้าวหน้า
      </h1>
      <p className="mt-1 text-[14px] text-[#6B7A6E]">
        ดูภาพรวมผลของคุณในแต่ละช่วง
      </p>
      <div className="mt-5 max-w-xs">
        <Segmented<"week" | "month">
          value={hTab}
          onChange={setHTab}
          options={
            [
              ["week", "สัปดาห์"],
              ["month", "เดือน"],
            ] as const
          }
        />
      </div>

      <div className="mt-4 space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <div className="pj-stagger space-y-4">
          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between text-[13px] text-[#6B7A6E]">
              <span>{hTab === "week" ? "7 วันล่าสุด" : "4 สัปดาห์ล่าสุด"}</span>
              {delta !== null && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                    delta >= 0
                      ? "bg-[#E8F5C1] text-[#3F5E1F]"
                      : "bg-[#FDE8E6] text-[#D92D20]"
                  }`}
                >
                  {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[44px] font-semibold leading-none tabular-nums tracking-tight">
                {fmtNum(periodTotal)}
              </span>
              <span className="text-[14px] text-[#6B7A6E]">ครั้ง</span>
            </div>
            <div className="mt-5">
              <BarChart bars={histBars} highlight={histBars.length - 1} />
            </div>
            <p className="mt-3 text-[12px] text-[#6B7A6E]">
              รวมเวลา {formatTime(periodMs)} นาที · {periodList.length} รอบ
            </p>
          </section>

          <section className="rounded-3xl bg-[#E8F5C1] p-5">
            <div className="flex items-center justify-between text-[14px] font-semibold">
              <span>
                เป้าหมาย {span} วัน · {fmtNum(periodGoal)} ครั้ง
              </span>
              <span className="tabular-nums">
                {Math.round(periodPct * 100)}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-[#3F5E1F] transition-[width] duration-500"
                style={{ width: `${periodPct * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-[#4B5E3A]">
              {periodTotal >= periodGoal
                ? "ถึงเป้าแล้ว!"
                : `อีก ${fmtNum(periodGoal - periodTotal)} ครั้งก็ถึงเป้า`}
            </p>
          </section>

          {now0 && <Calendar history={history} goal={dailyGoal} now={now0} />}
        </div>

        <section>
          <h2 className="mb-2 px-1 text-[16px] font-semibold">
            การกระโดดล่าสุด
          </h2>
          {history.length === 0 ? (
            <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
              ยังไม่มีประวัติ
            </p>
          ) : (
            <>
              <ul className={`${card} divide-y divide-[#EEF2E4]`}>
                {pageItems.map(sessionRow)}
              </ul>
              {totalPages > 1 && (
                <>
                  <p className="mt-3 text-center text-[12px] text-[#6B7A6E]">
                    {pageFrom + 1}–{pageFrom + pageItems.length} จาก{" "}
                    {fmtNum(history.length)} รายการ
                  </p>
                  <Pager
                    page={curPage}
                    total={totalPages}
                    onChange={setHPage}
                  />
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}