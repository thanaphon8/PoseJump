"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// วางข้างไฟล์หน้าแอดมิน (app/admin/UserDayModal.tsx)
// หน้าต่างแสดงผลของผู้เล่นหนึ่งคนในหนึ่งวัน: ยอดโดดรวม และภาพยืนยัน 2 ภาพ
// ข้อมูลมาจาก GET /api/admin/user-day?userId=...&date=YYYY-MM-DD
// คอมพิวเตอร์ (lg ขึ้นไป): หน้าต่างกว้าง แบ่งซ้าย-ขวา ซ้ายสรุปยอด ขวาภาพใหญ่ กดภาพเพื่อขยาย
// ในหน้าต่างขยาย: ลูกศรซ้าย/ขวาสลับภาพ Esc ปิด

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
  user: {
    userId: string;
    name: string;
    username: string;
    employeeId?: string | null;
    avatarUrl?: string | null;
    org?: OrgInfo;
  };
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
  snapshots: { start: string | null; end: string | null };
  // แบนของวันนั้น หรือแบนที่ยังมีผลอยู่ (null = ไม่ถูกแบน)
  ban: {
    id: string;
    reason: string;
    bannedAt: number;
    expiresAt: number;
    day: string;
    active: boolean;
  } | null;
};

const fmtNum = (n: number) => n.toLocaleString("en-US");

const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });

// วันนี้เวลาไทย (แบนได้เฉพาะวันนี้)
const todayYmdTh = () =>
  new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

const fmtLong = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

// รูปโปรไฟล์ ถ้าไม่มีหรือโหลดไม่ได้ใช้ตัวอักษรแรกของชื่อแทน (ลองโหลดใหม่ได้ 3 ครั้ง)
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
    const url = tries > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${tries}` : src;
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
      {initialOf(name)}
    </span>
  );
}

// รูปจาก Drive ที่เพิ่งอัปโหลดบางครั้งยังโหลดไม่ได้ทันที จึงลองใหม่ได้ 3 ครั้ง
function Shot({
  src,
  label,
  empty,
  onOpen,
}: {
  src: string | null;
  label: string;
  empty: string;
  onOpen: () => void;
}) {
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);
  // สัดส่วน กว้าง/สูง ของรูป เริ่มที่แนวตั้ง 9:16 แล้วใช้สัดส่วนจริงของรูปเมื่อโหลดเสร็จ
  const [ratio, setRatio] = useState(9 / 16);
  const areaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setTries(0);
    setFailed(false);
  }, [src]);

  // คำนวณกรอบให้พอดีกับรูปที่สุดภายในพื้นที่ที่มี (ไม่เหลือขอบว่างรอบรูป)
  // จอคอม: พอดีทั้งกว้างและสูง / มือถือ: เต็มความกว้าง สูงตามสัดส่วนรูป
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => {
      const W = el.clientWidth;
      const desk = window.matchMedia("(min-width: 1024px)").matches;
      const H = desk ? el.clientHeight : Infinity;
      if (!W || (desk && !H)) return;
      const w = Math.floor(Math.min(W, H * ratio));
      const h = Math.floor(w / ratio);
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

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
  const showImg = !!url && !(failed && tries >= 3);

  return (
    <figure className="flex min-h-0 flex-col lg:h-full">
      <div
        ref={areaRef}
        className="flex min-h-0 items-center justify-center lg:flex-1"
      >
       <div
        className="relative overflow-hidden rounded-2xl bg-[#EEF2E4]"
        style={
          box
            ? { width: box.w, height: box.h }
            : { width: "100%", aspectRatio: ratio }
        }
       >
        {showImg ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`ขยาย ${label}`}
            className="group relative block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9F25B]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w > 0 && h > 0) setRatio(w / h);
              }}
              className="h-full w-full object-contain"
            />
            <span className="pointer-events-none absolute bottom-3 right-3 hidden rounded-full bg-[#1B2A21]/80 px-3 py-1 text-[12px] font-semibold text-[#C9F25B] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
              คลิกเพื่อขยาย
            </span>
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 text-center text-[13px] text-[#6B7A6E]">
            {src ? "โหลดภาพไม่สำเร็จ" : empty}
          </div>
        )}
       </div>
      </div>
      <figcaption className="mt-2 flex shrink-0 items-center justify-center gap-3 text-[13px] font-medium text-[#1B2A21]">
        {label}
        {src && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-[#3F5E1F] underline"
          >
            เปิดในแท็บใหม่
          </a>
        )}
      </figcaption>
    </figure>
  );
}

function StatBox({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center">
      <div className="text-[12px] text-[#6B7A6E]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums">
        {children}
      </div>
    </div>
  );
}

export default function UserDayModal({
  userId,
  date,
  avatarUrl,
  onClose,
  onLocked,
  onChanged,
}: {
  userId: string;
  date: string;
  // รูปจากแถวในหน้าหลัก ใช้เมื่อ API user-day ยังไม่ส่งรูปมา
  avatarUrl?: string | null;
  onClose: () => void;
  // เซสชันผู้ดูแลหมดอายุ ให้หน้าหลักกลับไปหน้ากรอกรหัสผ่าน
  onLocked: () => void;
  // เรียกหลังแบน/ปลดแบนสำเร็จ ให้หน้าหลักโหลดตารางใหม่
  onChanged?: () => void;
}) {
  const [data, setData] = useState<UserDay | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "empty">(
    "loading"
  );
  const [reloadKey, setReloadKey] = useState(0);
  // ภาพที่กำลังขยาย (ดัชนีใน shots) null = ไม่เปิด
  const [preview, setPreview] = useState<number | null>(null);

  // ฟอร์มแบน
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [banErr, setBanErr] = useState("");
  const isToday = date === todayYmdTh();

  const callBan = async (init: RequestInit, url = "/api/admin/ban") => {
    if (banBusy) return;
    setBanBusy(true);
    setBanErr("");
    try {
      const r = await fetch(url, { cache: "no-store", ...init });
      if (r.status === 401 || r.status === 403) {
        onLocked();
        return;
      }
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setBanErr(d.error ?? "ทำรายการไม่สำเร็จ");
        return;
      }
      setBanOpen(false);
      setBanReason("");
      setReloadKey((k) => k + 1);
      onChanged?.();
    } catch {
      setBanErr("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    } finally {
      setBanBusy(false);
    }
  };
  const doBan = () =>
    callBan({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, reason: banReason.trim() }),
    });
  const doUnban = (banId: string) => {
    if (!window.confirm("ยืนยันปลดแบน? คะแนนและ point ของวันที่ถูกแบนจะกลับมา"))
      return;
    callBan(
      { method: "DELETE" },
      `/api/admin/ban?banId=${encodeURIComponent(banId)}`
    );
  };

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setData(null);
    setPreview(null);
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

  const shots = [
    {
      src: data?.snapshots.start ?? null,
      label: "ภาพแรกของวัน",
      empty: "ไม่มีภาพ",
    },
    {
      src: data?.snapshots.end ?? null,
      label: "ใกล้ถึงเป้าวันนี้",
      empty: "ยังไม่มีภาพ (ยอดยังไม่ถึง 90% ของเป้า)",
    },
  ];
  const available = shots.flatMap((s, i) => (s.src ? [i] : []));

  // ล็อกการเลื่อนหน้าด้านหลัง
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // คีย์บอร์ด: Esc ปิดภาพขยายก่อน แล้วค่อยปิดหน้าต่าง / ลูกศรสลับภาพ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (preview !== null) setPreview(null);
        else onClose();
        return;
      }
      if (preview === null || available.length < 2) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const pos = available.indexOf(preview);
        const dir = e.key === "ArrowRight" ? 1 : -1;
        setPreview(
          available[(pos + dir + available.length) % available.length]
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview, available]);

  const pct = data
    ? Math.min(100, (data.total / Math.max(1, data.goal)) * 100)
    : 0;
  const o = data?.user.org;
  const orgRows: [string, string][] = [];
  if (data?.user.employeeId)
    orgRows.push(["รหัสพนักงาน", data.user.employeeId]);
  if (o?.company) orgRows.push(["บริษัท", o.company]);
  if (o?.workplace) orgRows.push(["ที่ทำงาน", o.workplace]);
  if (o?.department) orgRows.push(["แผนก", o.department]);
  if (o?.branch) orgRows.push(["สาขา", o.branch]);
  if (o?.branchCode) orgRows.push(["รหัสสาขา", `ID ${o.branchCode}`]);
  if (o?.province)
    orgRows.push([
      "จังหวัด",
      o.region ? `${o.province} · ${o.region}` : o.province,
    ]);
  const cur = preview !== null ? shots[preview] : null;

  const step = (dir: 1 | -1) => {
    if (preview === null || available.length < 2) return;
    const pos = available.indexOf(preview);
    setPreview(available[(pos + dir + available.length) % available.length]);
  };

  // วาดผ่าน portal ไปที่ body เพื่อให้อยู่กลางจอจริง
  // ไม่ถูก transform / animation ของการ์ดหรือ layout แม่กระทบ (เคยทำให้หน้าต่างลอยชิดบน)
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ผลของผู้เล่นในวันนี้"
      className="fixed left-0 top-0 z-50 flex w-full items-end justify-center bg-[#1B2A21]/60 p-0 sm:items-center sm:p-5"
      style={{ height: "100dvh" }}
      onClick={onClose}
    >
      <div
        className={`pj-in relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-[#F3F6EC] text-[#1B2A21] shadow-2xl sm:rounded-[32px] lg:max-h-[94dvh] lg:max-w-6xl ${
          state === "ok" ? "lg:h-[88dvh]" : ""
        }`}
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {data?.user.username && (
                <span className="truncate text-[12px] text-[#6B7A6E] lg:text-[13px]">
                  @{data.user.username}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-[#6B7A6E] lg:text-[13px]">
              {fmtLong(date)}
            </div>
          </div>
          {state === "ok" && data && !data.ban && isToday && !banOpen && (
            <button
              onClick={() => setBanOpen(true)}
              className="flex h-10 shrink-0 items-center rounded-full bg-[#FDE8E6] px-4 text-[14px] font-semibold text-[#D92D20] transition-transform hover:bg-[#FBD5D1] active:scale-95"
            >
              แบน
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[18px] font-semibold transition-transform hover:bg-[#E8EEDD] active:scale-90"
          >
            ×
          </button>
        </div>

        {/* แถบแบน: อยู่ใต้หัวหน้าต่าง ไม่ทับข้อมูลผู้เล่น */}
        {state === "ok" && data && (data.ban || banOpen) && (
          <div className="mx-5 mb-3 shrink-0 rounded-2xl bg-white p-4 lg:mx-7">
            {data.ban ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full bg-[#FDE8E6] px-3 py-0.5 text-[12px] font-semibold text-[#D92D20]">
                      {data.ban.active ? "ถูกแบนอยู่" : "หมดแบนแล้ว"}
                    </span>
                    <span className="text-[12px] text-[#6B7A6E]">
                      หมด {fmtDateTime(data.ban.expiresAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 break-words text-[14px]">
                    เหตุผล: {data.ban.reason}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#6B7A6E]">
                    แบนเมื่อ {fmtDateTime(data.ban.bannedAt)} · คะแนนของ{" "}
                    {fmtLong(data.ban.day)} ไม่ถูกนับ
                  </p>
                  {banErr && (
                    <p role="alert" className="mt-1 text-[13px] text-[#D92D20]">
                      {banErr}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => doUnban(data.ban!.id)}
                  disabled={banBusy}
                  className="h-10 shrink-0 rounded-full bg-[#1B2A21] px-5 text-[14px] font-semibold text-[#C9F25B] transition-transform active:scale-95 disabled:opacity-50"
                >
                  ปลดแบน (กรณีตรวจผิด)
                </button>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-[#6B7A6E]">
                    เหตุผลที่แบน (แบน 24 ชั่วโมง)
                  </span>
                  <textarea
                    value={banReason}
                    onChange={(e) => {
                      setBanReason(e.target.value);
                      setBanErr("");
                    }}
                    maxLength={500}
                    rows={2}
                    className="w-full rounded-2xl bg-[#F3F6EC] p-3 text-[14px] outline-none ring-2 ring-transparent focus:ring-[#C9F25B]"
                  />
                </label>
                {banErr && (
                  <p role="alert" className="mt-2 text-[13px] text-[#D92D20]">
                    {banErr}
                  </p>
                )}
                <p className="mt-2 text-[12px] text-[#6B7A6E]">
                  เล่นไม่ได้ 24 ชม. คะแนนวันนี้ถูกตัด point ที่ได้วันนี้ถูกดึงคืนและให้คนถัดไปแทน
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setBanOpen(false);
                      setBanErr("");
                    }}
                    className="h-10 flex-1 rounded-full bg-[#EEF2E4] text-[14px] font-semibold sm:flex-none sm:px-6"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={doBan}
                    disabled={banBusy || banReason.trim().length < 3}
                    className="h-10 flex-1 rounded-full bg-[#D92D20] text-[14px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-40 sm:flex-none sm:px-6"
                  >
                    {banBusy ? "กำลังแบน" : "ยืนยันแบน"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:overflow-hidden lg:px-7 lg:pb-6">
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
            <div className="lg:grid lg:h-full lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5">
              {/* ซ้าย: สรุปยอด */}
              <div className="flex flex-col lg:min-h-0 lg:overflow-y-auto">
                <section className="shrink-0 rounded-3xl bg-[#1B2A21] px-5 py-6 text-center text-white lg:py-8">
                  <div className="text-[13px] text-white/60">ครั้งรวมวันนี้</div>
                  <div className="mt-1 flex items-baseline justify-center gap-2">
                    <span className="text-[64px] font-semibold leading-none tabular-nums tracking-tight lg:text-[72px]">
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

                <div className="mt-3 grid shrink-0 grid-cols-3 gap-3">
                  <StatBox label="รอบ">{fmtNum(data.rounds)}</StatBox>
                  <StatBox label="ถึงเป้า">
                    <span className="text-[18px] lg:text-[17px]">
                      {data.goalRank !== null ? `ลำดับ ${data.goalRank}` : "–"}
                    </span>
                  </StatBox>
                  <StatBox label="point">
                    <span
                      className={
                        data.points > 0 ? "text-[#3F5E1F]" : "text-[#A9B79A]"
                      }
                    >
                      {data.points > 0 ? `+${fmtNum(data.points)}` : "–"}
                    </span>
                  </StatBox>
                </div>

                {orgRows.length > 0 && (
                  <dl className="mt-3 shrink-0 divide-y divide-[#E3EAD6] overflow-hidden rounded-2xl bg-white text-[14px]">
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
                )}

                <p className="mt-3 hidden px-1 text-[12px] leading-relaxed text-[#6B7A6E] lg:block">
                  ภาพมาจากผู้ที่ล็อกอินและโดดหลังเปิดระบบเก็บภาพขึ้น Google Drive
                  ผู้เล่นที่ใช้งานก่อนหน้านั้นจะไม่มีภาพ · คลิกที่ภาพเพื่อขยาย
                  กด Esc เพื่อปิด
                </p>
              </div>

              {/* ขวา: ภาพยืนยัน */}
              <section className="mt-3 flex flex-col rounded-3xl bg-white p-4 lg:mt-0 lg:min-h-0 lg:p-5">
                <h3 className="shrink-0 text-[15px] font-semibold">
                  ภาพยืนยันการกระโดดวันนี้
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-1 lg:gap-5">
                  {shots.map((s, i) => (
                    <Shot
                      key={i}
                      src={s.src}
                      label={s.label}
                      empty={s.empty}
                      onOpen={() => setPreview(i)}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[12px] text-[#6B7A6E] lg:hidden">
                  ภาพมาจากผู้ที่ล็อกอินและโดดหลังเปิดระบบเก็บภาพขึ้น Google Drive
                  ผู้เล่นที่ใช้งานก่อนหน้านั้นจะไม่มีภาพ
                </p>
              </section>
            </div>
          )}
        </div>

        {/* ภาพขยายเต็มจอ */}
        {cur && cur.src && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={cur.label}
            className="pj-in fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 lg:p-10"
            onClick={(e) => {
              e.stopPropagation();
              setPreview(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cur.src}
              alt={cur.label}
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-xl object-contain"
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 lg:p-6">
              <div className="pointer-events-auto rounded-full bg-white/10 px-4 py-1.5 text-[14px] font-semibold text-white backdrop-blur">
                {cur.label}
                <span className="ml-2 text-white/60">
                  {data?.user.name} · {fmtLong(date)}
                </span>
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <a
                  href={cur.src}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-10 items-center rounded-full bg-white/10 px-4 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  เปิดในแท็บใหม่
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview(null);
                  }}
                  aria-label="ปิดภาพ"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[20px] text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  ×
                </button>
              </div>
            </div>

            {available.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                  aria-label="ภาพก่อนหน้า"
                  className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-[22px] text-white backdrop-blur transition-colors hover:bg-white/20 lg:left-6"
                >
                  ‹
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    step(1);
                  }}
                  aria-label="ภาพถัดไป"
                  className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-[22px] text-white backdrop-blur transition-colors hover:bg-white/20 lg:right-6"
                >
                  ›
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}