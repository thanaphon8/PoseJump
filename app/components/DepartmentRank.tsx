"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ICONS, Icon } from "./auth-shared";

const fmtNum = (n: number) => n.toLocaleString("en-US");
const STACK_MAX = 5;

type Member = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  isMe?: boolean;
};

// 1 แถว = 1 กลุ่ม (แผนกของสำนักงานใหญ่ หรือ 1 สาขาของหน้าร้าน)
// key = รหัสไม่ซ้ำข้ามประเภท เช่น "d:3" / "b:3" (id แผนกกับ id สาขาอาจซ้ำกันได้)
// ถ้า API ยังไม่ส่ง key มา จะใช้ id เดิม
type DeptEntry = {
  rank: number;
  id: number;
  key?: string;
  kind?: "dept" | "branch";
  name: string;
  en: string;
  total: number;
  active: number;
  me: boolean;
  memberCount: number;
  members: Member[];
};

type DeptBoard = {
  entries: DeptEntry[];
  me: { rank: number; total: number; gap: number } | null;
  count: number;
  resetAt: number;
};

const gid = (e: DeptEntry) => e.key ?? String(e.id);

const badge = (rank: number) =>
  rank === 1
    ? "bg-[#C9F25B] text-[#1B2A21]"
    : rank === 2
      ? "bg-[#1B2A21] text-[#C9F25B]"
      : rank === 3
        ? "bg-[#3F5E1F] text-white"
        : "bg-[#EEF2E4] text-[#6B7A6E]";

function Avatar({
  name,
  src,
  size,
}: {
  name: string;
  src?: string | null;
  size: number;
}) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setErr(true)}
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

// รูปโปรไฟล์ซ้อนเหลื่อมกัน (เหมือนการ์ดแผนกในหน้าหลัก)
function AvatarStack({
  members,
  total,
  size = 32,
  max = STACK_MAX,
  ringClass = "ring-white",
}: {
  members: Member[];
  total: number;
  size?: number;
  max?: number;
  ringClass?: string;
}) {
  const shown = members.slice(0, max);
  const more = total - shown.length;
  return (
    <div className="flex -space-x-2.5">
      {shown.map((m) => (
        <span key={m.username} className={`rounded-full ring-2 ${ringClass}`}>
          <Avatar name={m.name} src={m.avatarUrl} size={size} />
        </span>
      ))}
      {more > 0 && (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[11px] font-semibold text-[#1B2A21] ring-2 ${ringClass}`}
          style={{ width: size, height: size }}
        >
          +{more}
        </span>
      )}
    </div>
  );
}

function useIsLg() {
  const [lg, setLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setLg(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return lg;
}

// รูป 3 คนซ้อนเหลื่อมกัน
function PodiumStack({ members, size }: { members: Member[]; size: number }) {
  const shown = members.slice(0, 3);
  const step = size * 0.55;
  return (
    <div className="flex items-center justify-center">
      {shown.map((m, i) => (
        <span
          key={m.username}
          className="relative rounded-full ring-2 ring-white"
          style={{ marginLeft: i === 0 ? 0 : step - size, zIndex: 10 - i }}
        >
          <Avatar name={m.name} src={m.avatarUrl} size={size} />
        </span>
      ))}
    </div>
  );
}

const LIME = "#C9F25B";

// พลุกระดาษมินิมอล (แบบเดียวกับอันดับบุคคล): ยิงจากกลางแท่น สีตามธีม จางหายใน ~2.6 วิ
// ไม่ยิงถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว
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
      ctx.globalAlpha =
        el > DURATION - FADE ? Math.max(0, (DURATION - el) / FADE) : 1;

      for (const p of pieces) {
        p.vx *= Math.pow(0.97, dt);
        p.vy = p.vy * Math.pow(0.97, dt) + 0.14 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // พลิกแกนให้ดูเป็นกระดาษที่ร่วงหมุน
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

    // หน่วงเล็กน้อยให้ตัวเลขเด้งขึ้นก่อน
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 180);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // ยิงครั้งเดียวตอนเมานต์ ไม่ยิงซ้ำเมื่อ colors (array ใหม่ทุกเรนเดอร์) เปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

// แท่นยืน 3 กลุ่มแรก (แผนก/สาขา): เรียงซ้าย→ขวา = อันดับ 2, 1, 3 (เหมือนอันดับบุคคล)
// มือถือ: คอลัมน์แคบ ชื่อตัดได้ 2 บรรทัด / คอม: แท่นสูงขึ้น ตัวอักษรใหญ่ขึ้น
function DeptPodium({
  entries,
  onOpen,
}: {
  entries: DeptEntry[];
  onOpen: (key: string) => void;
}) {
  const lg = useIsLg();
  const slots: { place: 1 | 2 | 3; e?: DeptEntry }[] = [
    { place: 2, e: entries[1] },
    { place: 1, e: entries[0] },
    { place: 3, e: entries[2] },
  ];
  const look = {
    1: { h: "h-28 lg:h-40", step: "bg-[#C9F25B] text-[#1B2A21]", delay: "0s" },
    2: { h: "h-20 lg:h-28", step: "bg-[#1B2A21] text-[#C9F25B]", delay: ".12s" },
    3: { h: "h-14 lg:h-20", step: "bg-[#3F5E1F] text-white", delay: ".24s" },
  } as const;

  return (
    <section aria-label="3 อันดับแรก แผนก/สาขา" className="relative">
      <div className="overflow-hidden rounded-3xl bg-white px-2 pt-5 sm:px-4 lg:px-8 lg:pt-8">
        <div className="flex items-end gap-1.5 sm:gap-3 lg:gap-5">
          {slots.map(({ place, e }) => {
            const L = look[place];
            return (
              <div
                key={place}
                className={`flex min-w-0 flex-col items-center ${
                  place === 1 ? "flex-[1.3]" : "flex-1"
                }`}
              >
                {e ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpen(gid(e))}
                      aria-label={`ดูสมาชิก ${e.name}`}
                      className="flex w-full min-w-0 flex-col items-center rounded-2xl px-1 pb-2 transition-transform active:scale-95"
                    >
                      {place === 1 ? (
                        <span className="pj-float mb-1 text-[#3F5E1F]">
                          <Icon d={ICONS.trophy} size={26} />
                        </span>
                      ) : (
                        <span className="mb-1 h-[26px]" aria-hidden />
                      )}
                      <PodiumStack
                        members={e.members}
                        size={place === 1 ? (lg ? 84 : 58) : lg ? 64 : 44}
                      />
                      <div className="mt-2 line-clamp-2 min-h-[2.5em] w-full break-words text-center text-[12px] font-semibold leading-tight lg:text-[15px]">
                        {e.name}
                      </div>
                      {e.me && (
                        <span className="mt-1 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[10px] font-semibold text-[#C9F25B] lg:text-[11px]">
                          ของคุณ
                        </span>
                      )}
                      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums lg:text-[28px]">
                        {fmtNum(e.total)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#6B7A6E]">
                        ครั้ง · {e.memberCount} คน
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="mb-1 h-[26px]" aria-hidden />
                    <span
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EEF2E4] font-semibold text-[#A9B79A]"
                      aria-hidden
                    >
                      —
                    </span>
                    <div className="mt-2 min-h-[2.5em] text-[13px] text-[#A9B79A]">
                      ว่าง
                    </div>
                    <div className="mb-2 mt-1 text-[11px] text-transparent">
                      -
                    </div>
                  </>
                )}
                <div
                  className={`pj-rise flex w-full flex-col items-center justify-start rounded-t-2xl pt-3 ${L.h} ${
                    e ? L.step : "bg-[#EEF2E4] text-[#A9B79A]"
                  }`}
                  style={{ animationDelay: L.delay }}
                >
                  <span className="text-[32px] font-bold leading-none tabular-nums lg:text-[40px]">
                    {place}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* พลุกระดาษ: ยิงครั้งเดียวตอนเข้าหน้า (แท่นยืนเมานต์ใหม่ทุกครั้งที่เปิดแท็บ)
          ยื่นพ้นกรอบการ์ดขึ้นไปด้านบน เหมือนอันดับบุคคล */}
      {entries[0] && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 bottom-0 z-10"
        >
          <Confetti
            count={90}
            colors={[LIME, "#8FB54A", "#3F5E1F", "#1B2A21", "#E8F5C1"]}
          />
        </div>
      )}
    </section>
  );
}

export default function DepartmentRank({
  hasDepartment,
}: {
  // true = ผู้ใช้มีแผนก หรือ สาขา อย่างใดอย่างหนึ่ง
  hasDepartment: boolean;
}) {
  const [board, setBoard] = useState<DeptBoard | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/leaderboard/departments", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("load failed");
      setBoard((await r.json()) as DeptBoard);
      setErr(false);
    } catch {
      setErr(true);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (openKey == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  const leftMs = Math.max(0, (board?.resetAt ?? 0) - now);
  const d = Math.floor(leftMs / 86400000);
  const h = Math.floor((leftMs % 86400000) / 3600000);
  const m = Math.floor((leftMs % 3600000) / 60000);
  const resetText = `${d} วัน ${h} ชม. ${m} นาที`;

  if (!board && !err) {
    return (
      <p className="rounded-3xl bg-white px-4 py-6 text-center text-[14px] text-[#6B7A6E]">
        กำลังโหลดอันดับ
      </p>
    );
  }
  if (!board) {
    return (
      <div className="rounded-3xl bg-white px-4 py-6 text-center">
        <p className="text-[14px] text-[#D92D20]">โหลดอันดับไม่สำเร็จ</p>
        <button
          onClick={load}
          className="mt-3 h-10 rounded-full bg-[#C9F25B] px-6 text-[14px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const max = Math.max(1, board.entries[0]?.total ?? 1);
  const rest = board.entries.slice(3);
  const opened = board.entries.find((e) => gid(e) === openKey) ?? null;

  return (
    <div className="mx-auto w-full space-y-4 lg:max-w-3xl">
      <p className="px-1 text-[13px] text-[#6B7A6E]">
        รีเซ็ตคะแนนใน {resetText} (ทุกวันจันทร์ 00:00 น.) · {board.count} กลุ่มลงสนาม
        {!hasDepartment && " · บัญชีนี้ยังไม่ได้เลือกแผนกหรือสาขา"}
      </p>

      <section>
        <h2 className="mb-2 px-1 text-[16px] font-semibold">
          ตารางอันดับแผนก / สาขา
        </h2>
        {board.entries.length === 0 ? (
          <p className="rounded-3xl bg-white px-4 py-6 text-center text-[14px] text-[#6B7A6E]">
            ยังไม่มีแผนกหรือสาขาไหนทำคะแนน ชวนเพื่อนมาโดดเลย
          </p>
        ) : (
          <>
            <DeptPodium
              entries={board.entries.slice(0, 3)}
              onOpen={setOpenKey}
            />
            {rest.length > 0 && (
              <ul className="mt-3 space-y-2">
                {rest.map((e) => (
                  <li key={gid(e)}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(gid(e))}
                      aria-haspopup="dialog"
                      className={`pj-lift flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left transition-transform active:scale-[0.99] ${
                        e.me ? "bg-[#E8F5C1]" : "bg-white"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${badge(
                          e.rank
                        )}`}
                      >
                        {e.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold">
                            {e.name}
                          </span>
                          {e.me && (
                            <span className="shrink-0 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                              ของคุณ
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <AvatarStack
                            members={e.members}
                            total={e.memberCount}
                            size={28}
                            ringClass={e.me ? "ring-[#E8F5C1]" : "ring-white"}
                          />
                          <span className="text-[11px] text-[#6B7A6E]">
                            {e.memberCount} คน
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF2E4]">
                          <div
                            className="h-full rounded-full bg-[#3F5E1F] transition-[width] duration-500"
                            style={{ width: `${(e.total / max) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[18px] font-semibold tabular-nums">
                          {fmtNum(e.total)}
                        </div>
                        <div className="text-[11px] text-[#6B7A6E]">ครั้ง</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
          คะแนน = ผลรวมครั้งกระโดดของทุกคนในกลุ่ม (สำนักงานใหญ่นับเป็นแผนก หน้าร้านนับ 1 สาขาเป็น 1 กลุ่ม) นับเฉพาะสัปดาห์นี้ (จันทร์–อาทิตย์ เวลาไทย) แสดง 20 อันดับแรก กดที่กลุ่มเพื่อดูสมาชิก
        </p>
      </section>

      {opened &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`สมาชิก ${opened.name}`}
            className="pj-in fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/70 p-0 sm:items-center sm:p-5"
            onClick={() => setOpenKey(null)}
          >
            <style>{`
              @keyframes dr-drop {
                0% { transform: translateY(-60px) scale(.8,1.15); opacity: 0; }
                55% { transform: translateY(0) scale(1.12,.88); opacity: 1; }
                75% { transform: translateY(-8px) scale(.97,1.04); }
                100% { transform: translateY(0) scale(1); opacity: 1; }
              }
              @keyframes dr-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
              @media (prefers-reduced-motion: reduce) {
                .dr-anim { animation: none !important; opacity: 1 !important; }
              }
            `}</style>

            <div
              className="relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] text-[#1B2A21] shadow-2xl sm:rounded-[32px]"
              onClick={(ev) => ev.stopPropagation()}
            >
              {/* ลายตกแต่งพื้นหลัง เหมือนหน้า welcome */}
              <span
                aria-hidden
                className="pointer-events-none absolute -left-16 top-10 h-48 w-48 rounded-full bg-white/40 blur-2xl"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 bottom-10 h-56 w-56 rounded-full bg-[#C9F25B]/50 blur-2xl"
              />

              <div className="relative flex items-start justify-between gap-3 px-5 pb-2 pt-5">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#3F5E1F]">
                    อันดับ {opened.rank} ·{" "}
                    {opened.kind === "branch" ? "เพื่อนร่วมสาขา" : "เพื่อนร่วมแผนก"}
                  </div>
                  <h3 className="break-words text-[26px] font-bold leading-tight tracking-tight">
                    {opened.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenKey(null)}
                  aria-label="ปิด"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform active:scale-90"
                >
                  <Icon d={ICONS.close} size={18} />
                </button>
              </div>

              <div className="relative flex flex-wrap gap-2 px-5 pb-3">
                <span className="inline-flex rounded-full bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-[#3F5E1F]">
                  {opened.memberCount} คน
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A21] px-3.5 py-1.5 text-[13px] font-semibold text-[#C9F25B]">
                  <Icon d={ICONS.bolt} size={14} />
                  <span className="tabular-nums">{fmtNum(opened.total)}</span> ครั้งสัปดาห์นี้
                </span>
              </div>

              <ul className="relative grid grid-cols-3 gap-x-2 gap-y-5 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-4">
                {opened.members.map((mb, i) => {
                  // ดีเลย์สูงสุด 12 คนแรก ที่เหลือโผล่พร้อมกัน ไม่ให้รอนาน
                  const delay = Math.min(i, 12) * 0.06;
                  return (
                    <li
                      key={mb.username}
                      className="flex min-w-0 flex-col items-center text-center"
                    >
                      <span
                        className="dr-anim block"
                        style={{ animation: `dr-drop .7s ease-out ${delay}s both` }}
                      >
                        <span
                          className={`relative block rounded-full shadow-lg ring-[3px] ${
                            mb.isMe ? "ring-[#1B2A21]" : "ring-white"
                          }`}
                        >
                          <Avatar name={mb.name} src={mb.avatarUrl} size={64} />
                          {mb.isMe && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1B2A21] px-2 py-0.5 text-[10px] font-bold text-[#C9F25B]">
                              คุณ
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className="dr-anim mt-2.5 w-full truncate px-1 text-[13px] font-semibold"
                        style={{ animation: `dr-fade .4s ease-out ${delay + 0.35}s both` }}
                      >
                        {mb.name}
                      </span>
                      <span
                        className="dr-anim w-full truncate px-1 text-[11px] text-[#3F5E1F]/80"
                        style={{ animation: `dr-fade .4s ease-out ${delay + 0.4}s both` }}
                      >
                        @{mb.username}
                      </span>
                    </li>
                  );
                })}
                {opened.memberCount > opened.members.length && (
                  <li className="col-span-full py-2 text-center text-[12px] font-semibold text-[#3F5E1F]">
                    แสดง {opened.members.length} จาก {opened.memberCount} คน
                  </li>
                )}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}