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
// เวลาเล่นแอนิเมชันปิด modal (ms) ต้องตรงกับ dr-sheet-down / dr-bg-out ด้านล่าง
const CLOSE_MS = 260;

export type Member = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  isMe?: boolean;
  // จำนวนครั้งของคนนี้ (ถ้าส่งมา จะแสดงใต้ชื่อในหน้าต่างสมาชิก ฝั่งแอดมินใช้)
  total?: number;
};

// 1 แถว = 1 กลุ่ม (แผนกของสำนักงานใหญ่ หรือ 1 สาขาของหน้าร้าน)
// key = รหัสไม่ซ้ำข้ามประเภท เช่น "d:3" / "b:3" (id แผนกกับ id สาขาอาจซ้ำกันได้)
// ถ้า API ยังไม่ส่ง key มา จะใช้ id เดิม
export type DeptEntry = {
  rank: number;
  id: number;
  key?: string;
  kind?: "dept" | "branch";
  name: string;
  en: string;
  // ชื่อบริษัทของกลุ่มนั้น (API ต้องส่งมา ถ้าไม่มีจะไม่แสดง)
  company?: string | null;
  // ข้อความรองใต้ตัวเลขหลัก เช่น "320 ครั้ง" (ฝั่งแอดมินใช้ หน้าผู้ใช้ไม่ส่ง)
  sub?: string;
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
  // สะสมไม่รีเซ็ต (API ส่ง null)
  resetAt?: number | null;
};

const gid = (e: DeptEntry) => e.key ?? String(e.id);

// เก็บอันดับแผนกล่าสุดไว้ในหน่วยความจำ: สลับกลับมาหน้านี้แล้วเห็นทันที (แล้วค่อยรีเฟรชเงียบๆ)
let cachedBoard: DeptBoard | null = null;

async function fetchDeptBoard(): Promise<DeptBoard> {
  const r = await fetch("/api/leaderboard/departments", {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("load failed");
  const b = (await r.json()) as DeptBoard;
  cachedBoard = b;
  return b;
}

// โหลดล่วงหน้า (เรียกจากหน้าอันดับบุคคล) ให้กดสลับมาแผนกแล้วมีข้อมูลทันที
export function prefetchDeptBoard() {
  fetchDeptBoard().catch(() => {});
}

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

// จอตั้งแต่ sm (640px) ขึ้นไป = รูปบนแท่นใหญ่ขึ้น (ตรงกับ breakpoint ของหน้าอันดับบุคคล)
function useIsLg() {
  const [lg, setLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
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
// ขนาดแท่น/ตัวอักษร/ระยะห่าง ใช้ชุดเดียวกับแท่นยืนของอันดับบุคคล (Rank.tsx) ให้หน้าตาเหมือนกัน
// มือถือ: คอลัมน์แคบ ชื่อตัดได้ 2 บรรทัด
// unit = หน่วยของตัวเลข (หน้าผู้ใช้ = "ครั้ง", แอดมินเปลี่ยนเป็น "ไลค์" / "point" ได้)
function DeptPodium({
  entries,
  onOpen,
  unit,
}: {
  entries: DeptEntry[];
  onOpen: (key: string) => void;
  unit: string;
}) {
  const lg = useIsLg();
  const slots: { place: 1 | 2 | 3; e?: DeptEntry }[] = [
    { place: 2, e: entries[1] },
    { place: 1, e: entries[0] },
    { place: 3, e: entries[2] },
  ];
  // co = สไตล์ชื่อบริษัทในแท่น (ตัวหนา) อันดับ 1 ใหญ่สุดและเลื่อนลงมาจากเลขอันดับ
  // ขนาดจำกัดตามความสูงแท่น ไม่ให้ล้น (อันดับ 3 มือถือแท่นเตี้ยสุด แสดง 1 บรรทัด)
  const look = {
    1: {
      h: "h-32",
      step: "bg-[#C9F25B] text-[#1B2A21]",
      delay: "0s",
      co: "mt-3 line-clamp-2 text-[14px] leading-[17px]",
    },
    2: {
      h: "h-24",
      step: "bg-[#1B2A21] text-[#C9F25B]",
      delay: ".12s",
      co: "line-clamp-2 text-[13px] leading-[15px]",
    },
    3: {
      h: "h-[72px]",
      step: "bg-[#3F5E1F] text-white",
      delay: ".24s",
      co: "line-clamp-1 text-[12px] leading-[14px]",
    },
  } as const;

  return (
    <section aria-label="3 อันดับแรก แผนก/สาขา" className="relative">
      <div className="overflow-hidden rounded-3xl bg-white px-2 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-end gap-1.5 sm:gap-4">
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
                      <div className="mt-2 line-clamp-2 min-h-[2.5em] w-full break-words text-center text-[12px] font-semibold leading-tight sm:text-[14px]">
                        {e.name}
                      </div>
                      {e.me && (
                        <span className="mt-1 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[10px] font-semibold text-[#C9F25B] sm:text-[11px]">
                          ของคุณ
                        </span>
                      )}
                      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums">
                        {fmtNum(e.total)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#6B7A6E]">
                        {unit} · {e.memberCount} คน
                      </div>
                      {e.sub && (
                        <div className="text-[11px] font-semibold text-[#3F5E1F]">
                          {e.sub}
                        </div>
                      )}
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
                  className={`pj-rise flex w-full flex-col items-center justify-start overflow-hidden rounded-t-2xl px-1.5 pt-3 ${L.h} ${
                    e ? L.step : "bg-[#EEF2E4] text-[#A9B79A]"
                  }`}
                  style={{ animationDelay: L.delay }}
                >
                  <span className="text-[32px] font-bold leading-none tabular-nums">
                    {place}
                  </span>
                  {e?.company && (
                    <span
                      className={`mt-1 w-full break-words text-center font-bold ${L.co}`}
                    >
                      {e.company}
                    </span>
                  )}
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

// ส่วนแสดงอันดับแผนก/สาขา (แท่นยืน + รายการ + หน้าต่างสมาชิก)
// ใช้ร่วมกันทั้งหน้าผู้ใช้ และหน้าแอดมิน (แอดมินส่ง entries ที่รวมเองตามช่วงเวลา/ตัวกรอง)
// unit = หน่วยของ entries[].total / cumulative = true แสดงว่า "สะสม"
export function DeptBoardView({
  entries,
  unit = "ครั้ง",
  cumulative = true,
  emptyText = "ยังไม่มีแผนกหรือสาขาไหนทำคะแนน ชวนเพื่อนมาโดดเลย",
}: {
  entries: DeptEntry[];
  unit?: string;
  cumulative?: boolean;
  emptyText?: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // closing = กำลังเล่นแอนิเมชันปิด (modal ยังอยู่บนจอ แต่กำลังเลื่อนลง)
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lg = useIsLg();

  const openModal = useCallback((key: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setClosing(false);
    setOpenKey(key);
  }, []);

  const closeModal = useCallback(() => {
    if (closeTimer.current) return; // กำลังปิดอยู่แล้ว
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpenKey(null);
      setClosing(false);
    }, CLOSE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (openKey == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey, closeModal]);

  if (entries.length === 0) {
    return (
      <p className="rounded-3xl bg-white px-4 py-6 text-center text-[14px] text-[#6B7A6E]">
        {emptyText}
      </p>
    );
  }

  const rest = entries.slice(3);
  const opened = entries.find((e) => gid(e) === openKey) ?? null;
  const totalLabel = cumulative && unit === "ครั้ง" ? "ครั้งสะสม" : unit;

  return (
    <>
      <DeptPodium entries={entries.slice(0, 3)} onOpen={openModal} unit={unit} />
      {rest.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rest.map((e) => (
            <li key={gid(e)}>
              <button
                type="button"
                onClick={() => openModal(gid(e))}
                aria-haspopup="dialog"
                className={`pj-lift flex w-full items-center gap-3 rounded-full px-5 py-2.5 text-left transition-transform active:scale-[0.99] sm:px-6 ${
                  e.me ? "bg-[#E8F5C1]" : "bg-white"
                }`}
              >
                {/* อันดับ 4 ขึ้นไป: เลขเฉยๆ ไม่มีวงกลม (เหมือนอันดับบุคคล) */}
                <span className="w-6 shrink-0 text-center text-[14px] font-semibold tabular-nums text-[#6B7A6E]">
                  {e.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[16px] font-semibold">
                      {e.name}
                    </span>
                    {e.me && (
                      <span className="shrink-0 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                        ของคุณ
                      </span>
                    )}
                  </div>
                  {e.company && (
                    <div className="truncate text-[12px] font-bold text-[#3F5E1F]">
                      {e.company}
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <AvatarStack
                      members={e.members}
                      total={e.memberCount}
                      size={24}
                      max={3}
                      ringClass={e.me ? "ring-[#E8F5C1]" : "ring-white"}
                    />
                    <span className="text-[11px] text-[#6B7A6E]">
                      {e.memberCount} คน
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-semibold tabular-nums">
                    {fmtNum(e.total)}
                  </div>
                  <div className="text-[11px] text-[#6B7A6E]">{unit}</div>
                  {e.sub && (
                    <div className="text-[11px] font-semibold text-[#3F5E1F]">
                      {e.sub}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {opened &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`สมาชิก ${opened.name}`}
            className="dr-anim fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/70 p-0 sm:items-center sm:p-5"
            style={{
              animation: closing
                ? `dr-bg-out ${CLOSE_MS}ms ease-in both`
                : "dr-bg-in .3s ease-out both",
            }}
            onClick={closeModal}
          >
            <style>{`
              @keyframes dr-drop {
                0% { transform: translateY(-60px) scale(.8,1.15); opacity: 0; }
                55% { transform: translateY(0) scale(1.12,.88); opacity: 1; }
                75% { transform: translateY(-8px) scale(.97,1.04); }
                100% { transform: translateY(0) scale(1); opacity: 1; }
              }
              @keyframes dr-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
              @keyframes dr-sheet-up {
                from { transform: translateY(100%); opacity: .6; }
                to { transform: translateY(0); opacity: 1; }
              }
              @keyframes dr-sheet-down {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(100%); opacity: .6; }
              }
              @keyframes dr-bg-in { from { opacity: 0; } to { opacity: 1; } }
              @keyframes dr-bg-out { from { opacity: 1; } to { opacity: 0; } }
              @media (prefers-reduced-motion: reduce) {
                .dr-anim { animation: none !important; opacity: 1 !important; }
              }
            `}</style>

            <div
              className="dr-anim relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] text-[#1B2A21] shadow-2xl sm:max-w-4xl sm:rounded-[32px]"
              style={{
                animation: closing
                  ? `dr-sheet-down ${CLOSE_MS}ms cubic-bezier(.4,0,1,1) both`
                  : "dr-sheet-up .38s cubic-bezier(.22,1,.36,1) both",
              }}
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

              <div className="relative flex items-start justify-between gap-3 px-5 pb-2 pt-5 sm:px-6">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#3F5E1F]">
                    อันดับ {opened.rank} ·{" "}
                    {opened.kind === "branch" ? "เพื่อนร่วมสาขา" : "เพื่อนร่วมแผนก"}
                  </div>
                  <h3 className="break-words text-[26px] font-bold leading-tight tracking-tight">
                    {opened.name}
                  </h3>
                  {opened.company && (
                    <div className="mt-0.5 break-words text-[15px] font-bold text-[#3F5E1F]">
                      {opened.company}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="ปิด"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform active:scale-90"
                >
                  <Icon d={ICONS.close} size={18} />
                </button>
              </div>

              <div className="relative flex flex-wrap gap-2 px-5 pb-3 sm:px-6">
                <span className="inline-flex rounded-full bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-[#3F5E1F]">
                  {opened.memberCount} คน
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A21] px-3.5 py-1.5 text-[13px] font-semibold text-[#C9F25B]">
                  <Icon d={ICONS.bolt} size={14} />
                  <span className="tabular-nums">{fmtNum(opened.total)}</span>{" "}
                  {totalLabel}
                </span>
              </div>

              <ul className="relative grid grid-cols-3 gap-x-2 gap-y-5 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-4 sm:px-6 lg:grid-cols-6">
                {opened.members.map((mb, i) => {
                  // ดีเลย์สูงสุด 12 คนแรก ที่เหลือโผล่พร้อมกัน ไม่ให้รอนาน
                  // +0.2 = รอให้ sheet เลื่อนขึ้นมาเกือบถึงก่อน ค่อยเด้งรูป
                  const delay = 0.2 + Math.min(i, 12) * 0.06;
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
                          <Avatar
                            name={mb.name}
                            src={mb.avatarUrl}
                            size={lg ? 96 : 76}
                          />
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
                      {mb.total !== undefined && (
                        <span
                          className="dr-anim text-[11px] font-semibold tabular-nums"
                          style={{ animation: `dr-fade .4s ease-out ${delay + 0.4}s both` }}
                        >
                          {fmtNum(mb.total)} ครั้ง
                        </span>
                      )}
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
    </>
  );
}

export default function DepartmentRank({
  hasDepartment,
}: {
  // true = ผู้ใช้มีแผนก หรือ สาขา อย่างใดอย่างหนึ่ง
  hasDepartment: boolean;
}) {
  const [board, setBoard] = useState<DeptBoard | null>(cachedBoard);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      setBoard(await fetchDeptBoard());
      setErr(false);
    } catch {
      // มีข้อมูลเดิมแสดงอยู่แล้ว ไม่ต้องสลับเป็นหน้า error
      setErr(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!board && !err) {
    // โครงเปล่าขนาดใกล้เคียงของจริง (แท่นยืน + 3 แถว) กันหน้ากระโดดตอนข้อมูลมา
    return (
      <div
        className="w-full lg:max-w-[40rem]"
        role="status"
        aria-label="กำลังโหลดอันดับ"
      >
        <div className="h-[260px] animate-pulse rounded-3xl bg-white" />
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-full bg-white"
            />
          ))}
        </div>
      </div>
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

  return (
    // หัวข้อ "ตารางอันดับ" + ตัวสลับ บุคคล/แผนก อยู่ใน Rank.tsx แล้ว (บรรทัดเดียวกับหน้าบุคคล)
    // ความกว้างเท่าคอลัมน์ตารางของหน้าบุคคล ชิดซ้าย / pj-in = เฟดเข้าเบาๆ ตอนสลับมาหน้านี้
    <div className="pj-in w-full lg:max-w-[40rem]">
      <DeptBoardView entries={board.entries} />
      <div className="mt-3 space-y-1 px-1 text-[12px] text-[#6B7A6E]">
        <p>
          คะแนนสะสมไม่รีเซ็ต · {board.count} กลุ่มลงสนาม
          {!hasDepartment && " · บัญชีนี้ยังไม่ได้เลือกแผนกหรือสาขา"}
        </p>
        <p>
          คะแนน = ผลรวมครั้งกระโดดของทุกคนในกลุ่ม (สำนักงานใหญ่นับเป็นแผนก หน้าร้านนับ 1 สาขาเป็น 1 กลุ่ม) นับสะสมตั้งแต่เริ่มและไม่รีเซ็ต แสดง 20 อันดับแรก กดที่กลุ่มเพื่อดูสมาชิก
        </p>
      </div>
    </div>
  );
}