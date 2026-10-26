"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// วางข้าง UserDayModal.tsx (app/components/UserMonthModal.tsx)
// หน้าต่างแสดงผลรายเดือนของผู้เล่นหนึ่งคน: สังกัด + ปฏิทินวันที่ถึงเป้า
// ข้อมูลมาจาก GET /api/admin/user-month?userId=...&month=YYYY-MM

type OrgInfo = {
  company: string | null;
  workplace: "สำนักงานใหญ่" | "หน้าร้าน" | null;
  department: string | null;
  branch: string | null;
  branchCode: string | null;
  province: string | null;
  region: string | null;
};

type DayRow = {
  date: string;
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
  reached: boolean;
};

type UserMonth = {
  month: string;
  dayCount: number;
  user: {
    userId: string;
    name: string;
    username: string;
    avatarUrl?: string | null;
    org?: OrgInfo;
  };
  days: DayRow[];
  reachedCount: number;
  activeDays: number;
  rewardDays: number;
  points: number;
  total: number;
};

const fmtNum = (n: number) => n.toLocaleString("en-US");
// ตัวเลขเล็กใต้วันที่ในปฏิทิน: 1,234 -> 1.2k กันล้นช่อง
const fmtTiny = (n: number) =>
  n >= 10000
    ? `${Math.round(n / 1000)}k`
    : n >= 1000
      ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
      : String(n);
const fmtMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const fmtLong = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
// เดือนปัจจุบันตามเวลาไทย (YYYY-MM) และเลื่อนเดือนทีละ n
const nowMonth = () =>
  new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
const shiftYm = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const DAY_NAMES = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function Avatar({
  name,
  src,
  size = 56,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (src && !bad) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
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

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center">
      <div className="text-[12px] text-[#6B7A6E]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums">{children}</div>
    </div>
  );
}

export default function UserMonthModal({
  userId,
  month: initialMonth,
  avatarUrl,
  onClose,
  onLocked,
  onPickDay,
}: {
  userId: string;
  month: string; // YYYY-MM
  avatarUrl?: string | null;
  onClose: () => void;
  onLocked: () => void;
  // กดวันในปฏิทิน -> เปิดผล + ภาพยืนยันของวันนั้น (UserDayModal)
  onPickDay?: (date: string) => void;
}) {
  // เดือนที่กำลังดู เริ่มจากเดือนที่หน้าหลักส่งมา แล้วเลือกเปลี่ยนเองได้
  const [month, setMonth] = useState(initialMonth);
  const maxMonth = nowMonth();
  const [data, setData] = useState<UserMonth | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "empty">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const lockedRef = useRef(onLocked);
  lockedRef.current = onLocked;

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setData(null);
    (async () => {
      try {
        const r = await fetch(
          `/api/admin/user-month?userId=${encodeURIComponent(userId)}&month=${month}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (r.status === 401 || r.status === 403) {
          lockedRef.current();
          return;
        }
        if (r.status === 404) {
          setState("empty");
          return;
        }
        if (!r.ok) throw new Error("load failed");
        setData((await r.json()) as UserMonth);
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, month, reloadKey]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const o = data?.user.org;
  const orgRows: [string, string][] = [];
  if (o?.company) orgRows.push(["บริษัท", o.company]);
  if (o?.workplace) orgRows.push(["ที่ทำงาน", o.workplace]);
  if (o?.department) orgRows.push(["แผนก", o.department]);
  if (o?.branch) orgRows.push(["สาขา", o.branch]);
  if (o?.branchCode) orgRows.push(["รหัสสาขา", `ID ${o.branchCode}`]);
  if (o?.province)
    orgRows.push(["จังหวัด", o.region ? `${o.province} · ${o.region}` : o.province]);

  // ปฏิทิน เริ่มวันจันทร์
  const [y, m] = month.split("-").map(Number);
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: nDays }, (_, i) => i + 1),
  ];
  const ymd = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
  const reachedList = (data?.days ?? []).filter((d) => d.reached);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ผลรายเดือนของผู้เล่น"
      className="fixed left-0 top-0 z-50 flex w-full items-end justify-center bg-[#1B2A21]/60 p-0 sm:items-center sm:p-5"
      style={{ height: "100dvh" }}
      onClick={onClose}
    >
      <div
        className="pj-in relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-[#F3F6EC] text-[#1B2A21] shadow-2xl sm:rounded-[32px] lg:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5 lg:items-center lg:px-7 lg:pt-6">
          <Avatar
            name={data?.user.name ?? "?"}
            src={data?.user.avatarUrl ?? avatarUrl}
            size={64}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-bold leading-tight lg:text-[24px]">
              {data?.user.name ?? "กำลังโหลด"}
            </h2>
            {data?.user.username && (
              <div className="truncate text-[12px] text-[#6B7A6E] lg:text-[13px]">
                @{data.user.username}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMonth((m) => shiftYm(m, -1))}
                aria-label="เดือนก่อนหน้า"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[16px] font-semibold transition-transform hover:bg-[#E8EEDD] active:scale-90"
              >
                ‹
              </button>
              <input
                type="month"
                value={month}
                max={maxMonth}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                aria-label="เลือกเดือน"
                className="h-8 min-w-0 rounded-full bg-white px-3 text-[13px] outline-none ring-2 ring-transparent focus:ring-[#C9F25B]"
              />
              <button
                type="button"
                onClick={() => setMonth((m) => shiftYm(m, 1))}
                disabled={month >= maxMonth}
                aria-label="เดือนถัดไป"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[16px] font-semibold transition-transform hover:bg-[#E8EEDD] active:scale-90 disabled:opacity-30"
              >
                ›
              </button>
              {month !== maxMonth && (
                <button
                  type="button"
                  onClick={() => setMonth(maxMonth)}
                  className="h-8 rounded-full bg-[#C9F25B] px-3 text-[12px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
                >
                  เดือนนี้
                </button>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[18px] font-semibold transition-transform hover:bg-[#E8EEDD] active:scale-90"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:px-7">
          {state === "loading" && (
            <p className="rounded-3xl bg-white px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
              กำลังโหลด
            </p>
          )}
          {state === "empty" && (
            <p className="rounded-3xl bg-white px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
              ไม่พบผู้เล่นคนนี้
            </p>
          )}
          {state === "error" && (
            <div className="rounded-3xl bg-white px-4 py-10 text-center">
              <p className="text-[14px] text-[#D92D20]">
                โหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่
              </p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-3 h-10 rounded-full bg-[#C9F25B] px-6 text-[14px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
              >
                ลองใหม่
              </button>
            </div>
          )}

          {state === "ok" && data && (
            <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
              {/* ซ้าย: สรุป + สังกัด */}
              <div className="flex flex-col">
                <section className="rounded-3xl bg-[#1B2A21] px-5 py-6 text-center text-white">
                  <div className="text-[13px] text-white/60">ถึงเป้ารายวัน</div>
                  <div className="mt-1 flex items-baseline justify-center gap-2">
                    <span className="text-[64px] font-semibold leading-none tabular-nums tracking-tight">
                      {fmtNum(data.reachedCount)}
                    </span>
                    <span className="text-[16px] text-white/70">
                      / {fmtNum(data.dayCount)} วัน
                    </span>
                  </div>
                </section>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <StatBox label="วันที่โดด">{fmtNum(data.activeDays)}</StatBox>
                  <StatBox label="ได้ point">{fmtNum(data.rewardDays)}</StatBox>
                  <StatBox label="point">
                    <span className={data.points > 0 ? "text-[#3F5E1F]" : "text-[#A9B79A]"}>
                      {fmtNum(data.points)}
                    </span>
                  </StatBox>
                </div>
                <div className="mt-3 rounded-2xl bg-white p-3 text-center">
                  <div className="text-[12px] text-[#6B7A6E]">โดดรวมเดือนนี้</div>
                  <div className="mt-1 text-[22px] font-semibold tabular-nums">
                    {fmtNum(data.total)} ครั้ง
                  </div>
                </div>
                {orgRows.length > 0 ? (
                  <dl className="mt-3 divide-y divide-[#E3EAD6] overflow-hidden rounded-2xl bg-white text-[14px]">
                    {orgRows.map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-start justify-between gap-4 px-4 py-2.5"
                      >
                        <dt className="shrink-0 text-[#6B7A6E]">{label}</dt>
                        <dd className="min-w-0 break-words text-right font-semibold">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-center text-[13px] text-[#6B7A6E]">
                    ยังไม่มีข้อมูลสังกัด
                  </p>
                )}
              </div>

              {/* ขวา: ปฏิทิน + รายการวัน */}
              <section className="mt-3 rounded-3xl bg-white p-4 lg:mt-0 lg:p-5">
                <h3 className="text-[15px] font-semibold">
                  วันที่ถึงเป้าใน{fmtMonth(month)}
                </h3>
                <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
                  {DAY_NAMES.map((n) => (
                    <div key={n} className="text-[11px] font-medium text-[#6B7A6E]">
                      {n}
                    </div>
                  ))}
                  {cells.map((d, i) => {
                    if (d === null) return <div key={`b${i}`} />;
                    const row = byDate.get(ymd(d));
                    const cls = row?.reached
                      ? "bg-[#3F5E1F] font-semibold text-[#C9F25B]"
                      : row
                        ? "bg-[#EEF2E4] text-[#1B2A21]"
                        : "text-[#A9B79A]";
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!row || !onPickDay}
                        onClick={() => row && onPickDay?.(row.date)}
                        title={
                          row
                            ? `${fmtNum(row.total)} / ${fmtNum(row.goal)} ครั้ง${
                                row.points > 0 ? ` · +${row.points} point` : ""
                              }`
                            : undefined
                        }
                        className={`flex aspect-square flex-col items-center justify-center rounded-full text-[13px] leading-none tabular-nums transition-transform enabled:active:scale-90 ${cls}`}
                      >
                        <span>{d}</span>
                        {row && (
                          <span
                            className={`mt-0.5 text-[9px] font-normal leading-none ${
                              row.reached ? "text-[#C9F25B]/80" : "text-[#6B7A6E]"
                            }`}
                          >
                            {fmtTiny(row.total)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[#6B7A6E]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#3F5E1F]" />
                    ถึงเป้า
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#EEF2E4]" />
                    โดดแต่ไม่ถึงเป้า
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border border-[#C5CFB5]" />
                    ไม่ได้โดด
                  </span>
                </div>

                {reachedList.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-[#F3F6EC] px-4 py-6 text-center text-[14px] text-[#6B7A6E]">
                    เดือนนี้ยังไม่มีวันที่ถึงเป้า
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-[#EEF2E4] overflow-hidden rounded-2xl bg-[#F7FBEA]">
                    {reachedList.map((d) => (
                      <li key={d.date}>
                        <button
                          type="button"
                          disabled={!onPickDay}
                          onClick={() => onPickDay?.(d.date)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] enabled:hover:bg-[#EEF2E4]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {fmtLong(d.date)}
                            </span>
                            <span className="block text-[12px] tabular-nums text-[#6B7A6E]">
                              {fmtNum(d.total)} / {fmtNum(d.goal)} ครั้ง · ลำดับ{" "}
                              {d.goalRank}
                            </span>
                          </span>
                          {d.points > 0 ? (
                            <span className="shrink-0 font-semibold tabular-nums text-[#3F5E1F]">
                              +{fmtNum(d.points)}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[12px] text-[#6B7A6E]">
                              ไม่ทัน point
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}