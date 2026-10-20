"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ICONS, Icon, POINT_QUOTA, POINT_REWARD } from "./auth-shared";

/* ------------------------------------------------------------------ */
/* ค่าคงที่และชนิดข้อมูล (ซ้ำกับ app/page.tsx เพราะไฟล์ page.tsx export ได้แค่ default) */
/* ------------------------------------------------------------------ */

// สี
const LIME = "#C9F25B";

const fmtNum = (n: number) => n.toLocaleString("en-US");

// อันดับวันนี้ (มาจาก /api/leaderboard)
type BoardEntry = {
  rank: number;
  name: string;
  // รูปโปรไฟล์ที่ผู้ใช้ตั้งไว้ (ถ้าไม่มีจะแสดงตัวอักษรแรกของชื่อ)
  avatarUrl?: string | null;
  total: number;
  rounds: number;
  me: boolean;
  // ลำดับที่ทำเป้าหมายรายวันสำเร็จ (1 = คนแรก) null = ยังไม่ถึงเป้า
  goalRank: number | null;
  // เป้าหมายรายวันของคนนั้น ใช้วาดหลอดความคืบหน้า
  goal: number;
};

type Board = {
  entries: BoardEntry[];
  me: { rank: number; total: number; gap: number; points: number } | null;
  count: number;
  resetAt: number;
};

type RankProps = {
  // ใช้โหลดอันดับใหม่เมื่อเปลี่ยนบัญชี
  username: string | null;
  // แตะปุ่มเริ่มกระโดด
  onStart: () => void;
  // เปิดหน้าสรุป "ผลวันนี้"
  onOpenResult: () => void;
  // วันนี้มีรอบที่โดดไว้ไหม ถ้าไม่มีปุ่มผลวันนี้จะกดไม่ได้
  hasToday: boolean;
  // ซิงก์ point ล่าสุดของตัวเองกลับไปที่ user ใน app/page.tsx
  onPoints: (points: number) => void;
};

/* ------------------------------------------------------------------ */
/* ส่วนประกอบ UI                                                         */
/* ------------------------------------------------------------------ */

const card = "rounded-3xl bg-white pj-lift";
const limeBtn =
  "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348]";

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

function Avatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (src && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="shrink-0 rounded-full object-cover bg-[#1B2A21]"
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

// ป้าย point รวมของบัญชี
function PointBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3F5E1F]">
      <Icon d={ICONS.star} size={12} fill />
      {fmtNum(points)} point
    </span>
  );
}

// แท็กบอกว่าแต่ละคนทัน 100 คนแรกที่ทำเป้าหมายรายวันสำเร็จหรือไม่
function GoalTag({ goalRank }: { goalRank: number | null }) {
  if (goalRank === null) {
    return (
      <span className="shrink-0 rounded-full border border-[#C5CFB5] px-2 py-0.5 text-[11px] font-semibold text-[#6B7A6E]">
        ยังไม่ถึงเป้า
      </span>
    );
  }
  // ลำดับ 101 ขึ้นไป ไม่แสดงแท็ก
  if (goalRank > POINT_QUOTA) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#3F5E1F] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
      <Icon d={ICONS.check} size={11} />
      ทัน {POINT_QUOTA} คนแรก · +{POINT_REWARD}
    </span>
  );
}

// พลุกระดาษมินิมอล: ยิงจากกลางการ์ดตัวเลข สีตามธีม จางหายใน ~2.6 วิ
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
      ctx.globalAlpha = el > DURATION - FADE ? Math.max(0, (DURATION - el) / FADE) : 1;

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

// แท่นยืน 3 อันดับแรก: เรียงซ้าย→ขวา = อันดับ 2, 1, 3 แท่นสูงตามอันดับ
function Podium({ entries }: { entries: BoardEntry[] }) {
  const slots: { place: 1 | 2 | 3; e?: BoardEntry }[] = [
    { place: 2, e: entries[1] },
    { place: 1, e: entries[0] },
    { place: 3, e: entries[2] },
  ];
  const look = {
    1: { h: 128, step: "bg-[#C9F25B] text-[#1B2A21]", av: 84, delay: "0s" },
    2: { h: 96, step: "bg-[#1B2A21] text-[#C9F25B]", av: 68, delay: ".12s" },
    3: { h: 72, step: "bg-[#3F5E1F] text-white", av: 68, delay: ".24s" },
  } as const;

  return (
    <section aria-label="3 อันดับแรก" className="relative">
      <div className="overflow-hidden rounded-3xl bg-white px-3 pt-5">
      <div className="flex items-end gap-2">
        {slots.map(({ place, e }) => {
          const L = look[place];
          const reached = !!e && (e.goalRank != null || e.total >= e.goal);
          return (
            <div
              key={place}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              {e ? (
                <>
                  {place === 1 && (
                    <span className="pj-float mb-1 text-[#3F5E1F]">
                      <Icon d={ICONS.trophy} size={26} />
                    </span>
                  )}
                  <span
                    className={`rounded-full ${
                      e.me ? "ring-2 ring-[#3F5E1F] ring-offset-2" : ""
                    }`}
                  >
                    <Avatar name={e.name} src={e.avatarUrl} size={L.av} />
                  </span>
                  <div className="mt-2 w-full truncate text-center text-[14px] font-semibold">
                    {e.name}
                  </div>
                  {e.me && (
                    <span className="mt-0.5 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                      คุณ
                    </span>
                  )}
                  <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums">
                    {fmtNum(e.total)}
                  </div>
                  <div className="mb-2 mt-1 text-[11px] text-[#6B7A6E]">
                    ครั้ง · {e.rounds} รอบ
                  </div>
                </>
              ) : (
                <>
                  <span
                    className="flex items-center justify-center rounded-full bg-[#EEF2E4] font-semibold text-[#A9B79A]"
                    style={{ width: L.av, height: L.av }}
                    aria-hidden
                  >
                    —
                  </span>
                  <div className="mt-2 text-[14px] text-[#A9B79A]">ว่าง</div>
                  <div className="mb-2 mt-1 text-[11px] text-transparent">
                    -
                  </div>
                </>
              )}
              <div
                className={`pj-rise flex w-full flex-col items-center justify-start gap-1 rounded-t-2xl pt-3 ${
                  e ? L.step : "bg-[#EEF2E4] text-[#A9B79A]"
                }`}
                style={{ height: L.h, animationDelay: L.delay }}
              >
                <span className="text-[32px] font-bold leading-none tabular-nums">
                  {place}
                </span>
                {reached && (
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20"
                    aria-label="ถึงเป้าแล้ว"
                  >
                    <Icon d={ICONS.check} size={12} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* พลุกระดาษให้อันดับ 1: ยิงครั้งเดียวตอนเข้าหน้า (แท่นยืนเมานต์ใหม่ทุกครั้งที่เปิดแท็บ)
          ใช้สีเขียวเข้มกับมะนาวให้เห็นชัดบนพื้นขาว และยื่นพ้นกรอบการ์ดขึ้นไปด้านบน */}
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

// แบนเนอร์ชวนโดด: ยังไม่ถึงเป้า = ชวนรับ point / ถึงเป้าแล้ว = ยินดีกับคะแนนที่ทำได้
function PromoBanner({
  status,
  total = 0,
}: {
  status: "open" | "done";
  total?: number;
}) {
  const done = status === "done";
  return (
    <section
      className={`relative overflow-hidden rounded-3xl p-5 ${
        done ? "bg-[#3F5E1F] text-white" : "bg-[#C9F25B] text-[#1B2A21]"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
            done ? "bg-[#C9F25B] text-[#1B2A21]" : "bg-[#1B2A21] text-[#C9F25B]"
          }`}
        >
          <Icon d={done ? ICONS.trophy : ICONS.star} size={28} fill={!done} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-bold leading-snug">
            {done
              ? `เยี่ยมมาก! วันนี้โดดไป ${fmtNum(total)} ครั้ง ผ่านเป้าแล้ว`
              : `${POINT_QUOTA} คนแรกที่โดดถึงเป้า รับ ${POINT_REWARD} point!`}
          </div>
          <p
            className={`mt-1 text-[13px] leading-5 ${
              done ? "text-white/80" : "text-[#3F5E1F]"
            }`}
          >
            {done
              ? "เป้าหมายวันนี้สำเร็จ โดดต่อเพื่อไต่อันดับและทำสถิติใหม่ได้เลย"
              : "ทำเป้าหมายรายวันให้สำเร็จก่อนคนอื่น เซ็ตทุกเที่ยงคืนเวลาไทย"}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าวันนี้ (อันดับ)                                                    */
/* ------------------------------------------------------------------ */

function RankView(props: RankProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [boardErr, setBoardErr] = useState(false);
  const [boardNow, setBoardNow] = useState(0);

  // ให้ loadBoard อ่าน callback ล่าสุดได้โดยไม่ต้องสร้างฟังก์ชันใหม่
  const P = useRef(props);
  useEffect(() => {
    P.current = props;
  });

  // อันดับวันนี้: โหลดตอนเปิดแท็บ และรีเฟรชทุก 30 วินาที
  const loadBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!r.ok) throw new Error("load failed");
      const b = (await r.json()) as Board;
      setBoard(b);
      setBoardErr(false);
      // ซิงก์ point ล่าสุดของตัวเองเข้า user (เช่น ได้ point จากอุปกรณ์อื่น)
      const pts = b.me?.points;
      if (typeof pts === "number") P.current.onPoints(pts);
    } catch {
      setBoardErr(true);
    }
    setBoardNow(Date.now());
  }, []);

  useEffect(() => {
    loadBoard();
    const t = setInterval(loadBoard, 30000);
    return () => clearInterval(t);
  }, [loadBoard, props.username]);

  const leader = board?.entries[0];
  const leftMs = Math.max(0, (board?.resetAt ?? 0) - boardNow);
  const resetText = `${Math.floor(leftMs / 3600000)} ชม. ${Math.floor(
    (leftMs % 3600000) / 60000
  )} นาที`;
  const rankBadge = (rank: number) =>
    rank === 1
      ? "bg-[#C9F25B] text-[#1B2A21]"
      : rank === 2
        ? "bg-[#1B2A21] text-[#C9F25B]"
        : rank === 3
          ? "bg-[#3F5E1F] text-white"
          : "text-[#6B7A6E]";

  // แถวอันดับ 4 ขึ้นไป (3 อันดับแรกอยู่บนแท่นยืน)
  const boardRow = (e: BoardEntry) => {
    // ถึงเป้า = เซิร์ฟเวอร์บันทึกว่าถึงเป้าแล้ว หรือยอดรวมทุกรอบของวันถึงเป้าของคนนั้น
    const reached = e.goalRank != null || e.total >= e.goal;
    const pct = reached
      ? 100
      : Math.min(100, (e.total / Math.max(1, e.goal)) * 100);
    return (
      <li
        key={e.rank}
        className={`flex items-center gap-3 rounded-3xl px-4 py-3 ${
          e.me ? "bg-[#E8F5C1]" : "bg-white"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${rankBadge(
            e.rank
          )}`}
        >
          {e.rank}
        </span>
        <Avatar name={e.name} src={e.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold">
              {e.name}
            </span>
            {e.me && (
              <span className="shrink-0 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                คุณ
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <GoalTag goalRank={e.goalRank ?? null} />
            {e.goalRank != null && (
              <span className="text-[11px] text-[#6B7A6E]">
                ถึงเป้าลำดับที่ {e.goalRank}
              </span>
            )}
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EEF2E4]"
            role="progressbar"
            aria-label="ความคืบหน้าสู่เป้าหมายรายวัน"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                background: reached ? "#3F5E1F" : "#A9B79A",
              }}
            />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-semibold tabular-nums">
            {fmtNum(e.total)}
          </div>
          <div className="text-[11px] text-[#6B7A6E]">{e.rounds} รอบ</div>
        </div>
      </li>
    );
  };

  return (
    <>
      <header className="mb-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="min-h-[18px] text-[13px] text-[#6B7A6E]">
            {board ? `รีเซ็ตใน ${resetText}` : ""}
          </p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[36px]">
            อันดับวันนี้
          </h1>
        </div>
        <button
          onClick={props.onOpenResult}
          disabled={!props.hasToday}
          className="mb-1 flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#C9F25B] px-5 text-[15px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-95 active:bg-[#B8E348] disabled:opacity-40"
        >
          <Icon d={ICONS.trophy} size={18} />
          ผลวันนี้
        </button>
      </header>


      {!board && !boardErr && (
        <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
          กำลังโหลดอันดับ
        </p>
      )}

      {!board && boardErr && (
        <div className={`${card} px-4 py-6 text-center`}>
          <p className="text-[14px] text-[#D92D20]">
            โหลดอันดับไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่
          </p>
          <button
            onClick={loadBoard}
            className="mt-3 h-10 rounded-full bg-[#C9F25B] px-6 text-[14px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {board && (
        <div className="space-y-4">
          <section>
            <h2 className="mb-2 px-1 text-[16px] font-semibold">ตารางอันดับ</h2>
            {board.entries.length === 0 ? (
              <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
                ยังไม่มีอันดับ
              </p>
            ) : (
              <>
                <Podium entries={board.entries.slice(0, 3)} />
                {board.entries.length > 3 && (
                  <ul className="mt-3 space-y-2">
                    {board.entries.slice(3).map(boardRow)}
                  </ul>
                )}
              </>
            )}
            <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
              {POINT_QUOTA} คนแรกที่ทำเป้าหมายรายวันสำเร็จ ได้ {POINT_REWARD} point อันดับ {POINT_QUOTA + 1} ขึ้นไปไม่ได้รับ นับจากรอบที่ผู้ใช้ล็อกอินบันทึกไว้ รีเซ็ตทุกเที่ยงคืนเวลาไทย
            </p>
          </section>
          <div className="pj-stagger space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
            <section className="rounded-3xl bg-[#1B2A21] p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-semibold">
                  เจ้าของอันดับ 1 วันนี้
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-[#C9F25B]">
                  {board.count} คนลงสนาม
                </span>
              </div>
              {leader ? (
                <div className="mt-4 flex items-center gap-4">
                  <span className="pj-float flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                    <Icon d={ICONS.trophy} size={32} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[24px] font-semibold">
                      {leader.name}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-[40px] font-semibold leading-none tabular-nums tracking-tight text-[#C9F25B]">
                        {fmtNum(leader.total)}
                      </span>
                      <span className="text-[14px] text-white/60">ครั้ง</span>
                    </div>
                    <p className="mt-1.5 text-[13px] text-white/70">
                      {leader.me
                        ? "คุณนำอยู่ รักษาตำแหน่งนี้ไว้ให้ได้"
                        : `ใครจะแซง ${leader.name} ได้ ลงสนามเลย`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-[16px] text-white/80">
                  ยังไม่มีใครขึ้นแท่น ลงสนามแล้วชิงอันดับ 1 เป็นคนแรก
                </p>
              )}
            </section>

            <section className="rounded-3xl bg-[#E8F5C1] p-5">
              <h2 className="text-[16px] font-semibold">อันดับของคุณ</h2>
              {board.me ? (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[56px] font-semibold leading-none tabular-nums tracking-tight">
                      #{board.me.rank}
                    </div>
                    <div className="mt-2 text-[14px] text-[#4B5E3A]">
                      {fmtNum(board.me.total)} ครั้งวันนี้
                    </div>
                    <div className="mt-1">
                      <PointBadge points={board.me.points} />
                    </div>
                  </div>
                  <div className="max-w-[160px] text-right text-[13px] font-medium text-[#3F5E1F]">
                    {board.me.rank === 1
                      ? "คุณนำอยู่!"
                      : `อีก ${fmtNum(board.me.gap)} ครั้งจะแซงอันดับ ${board.me.rank - 1}`}
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-[14px] text-[#4B5E3A]">
                    วันนี้คุณยังไม่ได้กระโดด โดดเลยเพื่อติดอันดับ
                  </p>
                  <button onClick={props.onStart} className={`${limeBtn} mt-4`}>
                    <Icon d={ICONS.play} size={20} fill />
                    เริ่มกระโดด
                  </button>
                </>
              )}
            </section>
          </div>

          <div>
          {(() => {
            const mine = board.entries.find((e) => e.me);
            const reached =
              !!mine && (mine.goalRank != null || mine.total >= mine.goal);
            return (
              <div className="mb-4">
                <PromoBanner
                  status={reached ? "done" : "open"}
                  total={mine?.total ?? 0}
                />
              </div>
            );
          })()}
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* ทางออกของไฟล์                                                        */
/* ------------------------------------------------------------------ */

// ไฟล์ชื่อ page.tsx ใน app/ ถูก Next.js มองเป็นเส้นทาง (/components/rank) และ export ได้แค่ default
// จึงมีตัวห่อที่ไม่ทำอะไรถ้าถูกเปิดตรงๆ (ไม่มี props) กันบิลด์พัง
// ถ้าย้ายไฟล์นี้ไปชื่ออื่น (เช่น RankView.tsx) ลบตัวห่อนี้ได้
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RankPage(props: any) {
  if (!props || typeof props.onStart !== "function") return null;
  return <RankView {...(props as RankProps)} />;
}

export default RankPage;