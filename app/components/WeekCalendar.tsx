"use client";

import { useEffect, useState } from "react";

// ปฏิทินรายเดือนสำหรับหน้ารายสัปดาห์ของแอดมิน
// แถวละ 1 สัปดาห์ (จันทร์-อาทิตย์) มี preview คนโดด กดแถวเพื่อเลือกสัปดาห์นั้น
// ดึงข้อมูลจาก /api/admin/calendar?month=YYYY-MM

type Top = { name: string; avatarUrl: string | null; total: number };
type CalDay = {
  date: string;
  inMonth: boolean;
  players: number;
  total: number;
};
type CalWeek = {
  start: string;
  days: CalDay[];
  players: number;
  total: number;
  points: number;
  top: Top[];
};
type CalData = { month: string; weeks: CalWeek[] };

const DAY_MS = 864e5;
const DAY_NAMES = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const fmtNum = (n: number) => n.toLocaleString("en-US");

const mondayOf = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay();
  return new Date(d.getTime() - ((dow + 6) % 7) * DAY_MS)
    .toISOString()
    .slice(0, 10);
};
const addMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const fmtShort = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const fmtMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function MiniAvatar({ name, src }: { name: string; src: string | null }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (src && !bad) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBad(true)}
        className="h-6 w-6 shrink-0 rounded-full bg-[#1B2A21] object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B2A21] text-[11px] font-semibold text-[#C9F25B]"
    >
      {(Array.from(name.trim())[0] ?? "?").toUpperCase()}
    </span>
  );
}

const chev = (d: string) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

export default function WeekCalendar({
  date,
  today,
  onPick,
  onLocked,
}: {
  date: string; // วันที่เลือกอยู่ (หน้ารายสัปดาห์)
  today: string;
  onPick: (weekStart: string) => void;
  onLocked: () => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  const [data, setData] = useState<CalData | null>(null);
  const [st, setSt] = useState<"loading" | "ok" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let off = false;
    setSt("loading");
    (async () => {
      try {
        const r = await fetch(`/api/admin/calendar?month=${month}`, {
          cache: "no-store",
        });
        if (r.status === 401 || r.status === 403) {
          if (!off) onLocked();
          return;
        }
        if (!r.ok) throw new Error("load failed");
        const j = (await r.json()) as CalData;
        if (!off) {
          setData(j);
          setSt("ok");
        }
      } catch {
        if (!off) setSt("error");
      }
    })();
    return () => {
      off = true;
    };
    // onLocked ไม่ต้องเป็น dependency (เรียกแค่ตอน 401)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, retry]);

  const selected = date ? mondayOf(date) : "";
  const todayMonth = today.slice(0, 7);
  const maxDay = Math.max(
    1,
    ...(data?.weeks.flatMap((w) => w.days.map((d) => d.total)) ?? [0])
  );

  return (
    <section className="pj-fade mb-5 rounded-3xl bg-white p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setMonth((m) => addMonth(m, -1))}
          aria-label="เดือนก่อนหน้า"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F6EC] text-[#1B2A21] transition-transform active:scale-90"
        >
          {chev("M15 6l-6 6 6 6")}
        </button>
        <div className="text-center">
          <div className="text-[17px] font-semibold">{fmtMonth(month)}</div>
          <div className="text-[12px] text-[#6B7A6E]">
            กดแถวเพื่อดูสัปดาห์นั้น
          </div>
        </div>
        <button
          onClick={() => setMonth((m) => addMonth(m, 1))}
          disabled={!!todayMonth && month >= todayMonth}
          aria-label="เดือนถัดไป"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F6EC] text-[#1B2A21] transition-transform active:scale-90 disabled:opacity-30"
        >
          {chev("M9 6l6 6-6 6")}
        </button>
      </div>

      {st === "loading" && (
        <p className="py-10 text-center text-[14px] text-[#6B7A6E]">
          กำลังโหลด
        </p>
      )}
      {st === "error" && (
        <div className="py-8 text-center">
          <p className="text-[14px] text-[#D92D20]">โหลดปฏิทินไม่สำเร็จ</p>
          <button
            onClick={() => setRetry((n) => n + 1)}
            className="mt-3 h-10 rounded-full bg-[#C9F25B] px-6 text-[14px] font-semibold text-[#1B2A21] active:scale-95"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {st === "ok" && data && (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_17rem] gap-3 px-2 pb-1 lg:grid">
            <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] font-medium text-[#6B7A6E]">
              {DAY_NAMES.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
            <span className="text-[12px] font-medium text-[#6B7A6E]">
              สรุปสัปดาห์
            </span>
          </div>

          <div className="space-y-2">
            {data.weeks.map((w) => {
              const future = !!today && w.start > today;
              const sel = w.start === selected;
              const last = w.days[6].date;
              return (
                <button
                  key={w.start}
                  disabled={future}
                  onClick={() => onPick(w.start)}
                  aria-label={`สัปดาห์ ${fmtShort(w.start)} ถึง ${fmtShort(last)}`}
                  aria-pressed={sel}
                  className={`grid w-full gap-3 rounded-2xl p-2 text-left ring-2 transition-colors lg:grid-cols-[minmax(0,1fr)_17rem] ${
                    sel
                      ? "bg-[#F7FBEA] ring-[#C9F25B]"
                      : "bg-[#F3F6EC]/60 ring-transparent hover:bg-[#EEF2E4]"
                  } ${future ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <div>
                    <div className="mb-1 px-1 text-[12px] font-semibold text-[#3F5E1F] lg:hidden">
                      {fmtShort(w.start)} – {fmtShort(last)}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {w.days.map((d, i) => {
                        const a = d.total > 0 ? 0.18 + 0.72 * (d.total / maxDay) : 0;
                        return (
                          <div
                            key={d.date}
                            title={`${fmtShort(d.date)} · ${fmtNum(d.players)} คน · ${fmtNum(d.total)} ครั้ง`}
                            className={`flex h-14 flex-col items-center justify-center rounded-xl ${
                              d.inMonth ? "" : "opacity-40"
                            }`}
                            style={{
                              background:
                                d.total > 0
                                  ? `rgba(63,94,31,${a.toFixed(2)})`
                                  : "#EEF2E4",
                              color: a > 0.5 ? "#fff" : "#1B2A21",
                            }}
                          >
                            <span className="text-[11px] opacity-70 lg:hidden">
                              {DAY_NAMES[i]}
                            </span>
                            <span className="text-[14px] font-semibold leading-none tabular-nums">
                              {Number(d.date.slice(8))}
                            </span>
                            <span className="mt-1 text-[10px] tabular-nums opacity-80">
                              {d.total > 0 ? fmtNum(d.total) : "–"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="min-w-0 px-1 py-0.5">
                    <div className="hidden text-[12px] font-semibold text-[#3F5E1F] lg:block">
                      {fmtShort(w.start)} – {fmtShort(last)}
                    </div>
                    {w.players === 0 ? (
                      <p className="text-[13px] text-[#A9B79A] lg:mt-1">
                        ไม่มีคนโดด
                      </p>
                    ) : (
                      <>
                        <p className="text-[13px] tabular-nums text-[#6B7A6E] lg:mt-0.5">
                          <b className="font-semibold text-[#1B2A21]">
                            {fmtNum(w.players)}
                          </b>{" "}
                          คน ·{" "}
                          <b className="font-semibold text-[#1B2A21]">
                            {fmtNum(w.total)}
                          </b>{" "}
                          ครั้ง ·{" "}
                          <b className="font-semibold text-[#3F5E1F]">
                            {fmtNum(w.points)}
                          </b>{" "}
                          point
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {w.top.map((u, i) => (
                            <li
                              key={`${u.name}-${i}`}
                              className="flex items-center gap-2 text-[12px]"
                            >
                              <MiniAvatar name={u.name} src={u.avatarUrl} />
                              <span className="min-w-0 flex-1 truncate">
                                {u.name}
                              </span>
                              <span className="tabular-nums text-[#6B7A6E]">
                                {fmtNum(u.total)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}