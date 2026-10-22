"use client";

import { useEffect, useState } from "react";

// วางข้างไฟล์หน้าแอดมิน (app/admin/UserDayModal.tsx)
// หน้าต่างแสดงผลของผู้เล่นหนึ่งคนในหนึ่งวัน: ยอดโดดรวม และภาพยืนยัน 2 ภาพ
// ข้อมูลมาจาก GET /api/admin/user-day?userId=...&date=YYYY-MM-DD

type OrgInfo = {
  company: string | null;
  workplace: "สำนักงานใหญ่" | "หน้าร้าน" | null;
  department: string | null;
  branch: string | null;
  branchCode: string | null;
  province: string | null;
  region: string | null;
};

type UserDay = {
  date: string;
  user: { userId: string; name: string; username: string; org?: OrgInfo };
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
  snapshots: { start: string | null; end: string | null };
};

const fmtNum = (n: number) => n.toLocaleString("en-US");

const fmtLong = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const orgText = (o?: OrgInfo) =>
  !o
    ? ""
    : [
        o.company,
        o.workplace,
        o.department,
        o.branch
          ? o.branchCode
            ? `ID ${o.branchCode} ${o.branch}`
            : o.branch
          : null,
        o.province,
      ]
        .filter(Boolean)
        .join(" · ");

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

// รูปจาก Drive ที่เพิ่งอัปโหลดบางครั้งยังโหลดไม่ได้ทันที จึงลองใหม่ได้ 3 ครั้ง
function Shot({
  src,
  label,
  empty,
}: {
  src: string | null;
  label: string;
  empty: string;
}) {
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setTries(0);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!failed || !src || tries >= 3) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      setFailed(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [failed, src, tries]);

  const url =
    src && tries > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${tries}` : src;

  return (
    <figure>
      <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[#EEF2E4]">
        {url && !(failed && tries >= 3) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-[13px] text-[#6B7A6E]">
            {src ? "โหลดภาพไม่สำเร็จ" : empty}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex items-center justify-center gap-2 text-[13px] font-medium text-[#1B2A21]">
        {label}
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-[#3F5E1F] underline"
          >
            เปิดเต็มจอ
          </a>
        )}
      </figcaption>
    </figure>
  );
}

export default function UserDayModal({
  userId,
  date,
  onClose,
  onLocked,
}: {
  userId: string;
  date: string;
  onClose: () => void;
  // เซสชันผู้ดูแลหมดอายุ ให้หน้าหลักกลับไปหน้ากรอกรหัสผ่าน
  onLocked: () => void;
}) {
  const [data, setData] = useState<UserDay | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "empty">(
    "loading"
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setData(null);
    (async () => {
      try {
        const r = await fetch(
          `/api/admin/user-day?userId=${encodeURIComponent(userId)}&date=${date}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (r.status === 401 || r.status === 403) {
          onLocked();
          return;
        }
        if (r.status === 404) {
          setState("empty");
          return;
        }
        if (!r.ok) throw new Error("load failed");
        setData((await r.json()) as UserDay);
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, date, reloadKey, onLocked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const pct = data
    ? Math.min(100, (data.total / Math.max(1, data.goal)) * 100)
    : 0;
  const org = orgText(data?.user.org);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ผลของผู้เล่นในวันนี้"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/60 p-0 sm:items-center sm:p-5"
      onClick={onClose}
    >
      <div
        className="pj-in relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-[#F3F6EC] text-[#1B2A21] shadow-2xl sm:rounded-[32px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1B2A21] text-[20px] font-semibold text-[#C9F25B]"
            aria-hidden
          >
            {initialOf(data?.user.name ?? "?")}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-bold leading-tight">
              {data?.user.name ?? "กำลังโหลด"}
            </h2>
            {data?.user.username && (
              <div className="truncate text-[12px] text-[#6B7A6E]">
                @{data.user.username}
              </div>
            )}
            {org && (
              <div className="truncate text-[11px] text-[#8A9A7C]" title={org}>
                {org}
              </div>
            )}
            <div className="mt-0.5 text-[12px] text-[#6B7A6E]">
              {fmtLong(date)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[18px] font-semibold transition-transform active:scale-90"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6">
          {state === "loading" && (
            <p className="rounded-3xl bg-white px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
              กำลังโหลด
            </p>
          )}

          {state === "empty" && (
            <p className="rounded-3xl bg-white px-4 py-10 text-center text-[14px] text-[#6B7A6E]">
              ไม่พบข้อมูลของผู้เล่นคนนี้ในวันที่เลือก
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
            <>
              <section className="rounded-3xl bg-[#1B2A21] px-5 py-6 text-center text-white">
                <div className="text-[13px] text-white/60">ครั้งรวมวันนี้</div>
                <div className="mt-1 flex items-baseline justify-center gap-2">
                  <span className="text-[64px] font-semibold leading-none tabular-nums tracking-tight">
                    {fmtNum(data.total)}
                  </span>
                  <span className="text-[16px] text-white/70">ครั้ง</span>
                </div>
                <div
                  className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-white/15"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                >
                  <div
                    className="h-full rounded-full bg-[#C9F25B]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[12px] tabular-nums text-white/60">
                  {fmtNum(data.total)} / {fmtNum(data.goal)} ครั้ง
                </div>
              </section>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white p-3 text-center">
                  <div className="text-[12px] text-[#6B7A6E]">รอบ</div>
                  <div className="mt-1 text-[22px] font-semibold tabular-nums">
                    {fmtNum(data.rounds)}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-3 text-center">
                  <div className="text-[12px] text-[#6B7A6E]">ถึงเป้า</div>
                  <div className="mt-1 text-[22px] font-semibold tabular-nums">
                    {data.goalRank !== null ? `ลำดับ ${data.goalRank}` : "–"}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-3 text-center">
                  <div className="text-[12px] text-[#6B7A6E]">point</div>
                  <div
                    className={`mt-1 text-[22px] font-semibold tabular-nums ${
                      data.points > 0 ? "text-[#3F5E1F]" : "text-[#A9B79A]"
                    }`}
                  >
                    {data.points > 0 ? `+${fmtNum(data.points)}` : "–"}
                  </div>
                </div>
              </div>

              <section className="mt-3 rounded-3xl bg-white p-4">
                <h3 className="text-[15px] font-semibold">
                  ภาพยืนยันการกระโดดวันนี้
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Shot
                    src={data.snapshots.start}
                    label="ภาพแรกของวัน"
                    empty="ไม่มีภาพ"
                  />
                  <Shot
                    src={data.snapshots.end}
                    label="ใกล้ถึงเป้าวันนี้"
                    empty="ยังไม่มีภาพ (ยอดยังไม่ถึง 90% ของเป้า)"
                  />
                </div>
                <p className="mt-3 text-[12px] text-[#6B7A6E]">
                  ภาพมาจากผู้ที่ล็อกอินและโดดหลังเปิดระบบเก็บภาพขึ้น Google Drive
                  ผู้เล่นที่ใช้งานก่อนหน้านั้นจะไม่มีภาพ
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}