"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ICONS, Icon, POINT_QUOTA } from "./auth-shared";
import type { DeptEntry } from "./DepartmentRank";

/* ------------------------------------------------------------------ */
/* หน้าจอใหญ่ (/display): อันดับบุคคล ↔ อันดับแผนก สลับอัตโนมัติ           */
/* เวที 1920x1080 คงที่ แล้วย่อ/ขยายให้พอดีจอ (ตัวอักษรไม่เพี้ยนตามจอ)        */
/* ปรับเวลาผ่าน URL ได้: /display?p=20&d=15 (วินาที)                       */
/*   p = เวลาโชว์อันดับบุคคล / d = เวลาโชว์อันดับแผนกขั้นต่ำ                   */
/* กด F หรือดับเบิลคลิก = เต็มจอ                                            */
/* ------------------------------------------------------------------ */

const STAGE_W = 1920;
const STAGE_H = 1080;
const PAD = 32;
const HEADER_H = 96;
const BODY_GAP = 20;
const BODY_H = STAGE_H - PAD * 2 - HEADER_H - BODY_GAP; // 900
const PODIUM_W = 640;
const ROW_GAP = 8;
// การ์ด QR มุมล่างขวา: กันที่ท้ายคอลัมน์ขวา ไม่ให้ทับรายการอันดับ
const QR_H = 300;
const QR_GAP = 16;
const RIGHT_H = BODY_H - QR_H - QR_GAP; // พื้นที่รายการอันดับ 4+ ที่เหลือ

const PERSON_MS = 20000; // เวลาโชว์อันดับบุคคล
const DEPT_MIN_MS = 15000; // เวลาโชว์อันดับแผนกขั้นต่ำ (ถ้ารายการยาว จะอยู่จนเลื่อนจบรอบ)
const SCROLL_SPEED = 45; // px / วินาที
const SCROLL_PAUSE = 3000; // หยุดต้น/ท้ายรายการ (ms)
const PERSON_REFRESH = 30000;
const DEPT_REFRESH = 60000;

const LIME = "#C9F25B";
const CARD_SHADOW =
  "0 2px 0 rgba(27,42,33,.04), 0 10px 30px -12px rgba(27,42,33,.18)";

const fmtNum = (n: number) => n.toLocaleString("en-US");

// หน่วงเวลาแต่ละแถวให้ผุดขึ้นมาทีละแถวตามลำดับอันดับ (เริ่มหลังแถบสลับหน้าเปิดจอ)
const rowDelay = (i: number) =>
  `${(0.45 + Math.min(i * 0.07, 1.6)).toFixed(2)}s`;

// อ่านค่าเวลา (วินาที) จาก URL เรียกใน effect เท่านั้น (ใช้ window)
const secParam = (k: string, def: number) => {
  const v = Number(new URLSearchParams(window.location.search).get(k));
  return Number.isFinite(v) && v > 0 ? v * 1000 : def;
};

/* ------------------------------------------------------------------ */
/* ชนิดข้อมูล (ตรงกับ /api/leaderboard)                                   */
/* ------------------------------------------------------------------ */

type BoardEntry = {
  rank: number;
  name: string;
  avatarUrl?: string | null;
  company?: string | null;
  department?: string | null;
  total: number;
  rounds: number;
  me: boolean;
  goalRank: number | null;
  goal: number;
};

type Board = {
  entries: BoardEntry[];
  count: number;
  resetAt: number;
};

type View = "person" | "dept";

/* ------------------------------------------------------------------ */
/* โหลดข้อมูล                                                            */
/* ------------------------------------------------------------------ */

function usePersonBoard() {
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    let alive = true;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const r = await fetch("/api/leaderboard", { cache: "no-store" });
        if (!r.ok) throw new Error("load failed");
        const b = (await r.json()) as Board;
        if (!alive) return;
        setBoard(b);
        // ถึง 06:00 น. (เวลาไทย) โหลดใหม่ทันที ให้เป็นตารางของวันเกมใหม่
        clearTimeout(resetTimer);
        const ms = Math.min(
          Math.max(b.resetAt - Date.now(), 0) + 1000,
          2 ** 31 - 1
        );
        resetTimer = setTimeout(load, ms);
      } catch {
        // มีข้อมูลเดิมค้างอยู่ ไม่ต้องทำอะไร รอบถัดไปลองใหม่เอง
      }
    };

    load();
    const t = setInterval(load, PERSON_REFRESH);
    return () => {
      alive = false;
      clearInterval(t);
      clearTimeout(resetTimer);
    };
  }, []);

  return board;
}

type DeptPage = { entries: DeptEntry[]; totalPages: number };

async function getDeptPage(page: number): Promise<DeptPage> {
  const r = await fetch(`/api/leaderboard/departments?page=${page}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("load failed");
  return (await r.json()) as DeptPage;
}

// ดึงอันดับแผนก "ทุกหน้า" มารวมเป็นรายการเดียว (หน้าจอใหญ่เลื่อนอ่านต่อเนื่อง)
function useDeptRows() {
  const [rows, setRows] = useState<DeptEntry[] | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const first = await getDeptPage(1);
        const all = [...first.entries];
        for (let p = 2; p <= first.totalPages; p++) {
          const b = await getDeptPage(p);
          all.push(...b.entries);
        }
        if (!alive) return;
        const seen = new Set<string>();
        const uniq = all
          .filter((e) => {
            const k = e.key ?? String(e.id);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .sort((a, b) => a.rank - b.rank);
        setRows(uniq);
      } catch {
        // ใช้ข้อมูลเดิมต่อ
      }
    };

    load();
    const t = setInterval(load, DEPT_REFRESH);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return rows;
}

/* ------------------------------------------------------------------ */
/* ส่วนประกอบ UI                                                         */
/* ------------------------------------------------------------------ */

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

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

  useEffect(() => {
    setErr(false);
  }, [src]);

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
      className="flex shrink-0 items-center justify-center rounded-full bg-[#1B2A21] font-medium text-[#C9F25B]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initialOf(name)}
    </span>
  );
}

type Face = { name: string; src?: string | null };

// รูปซ้อนเหลื่อมกัน (บุคคล = 1 รูป / แผนก = สูงสุด 3 รูป)
function Faces({ faces, size }: { faces: Face[]; size: number }) {
  const shown = faces.slice(0, 3);
  const step = size * 0.5;
  return (
    <div className="flex items-center justify-center">
      {shown.map((f, i) => (
        <span
          key={i}
          className="relative rounded-full ring-4 ring-white"
          style={{ marginLeft: i === 0 ? 0 : step - size, zIndex: 10 - i }}
        >
          <Avatar name={f.name} src={f.src} size={size} />
        </span>
      ))}
    </div>
  );
}

function CheckBadge({ size = 24 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[#3F5E1F] text-[#C9F25B]"
      style={{ width: size, height: size }}
    >
      <Icon d={ICONS.check} size={Math.round(size * 0.62)} />
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex h-full items-center justify-center rounded-[40px] bg-white px-10 text-center text-[32px] font-medium text-[#6B7A6E]"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {text}
    </div>
  );
}

// นาฬิกา + วันที่ (เวลาไทย, ปี พ.ศ.) แยก component เพื่อให้ tick ทุกวินาที
// โดยไม่ทำให้ทั้งบอร์ดเรนเดอร์ใหม่
function Clock() {
  const [t, setT] = useState<Date | null>(null);

  useEffect(() => {
    setT(new Date());
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  if (!t) return null; // กัน hydration mismatch

  const time = t.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
  const date = t.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });

  return (
    <div className="text-right">
      <div className="text-[48px] font-semibold leading-none tabular-nums">
        {time}
      </div>
      <div className="mt-1 text-[20px] text-[#6B7A6E]">{date}</div>
    </div>
  );
}

// QR เข้าร่วมกิจกรรม (มุมล่างขวา) แสดงแต่รูป ไม่มีกรอบ ไม่มีข้อความ
function JoinQR() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/img/line.PNG"
      alt="QR code LINE"
      draggable={false}
      className="shrink-0 self-end object-contain object-right-bottom"
      style={{ height: QR_H, width: "auto", maxWidth: "100%" }}
    />
  );
}

// คอลัมน์ขวา: รายการอันดับ (สูง RIGHT_H) + การ์ด QR ท้ายคอลัมน์
function RightCol({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: QR_GAP }}>
      <div className="min-h-0" style={{ height: RIGHT_H }}>
        {children}
      </div>
      <JoinQR />
    </div>
  );
}

// พลุกระดาษ: ยิงจากจุด (originX, originY) เป็นสัดส่วนของเวที จางหายใน ~2.6 วิ
function Confetti({
  count = 140,
  originX = 0.5,
  originY = 0.5,
  colors = [LIME, "#8FB54A", "#3F5E1F", "#1B2A21", "#E8F5C1"],
}: {
  count?: number;
  originX?: number;
  originY?: number;
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

    const DURATION = 2800;
    const FADE = 800;

    const pieces = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const speed = 4 + Math.random() * 9;
      return {
        x: w * originX,
        y: h * originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        pw: 8 + Math.random() * 8,
        ph: 5 + Math.random() * 6,
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
        p.vy = p.vy * Math.pow(0.97, dt) + 0.2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
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

    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 200);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // ยิงครั้งเดียวตอนเมานต์ (สั่งยิงใหม่ด้วยการเปลี่ยน key จากข้างนอก)
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

/* ------------------------------------------------------------------ */
/* แท่นยืน 3 อันดับแรก (ใช้ร่วมกันทั้งบุคคลและแผนก)                          */
/* ------------------------------------------------------------------ */

type PodItem = {
  name: string;
  org?: string | null; // บรรทัดใต้ชื่อ
  faces: Face[];
  total: number;
  caption: string; // ข้อความใต้ตัวเลข
  stepText?: string | null; // ชื่อบริษัทในแท่น
  reached?: boolean;
};

const toPersonItem = (e: BoardEntry): PodItem => ({
  name: e.name,
  org: e.department,
  faces: [{ name: e.name, src: e.avatarUrl }],
  total: e.total,
  caption: `ครั้ง · ${e.rounds} รอบ`,
  stepText: e.company,
  reached: e.goalRank != null || e.total >= e.goal,
});

const toDeptItem = (e: DeptEntry): PodItem => ({
  name: e.name,
  faces: e.members.length
    ? e.members.map((m) => ({ name: m.name, src: m.avatarUrl }))
    : [{ name: e.name }],
  total: e.total,
  caption: `ครั้งสะสม · ${e.memberCount} คน`,
  stepText: e.company,
});

function Podium({
  items,
  mode,
}: {
  items: (PodItem | undefined)[];
  mode: View;
}) {
  const slots = [
    { place: 2 as const, e: items[1] },
    { place: 1 as const, e: items[0] },
    { place: 3 as const, e: items[2] },
  ];
  const look = {
    1: {
      step: 360,
      bg: "bg-[#C9F25B] text-[#1B2A21]",
      delay: ".35s",
      num: 68,
      name: 30,
    },
    2: {
      step: 280,
      bg: "bg-[#1B2A21] text-[#C9F25B]",
      delay: ".5s",
      num: 52,
      name: 26,
    },
    3: {
      step: 210,
      bg: "bg-[#3F5E1F] text-white",
      delay: ".65s",
      num: 52,
      name: 26,
    },
  } as const;
  const faceSize =
    mode === "person"
      ? ({ 1: 176, 2: 132, 3: 132 } as const)
      : ({ 1: 112, 2: 84, 3: 84 } as const);

  return (
    <section aria-label="3 อันดับแรก" className="h-full">
      <div
        className="flex h-full flex-col justify-end overflow-hidden rounded-[40px] bg-white px-6 pt-6"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <div className="flex items-end gap-3">
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
                    <span
                      className={`mb-2 flex h-[44px] items-center text-[#3F5E1F] ${
                        place === 1 ? "dp-float" : ""
                      }`}
                    >
                      {place === 1 && <Icon d={ICONS.trophy} size={44} />}
                    </span>
                    <Faces faces={e.faces} size={faceSize[place]} />
                    <div
                      className="mt-3 line-clamp-2 min-h-[2.4em] w-full break-words text-center font-medium leading-tight"
                      style={{ fontSize: L.name }}
                    >
                      {e.name}
                    </div>
                    <div className="h-[26px] w-full truncate text-center text-[18px] text-[#6B7A6E]">
                      {e.org ?? ""}
                    </div>
                    <div
                      className="mt-1 font-semibold leading-none tabular-nums"
                      style={{ fontSize: L.num }}
                    >
                      {fmtNum(e.total)}
                    </div>
                    <div className="mb-4 mt-2 text-[18px] text-[#6B7A6E]">
                      {e.caption}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="mb-2 h-[44px]" aria-hidden />
                    <span
                      className="flex items-center justify-center rounded-full bg-[#EEF2E4] text-[32px] font-medium text-[#A9B79A]"
                      style={{ width: faceSize[place], height: faceSize[place] }}
                      aria-hidden
                    >
                      —
                    </span>
                    <div className="mt-3 min-h-[2.4em] text-[22px] text-[#A9B79A]">
                      ว่าง
                    </div>
                    <div className="mb-3 mt-1 h-[84px]" aria-hidden />
                  </>
                )}
                <div
                  className={`dp-rise relative flex w-full flex-col items-center justify-start gap-2 overflow-hidden rounded-t-3xl px-2 pt-4 ${
                    e ? L.bg : "bg-[#EEF2E4] text-[#A9B79A]"
                  }`}
                  style={{ height: L.step, animationDelay: L.delay }}
                >
                  <span className="text-[76px] font-semibold leading-none tabular-nums">
                    {place}
                  </span>
                  {e?.stepText && (
                    <span className="line-clamp-2 w-full break-words text-center text-[26px] font-bold leading-tight">
                      {e.stepText}
                    </span>
                  )}
                  {e?.reached && (
                    <span
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/20"
                      aria-label="ถึงเป้าแล้ว"
                    >
                      <Icon d={ICONS.check} size={16} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าบุคคล: อันดับ 4 ขึ้นไปทุกคน จัดคอลัมน์ให้พอดีจอ ไม่เลื่อน                */
/* ------------------------------------------------------------------ */

// เลือกจำนวนคอลัมน์ให้แถวสูงพอ (ลองเกณฑ์สูงก่อน ไม่พอค่อยลด)
function personLayout(n: number) {
  const MAX = 92;
  if (n <= 0) return { cols: 1, rows: 1, h: MAX };
  // คนไม่เยอะ (<= 6) ใช้ 1 คอลัมน์ ที่เหลือเริ่มที่ 2 คอลัมน์ ไม่ให้แถวยาวโล่งเกินไป
  const startCols = n <= 6 ? 1 : 2;
  for (const min of [72, 60, 50, 44]) {
    for (let c = startCols; c <= 5; c++) {
      const rows = Math.ceil(n / c);
      const h = Math.floor((RIGHT_H - (rows - 1) * ROW_GAP) / rows);
      if (h >= min) return { cols: c, rows, h: Math.min(MAX, h) };
    }
  }
  const rows = Math.ceil(n / 5);
  const h = Math.floor((RIGHT_H - (rows - 1) * ROW_GAP) / rows);
  return { cols: 5, rows, h: Math.max(28, h) };
}

function PersonRow({
  e,
  h,
  cols,
  i,
}: {
  e: BoardEntry;
  h: number;
  cols: number;
  i: number;
}) {
  const av = Math.max(28, Math.min(68, h - 16));
  const fs = Math.max(15, Math.min(30, Math.round(h * 0.34)));
  // คอลัมน์แคบ (3+) ตัดบริษัท/แผนกและจำนวนรอบออก เหลือชื่อกับตัวเลขให้อ่านง่าย
  const roomy = h >= 56 && cols <= 2;
  const inQuota = e.goalRank != null && e.goalRank <= POINT_QUOTA;
  const org = [e.company, e.department].filter(Boolean).join(" · ");
  return (
    <li
      className={`dp-row flex min-w-0 items-center rounded-full bg-white ${
        cols >= 3 ? "gap-2 px-4" : "gap-3 px-5"
      }`}
      style={{
        height: h,
        boxShadow: CARD_SHADOW,
        animationDelay: rowDelay(i),
      }}
    >
      <span
        className="w-9 shrink-0 text-center font-medium tabular-nums text-[#6B7A6E]"
        style={{ fontSize: fs }}
      >
        {e.rank}
      </span>
      <Avatar name={e.name} src={e.avatarUrl} size={av} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate font-medium leading-tight"
            style={{ fontSize: fs }}
          >
            {e.name}
          </span>
          {inQuota && <CheckBadge size={Math.max(16, Math.round(fs * 0.85))} />}
        </div>
        {roomy && org && (
          <div
            className="truncate text-[#6B7A6E]"
            style={{ fontSize: Math.max(12, Math.round(fs * 0.55)) }}
          >
            {org}
          </div>
        )}
      </div>
      <div className="text-right">
        <div
          className="font-semibold leading-none tabular-nums"
          style={{ fontSize: fs + 4 }}
        >
          {fmtNum(e.total)}
        </div>
        {roomy && (
          <div className="mt-1 text-[13px] text-[#6B7A6E]">{e.rounds} รอบ</div>
        )}
      </div>
    </li>
  );
}

function PersonBody({ board }: { board: Board }) {
  const rest = board.entries.slice(3);
  const lay = useMemo(() => personLayout(rest.length), [rest.length]);

  if (board.entries.length === 0) {
    return (
      <div className="flex h-full flex-col" style={{ gap: QR_GAP }}>
        <div style={{ height: RIGHT_H }}>
          <Empty text="ยังไม่มีอันดับ ลงสนามเป็นคนแรกเลย" />
        </div>
        <JoinQR />
      </div>
    );
  }

  const top = board.entries.slice(0, 3).map(toPersonItem);

  return (
    <div
      className="grid h-full gap-8"
      style={{ gridTemplateColumns: `${PODIUM_W}px minmax(0,1fr)` }}
    >
      <Podium items={[top[0], top[1], top[2]]} mode="person" />
      <RightCol>
      {rest.length > 0 ? (
        <ul
          className="grid content-start"
          style={{
            gridAutoFlow: "column",
            gridTemplateRows: `repeat(${lay.rows}, ${lay.h}px)`,
            gridTemplateColumns: `repeat(${lay.cols}, minmax(0,1fr))`,
            gap: `${ROW_GAP}px 16px`,
          }}
        >
          {rest.map((e, i) => (
            <PersonRow key={e.rank} e={e} h={lay.h} cols={lay.cols} i={i} />
          ))}
        </ul>
      ) : (
        <Empty text="อันดับ 4 ขึ้นไปยังว่างอยู่ ชวนเพื่อนมาโดด" />
      )}
      </RightCol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าแผนก: แท่นยืนอยู่กับที่ รายการอันดับ 4 ขึ้นไปเลื่อนช้าๆ                  */
/* ------------------------------------------------------------------ */

function DeptRow({ e, i }: { e: DeptEntry; i: number }) {
  const shown = e.members.slice(0, 3);
  return (
    <div
      className="dp-row flex h-[80px] min-w-0 items-center gap-4 rounded-full bg-white px-6"
      style={{ boxShadow: CARD_SHADOW, animationDelay: rowDelay(i) }}
    >
      <span className="w-10 shrink-0 text-center text-[24px] font-medium tabular-nums text-[#6B7A6E]">
        {e.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[24px] font-medium leading-tight">
          {e.name}
        </div>
        {e.company && (
          <div className="truncate text-[16px] font-normal leading-tight text-[#3F5E1F]">
            {e.company}
          </div>
        )}
      </div>
      <div className="flex shrink-0 -space-x-4">
        {shown.map((m, i) => (
          <span
            key={`${m.username}-${i}`}
            className="rounded-full ring-2 ring-white"
          >
            <Avatar name={m.name} src={m.avatarUrl} size={40} />
          </span>
        ))}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[30px] font-semibold leading-none tabular-nums">
          {fmtNum(e.total)}
        </div>
        <div className="mt-1 text-[13px] text-[#6B7A6E]">
          ครั้งสะสม · {e.memberCount} คน
        </div>
      </div>
    </div>
  );
}

// เลื่อนรายการลงช้าๆ: หยุดต้น → เลื่อน → หยุดท้าย แล้วแจ้งว่าจบรอบ (onDone)
// ถ้ารายการสั้นจนไม่ต้องเลื่อน จะรอครบเวลาขั้นต่ำแล้วแจ้งจบรอบ
function DeptScroller({
  rows,
  onDone,
}: {
  rows: DeptEntry[];
  onDone: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const minMs = secParam("d", DEPT_MIN_MS);
    const startedAt = performance.now();
    let raf = 0;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    let off = 0;
    let phase: "pause1" | "scroll" | "pause2" | "done" = "pause1";
    let phaseStart = startedAt;
    let last = startedAt;

    const finish = () => {
      const wait = Math.max(0, minMs - (performance.now() - startedAt));
      doneTimer = setTimeout(() => doneRef.current(), wait);
    };

    const tick = (t: number) => {
      const dt = Math.max(0, Math.min(0.1, (t - last) / 1000));
      last = t;
      const max = Math.max(0, inner.offsetHeight - box.clientHeight);

      if (max <= 0) {
        phase = "done";
        finish();
        return;
      }
      if (phase === "pause1") {
        if (t - phaseStart >= SCROLL_PAUSE) phase = "scroll";
      } else if (phase === "scroll") {
        off = Math.min(max, off + SCROLL_SPEED * dt);
        inner.style.transform = `translateY(${-off}px)`;
        if (off >= max) {
          phase = "pause2";
          phaseStart = t;
        }
      } else if (phase === "pause2") {
        if (t - phaseStart >= SCROLL_PAUSE) {
          phase = "done";
          finish();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(doneTimer);
    };
  }, []);

  const fade =
    "linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)";

  return (
    <div
      ref={boxRef}
      className="h-full overflow-hidden"
      style={{ WebkitMaskImage: fade, maskImage: fade }}
    >
      <div
        ref={innerRef}
        className="grid grid-cols-2 gap-x-4 gap-y-2 py-5 will-change-transform"
      >
        {rows.map((e, i) => (
          <DeptRow key={e.key ?? e.id} e={e} i={i} />
        ))}
      </div>
    </div>
  );
}

function DeptBody({
  rows,
  onDone,
}: {
  rows: DeptEntry[];
  onDone: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col" style={{ gap: QR_GAP }}>
        <div style={{ height: RIGHT_H }}>
          <Empty text="ยังไม่มีแผนกหรือสาขาไหนทำคะแนน" />
        </div>
        <JoinQR />
      </div>
    );
  }
  const top = rows.slice(0, 3).map(toDeptItem);
  const rest = rows.slice(3);

  return (
    <div
      className="grid h-full gap-8"
      style={{ gridTemplateColumns: `${PODIUM_W}px minmax(0,1fr)` }}
    >
      <Podium items={[top[0], top[1], top[2]]} mode="dept" />
      <RightCol>
        {rest.length > 0 ? (
          <DeptScroller rows={rest} onDone={onDone} />
        ) : (
          <DeptEmptyRest onDone={onDone} />
        )}
      </RightCol>
    </div>
  );
}

// ไม่มีอันดับ 4 ขึ้นไป: แสดงข้อความ รอครบเวลาขั้นต่ำแล้วสลับหน้า
function DeptEmptyRest({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), secParam("d", DEPT_MIN_MS));
    return () => clearTimeout(t);
  }, []);
  return <Empty text="อันดับ 4 ขึ้นไปยังว่างอยู่" />;
}

/* ------------------------------------------------------------------ */
/* หน้าหลัก                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
@keyframes dp-in { from { opacity: 0; transform: translateY(28px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes dp-wipe { 0% { transform: translateX(-105%) skewX(-10deg); } 40% { transform: translateX(0) skewX(-10deg); } 60% { transform: translateX(0) skewX(-10deg); } 100% { transform: translateX(105%) skewX(-10deg); } }
@keyframes dp-logo { 0% { opacity: 0; transform: scale(.2); } 25% { opacity: 1; transform: scale(1.22); } 40% { transform: scale(.92); } 55% { transform: scale(1.06); } 68% { transform: scale(1); } 85% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.2); } }
@keyframes dp-wipe-text { 0% { opacity: 0; transform: translateY(40px); } 30% { opacity: 1; transform: none; } 85% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-20px); } }
@keyframes dp-row { from { opacity: 0; transform: translateY(70px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes dp-rise { from { transform: scaleY(.15); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes dp-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.dp-in { animation: dp-in 1.2s cubic-bezier(.22,1,.36,1) .2s both; }
.dp-wipe { animation: dp-wipe 2.1s cubic-bezier(.45,.05,.25,1) both; }
.dp-logo { animation: dp-logo 1.5s ease-in-out .63s both; }
.dp-wipe-text { animation: dp-wipe-text 1.3s ease-out 1s both; }
.dp-row { animation: dp-row .7s cubic-bezier(.22,1,.36,1) both; }
.dp-rise { transform-origin: bottom; animation: dp-rise .8s cubic-bezier(.22,1,.36,1) both; }
.dp-float { animation: dp-float 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .dp-in, .dp-rise, .dp-float, .dp-row { animation: none !important; }
  .dp-wipe, .dp-logo, .dp-wipe-text { display: none !important; }
}
`;

export default function DisplayBoard() {
  const person = usePersonBoard();
  const dept = useDeptRows();

  const [scale, setScale] = useState<number | null>(null);
  const [view, setView] = useState<View>("person");
  const [cycle, setCycle] = useState(0);
  // เปลี่ยนค่า = ยิงพลุใหม่ (เปลี่ยนหน้า หรือ อันดับ 1 เปลี่ยนคน)
  const [shot, setShot] = useState(1);
  // 0 = ยังไม่รู้เวลา (ตั้งค่าใน effect ฝั่งเบราว์เซอร์ ไม่เรียก Date.now() ตอน prerender)
  const [now, setNow] = useState(0);

  const hasDept = (dept?.length ?? 0) > 0;

  // เอฟเฟกต์สลับหน้า: แถบสีกวาดทับจอ (wipe) แล้วสลับเนื้อหาตอนแถบปิดจอพอดี
  const [wipe, setWipe] = useState(0);
  const [wipeTo, setWipeTo] = useState<View>("dept"); // หน้าที่กำลังจะไป (ใช้แสดงข้อความบนแถบ)
  const switching = useRef(false);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => () => clearTimeout(switchTimer.current), []);

  const goView = (v: View) => {
    if (switching.current) return;
    switching.current = true;
    setWipeTo(v);
    setWipe((w) => w + 1);
    switchTimer.current = setTimeout(() => {
      setView(v);
      setShot((s) => s + 1);
      switching.current = false;
    }, 1150);
  };

  // ย่อ/ขยายเวที 1920x1080 ให้พอดีจอ
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // นาฬิกาสำหรับนับถอยหลังรีเซ็ต
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // กันจอดับ
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
    };
    let lock: Sentinel | null = null;
    let dead = false;
    const acquire = async () => {
      try {
        if (!nav.wakeLock || dead) return;
        lock = await nav.wakeLock.request("screen");
      } catch {
        // เบราว์เซอร์ไม่รองรับ/ไม่อนุญาต ข้ามไป
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  // เต็มจอ: กด F หรือดับเบิลคลิก
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ใช้ e.code (ตำแหน่งปุ่มจริง) เพื่อให้ใช้ได้แม้คีย์บอร์ดตั้งเป็นภาษาไทย (ปุ่ม F = "ด")
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "KeyF" || e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // หน้าบุคคล → หน้าแผนก (หน้าแผนกเป็นฝ่ายแจ้งจบเองตอนเลื่อนครบ)
  useEffect(() => {
    if (view !== "person") return;
    const t = setTimeout(() => {
      if (hasDept) goView("dept");
      else setCycle((c) => c + 1);
    }, secParam("p", PERSON_MS));
    return () => clearTimeout(t);
    // goView สร้างใหม่ทุกเรนเดอร์ แต่ทำงานเหมือนเดิมเสมอ ไม่ต้องใส่ใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cycle, hasDept]);

  // อันดับ 1 เปลี่ยนคน → ยิงพลุ (เฉพาะตอนหน้านั้นกำลังแสดง)
  const leaderP = person?.entries[0]
    ? `${person.entries[0].name}|${person.entries[0].company}|${person.entries[0].department}`
    : null;
  const leaderD = dept?.[0] ? (dept[0].key ?? String(dept[0].id)) : null;
  const prevP = useRef<string | null>(null);
  const prevD = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevP.current;
    prevP.current = leaderP;
    if (prev && leaderP && prev !== leaderP && view === "person") {
      setShot((s) => s + 1);
    }
    // ดูเฉพาะตอนผู้นำเปลี่ยน ไม่ต้องรันซ้ำเมื่อ view เปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderP]);

  useEffect(() => {
    const prev = prevD.current;
    prevD.current = leaderD;
    if (prev && leaderD && prev !== leaderD && view === "dept") {
      setShot((s) => s + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderD]);

  const leftMs = Math.max(0, (person?.resetAt ?? 0) - now);
  const resetText = `${Math.floor(leftMs / 3600000)} ชม. ${Math.floor(
    (leftMs % 3600000) / 60000
  )} นาที`;

  const ready =
    view === "person"
      ? (person?.entries.length ?? 0) > 0
      : (dept?.length ?? 0) > 0;

  const title = view === "person" ? "อันดับวันนี้" : "อันดับแผนก";

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden text-[#1B2A21]"
      style={{
        cursor: "none",
        backgroundColor: "#F3F6EC", // สีสำรองตอนรูปยังโหลดไม่เสร็จ
        backgroundImage: "url(/img/bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
      onDoubleClick={toggleFullscreen}
    >
      <style>{CSS}</style>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale ?? 1})`,
          visibility: scale === null ? "hidden" : "visible",
          padding: PAD,
        }}
      >
        {/* หัวหน้า: โลโก้ + ชื่อหน้า (ซ้าย) / นาฬิกา + แท็บ (ขวา) */}
        <header
          className="flex items-end justify-between"
          style={{ height: HEADER_H }}
        >
          <div className="flex min-w-0 items-end gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/logo.png"
              alt="logo"
              className="h-[88px] w-auto shrink-0 object-contain"
            />
            <div className="min-w-0">
              <div className="flex h-[30px] items-center gap-6 text-[20px] text-[#6B7A6E]">
                {view === "person" ? (
                  person ? (
                    <>
                      {now > 0 && <span>รีเซ็ตใน {resetText}</span>}
                      <span>{person.count} คนลงสนาม</span>
                      <span className="inline-flex items-center gap-2">
                        <CheckBadge size={22} />
                        ทัน {POINT_QUOTA} คนแรกที่ถึงเป้าหมายรายวัน
                      </span>
                    </>
                  ) : null
                ) : (
                  <>
                    <span>คะแนนสะสมไม่รีเซ็ต</span>
                    {dept && <span>{dept.length} กลุ่มลงสนาม</span>}
                  </>
                )}
              </div>
              <h1 className="text-[56px] font-semibold leading-[1.1] tracking-tight">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-end gap-10">
            <Clock />
            <div className="mb-2 flex items-center gap-3">
              {(["person", "dept"] as const).map((v) => (
                <span
                  key={v}
                  className={`rounded-full px-7 py-2 text-[24px] font-medium transition-colors duration-500 ${
                    view === v
                      ? "bg-[#1B2A21] text-[#C9F25B]"
                      : "bg-[#E3EAD6] text-[#6B7A6E]"
                  }`}
                >
                  {v === "person" ? "บุคคล" : "แผนก"}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* เนื้อหา */}
        <main style={{ height: BODY_H, marginTop: BODY_GAP }}>
          <div key={view} className="dp-in h-full">
            {view === "person" ? (
              person ? (
                <PersonBody board={person} />
              ) : (
                <Empty text="กำลังโหลดอันดับ…" />
              )
            ) : dept ? (
              <DeptBody rows={dept} onDone={() => goView("person")} />
            ) : (
              <Empty text="กำลังโหลดอันดับ…" />
            )}
          </div>
        </main>

        {/* พลุกระดาษ: ยิงจากกลางแท่นยืน (ซ้ายมือ) ขึ้นไปทั่วเวที */}
        {ready && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20"
          >
            <Confetti
              key={shot}
              count={140}
              originX={(PAD + PODIUM_W / 2) / STAGE_W}
              originY={0.45}
            />
          </div>
        )}
      </div>

      {/* แถบกวาดตอนสลับหน้า บุคคล ↔ แผนก (คลุมทั้งจอ) */}
      {wipe > 0 && (
        <div
          key={wipe}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        >
          {/* แถบเขียวเข้มนำหน้า (เอียงเป็นเฉียง กว้างเกินจอ ขอบไม่เห็นมุมขาด) */}
          <div
            className="dp-wipe absolute top-0 h-full"
            style={{ left: "-15%", width: "130%", background: "#1B2A21" }}
          />
          {/* แถบเขียวมะนาวตามมา วางโลโก้ใหญ่กลางจอ (หมุนสวนกลับให้โลโก้ตรง) */}
          <div
            className="dp-wipe absolute top-0 h-full overflow-hidden"
            style={{
              left: "-15%",
              width: "130%",
              background: LIME,
              animationDelay: ".2s",
            }}
          >
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-[2vh]"
              style={{ transform: "skewX(10deg)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/logo.png"
                alt=""
                draggable={false}
                className="dp-logo h-auto max-h-[50vh] w-[55vw] max-w-[55vw] object-contain"
              />
              <div className="dp-wipe-text text-[4.6vw] font-semibold leading-none text-[#1B2A21]">
                {wipeTo === "dept" ? "อันดับแผนก" : "อันดับบุคคล"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}