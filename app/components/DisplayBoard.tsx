"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ICONS, Icon, POINT_QUOTA } from "./auth-shared";
import type { DeptEntry } from "./DepartmentRank";
import Jumper from "./Jumper";
import {
  Face as MoodFace,
  NoteBox,
  NoteStyles,
  styleOf,
  type Note,
} from "./NoteShared";

/* ------------------------------------------------------------------ */
/* หน้าจอใหญ่ (/display): อันดับบุคคล ↔ อันดับแผนก สลับอัตโนมัติ           */
/* รองรับจอแนวนอน (1920x1080) และแนวตั้ง (1080x1920) เลือกอัตโนมัติ        */
/* ย่อ/ขยายเวทีให้พอดีจอ (ตัวอักษรไม่เพี้ยนตามจอ)                            */
/*                                                                      */
/* ปรับผ่าน URL:                                                         */
/*   /display?p=20&d=15   p = เวลาโชว์บุคคล / d = เวลาโชว์แผนกขั้นต่ำ (วินาที) */
/*   /display?rotate=90   จอวางตั้ง แต่เครื่องเล่นส่งภาพแนวนอน → หมุนภาพให้    */
/*                        (ใช้ 90 หรือ 270 ตามทิศที่จอหมุน)                   */
/* กด F หรือดับเบิลคลิก = เต็มจอ / กดอีกครั้ง = กลับมาปกติ                     */
/* ------------------------------------------------------------------ */

const PAD = 32;
const BODY_GAP = 20;
const ROW_GAP = 8;

// แนวนอน: แท่นยืนซ้าย / รายการ + QR ขวา
const PODIUM_W = 640;
const QR_H = 300; // แถวล่างขวา (card สถิติ + QR) กันที่ท้ายคอลัมน์ขวา ไม่ให้ทับรายการอันดับ
const QR_GAP = 16;

// แนวตั้ง: แท่นยืนบน / รายการกลาง / QR ล่างขวา
const PODIUM_H_P = 640; // = 1/3 ของความสูงจอแนวตั้ง (1920)
const PODIUM_MAX_W_P = 820; // ความกว้างสูงสุดของกรอบแท่นยืนแนวตั้ง (จอกว้าง 1016 ใช้พื้นที่) วางกึ่งกลาง
const PORTRAIT_GAP = 24;
const QR_H_P = 220;

const PERSON_MS = 20000; // เวลาโชว์อันดับบุคคล
const DEPT_MIN_MS = 15000; // เวลาโชว์อันดับแผนกขั้นต่ำ (ถ้ารายการยาว จะอยู่จนเลื่อนจบรอบ)
const SCROLL_SPEED = 45; // px / วินาที
const SCROLL_PAUSE = 3000; // หยุดต้น/ท้ายรายการ (ms)
const PERSON_REFRESH = 30000;
const DEPT_REFRESH = 60000;
const CURSOR_HIDE_MS = 10000; // เมาส์ไม่ขยับกี่ ms แล้วซ่อนเคอร์เซอร์

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

// กรองโน๊ตหมดอายุซ้ำฝั่ง client (หน้าจอเปิดค้างข้ามรอบรีเซ็ต)
const activeNote = (n?: Note | null): Note | null =>
  n && Date.parse(n.expiresAt) > Date.now() ? n : null;

// ขนาดเวทีตามแนวจอ
type Dims = {
  w: number;
  h: number;
  portrait: boolean;
  headerH: number;
  bodyH: number;
  qrH: number;
  listH: number; // ความสูงพื้นที่รายการอันดับ 4 ขึ้นไป
};

const dimsOf = (portrait: boolean): Dims => {
  const w = portrait ? 1080 : 1920;
  const h = portrait ? 1920 : 1080;
  const headerH = portrait ? 128 : 96;
  const bodyH = h - PAD * 2 - headerH - BODY_GAP;
  const qrH = portrait ? QR_H_P : QR_H;
  const listH = portrait
    ? bodyH - PODIUM_H_P - PORTRAIT_GAP - qrH - QR_GAP
    : bodyH - qrH - QR_GAP;
  return { w, h, portrait, headerH, bodyH, qrH, listH };
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
  // โน๊ตบนแท่นยืน (มีเฉพาะอันดับ 1-3 ที่เขียนไว้และยังไม่หมดอายุ)
  note?: Note | null;
};

type Board = {
  entries: BoardEntry[];
  count: number;
  resetAt: number;
  // ผู้ลงทะเบียนทั้งหมด / จำนวนคนที่ทำเป้าวันนี้สำเร็จแล้ว (รีเซ็ต 06:00)
  registered?: number;
  goalHits?: number;
};

// ตัวเลขใน card สถิติมุมล่างขวา
type Stats = {
  quotaLeft: number; // สิทธิ์รับ Point ที่เหลือ (0 = เต็มแล้ว ซ่อนส่วนนี้)
  registered: number; // ผู้ลงทะเบียนทั้งหมด
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
        // ข้อมูลไม่เปลี่ยน = ไม่เรนเดอร์ใหม่ (ลดอาการกระตุกทุก 30 วิ)
        setBoard((prev) =>
          prev && JSON.stringify(prev) === JSON.stringify(b) ? prev : b
        );
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
        // ข้อมูลไม่เปลี่ยน = ไม่เรนเดอร์ใหม่ (ไม่ให้รายการที่กำลังเลื่อนถูกสร้างใหม่)
        setRows((prev) =>
          prev && JSON.stringify(prev) === JSON.stringify(uniq) ? prev : uniq
        );
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
// โดยไม่ทำให้ทั้งบอร์ดเรนเดอร์ใหม่ (compact = ตัวเล็กลงสำหรับแนวตั้ง)
function Clock({ compact = false }: { compact?: boolean }) {
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
      <div
        className={`font-semibold leading-none tabular-nums ${
          compact ? "text-[40px]" : "text-[48px]"
        }`}
      >
        {time}
      </div>
      <div
        className={`mt-1 text-[#6B7A6E] ${compact ? "text-[16px]" : "text-[20px]"}`}
      >
        {date}
      </div>
    </div>
  );
}

// เหรียญ point ตกแต่งในการ์ด (x,y = % ของการ์ด / s = ขนาดอ้างอิงแนวนอน / o = ความทึบ / r = องศาหมุน / b = เบลอ px)
const COINS = [
  { x: -7, y: -14, s: 120, o: 0.14, r: -18, b: 2 },
  { x: 58, y: -16, s: 70, o: 0.95, r: 14, b: 0 },
  { x: 84, y: 8, s: 110, o: 0.16, r: 24, b: 2 },
  { x: -4, y: 62, s: 84, o: 0.95, r: -10, b: 0 },
  { x: 30, y: 78, s: 56, o: 0.2, r: 30, b: 1 },
  { x: 74, y: 66, s: 96, o: 0.95, r: 8, b: 0 },
  { x: 46, y: 40, s: 150, o: 0.07, r: -6, b: 3 },
] as const;

function Coin({
  x,
  y,
  s,
  o,
  r,
  b,
}: {
  x: number;
  y: number;
  s: number;
  o: number;
  r: number;
  b: number;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute flex items-center justify-center rounded-full"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: s,
        height: s,
        opacity: o,
        transform: `rotate(${r}deg)`,
        filter: b ? `blur(${b}px)` : undefined,
        color: "#3F5E1F",
        background:
          "radial-gradient(circle at 30% 28%, #F6FFD0, #C9F25B 52%, #8FB54A)",
        boxShadow:
          "inset 0 0 0 3px rgba(63,94,31,.4), inset 0 0 0 8px rgba(255,255,255,.28), 0 8px 18px rgba(0,0,0,.4)",
      }}
    >
      <Icon d={ICONS.star} size={Math.round(s * 0.5)} fill />
    </span>
  );
}

// card สถิติ: เหลือสิทธิ์รับ Point อีก N คน (ซ่อนเมื่อเต็ม) + ผู้ลงทะเบียนทั้งหมด M คน
function StatCard({
  label,
  value,
  compact,
  dark,
}: {
  label: string;
  value: number;
  compact: boolean;
  dark?: boolean;
}) {
  const k = compact ? 0.7 : 1; // ย่อเหรียญตามแนวตั้ง
  const radius = compact ? 10 : 12; // มุมโค้งนิดเดียว (เท่ากันทั้งสองการ์ด ทั้ง 4 มุม)

  return (
    <div
      className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 text-center ${
        dark ? "bg-[#1B2A21] text-[#C9F25B]" : "bg-white text-[#1B2A21]"
      }`}
      style={{
        borderRadius: radius,
        boxShadow: CARD_SHADOW, // ไม่มีเส้นกรอบ เหลือแค่เงา
      }}
    >
      {dark &&
        COINS.map((c, i) => <Coin key={i} {...c} s={Math.round(c.s * k)} />)}

      <div
        className={`relative z-10 font-medium leading-tight ${
          dark ? "text-[#C9F25B]/90" : "text-[#6B7A6E]"
        }`}
        style={{ fontSize: compact ? 18 : 26 }}
      >
        {label}
      </div>
      <div
        className="relative z-10 mt-2 font-semibold leading-none tabular-nums"
        style={{ fontSize: compact ? 64 : 96 }}
      >
        {fmtNum(value)}
      </div>
      <div
        className={`relative z-10 mt-2 font-medium ${
          dark ? "text-[#C9F25B]/90" : "text-[#6B7A6E]"
        }`}
        style={{ fontSize: compact ? 18 : 26 }}
      >
        คน
      </div>
    </div>
  );
}

// แถวล่างขวา: card สถิติ (ซ้าย) + QR เข้าร่วมกิจกรรม (ขวา) สูงเท่ากัน
function JoinQR({
  h,
  stats,
  compact,
}: {
  h: number;
  stats: Stats | null;
  compact: boolean;
}) {
  return (
    <div
      className="flex min-w-0 items-end justify-end gap-4"
      style={{ height: h }}
    >
      {stats && (
        <div className="flex h-full min-w-0 flex-1 gap-4">
          {stats.quotaLeft > 0 && (
            <StatCard
              dark
              compact={compact}
              label="เหลือสิทธิ์รับ Point อีก"
              value={stats.quotaLeft}
            />
          )}
          <StatCard
            compact={compact}
            label="ผู้ลงทะเบียนทั้งหมด"
            value={stats.registered}
          />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/img/line.PNG"
        alt="QR code LINE"
        draggable={false}
        className="shrink-0 object-contain object-right-bottom"
        style={{ height: h, width: "auto", maxWidth: "100%" }}
      />
    </div>
  );
}

// พลุกระดาษ: ยิงจากจุด (originX, originY) เป็นสัดส่วนของเวที จางหายใน ~2.8 วิ
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

    // เวทีใหญ่ 1920x1080 อยู่แล้ว ใช้ 1x พอ (2x = พิกเซลมากกว่า 4 เท่า กินแรงมาก)
    const dpr = 1;
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
/* แท่นยืน 3 อันดับแรก (ใช้ร่วมกันทั้งบุคคลและแผนก ทั้งสองแนวจอ)             */
/* ------------------------------------------------------------------ */

type PodItem = {
  name: string;
  org?: string | null; // บรรทัดใต้ชื่อ
  faces: Face[];
  total: number;
  caption: string; // ข้อความใต้ตัวเลข
  stepText?: string | null; // ชื่อบริษัทในแท่น
  reached?: boolean;
  note?: Note | null; // โน๊ตบนแท่น (เฉพาะหน้าบุคคล)
};

const toPersonItem = (e: BoardEntry): PodItem => ({
  name: e.name,
  org: e.department,
  faces: [{ name: e.name, src: e.avatarUrl }],
  total: e.total,
  caption: `ครั้ง · ${e.rounds} รอบ`,
  stepText: e.company,
  reached: e.goalRank != null || e.total >= e.goal,
  note: activeNote(e.note),
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

// ขนาดต่างๆ ของแท่นยืน แยกตามแนวจอ
const PODIUM_SIZES = {
  landscape: {
    step: { 1: 360, 2: 280, 3: 210 },
    num: { 1: 68, 2: 52, 3: 52 },
    name: { 1: 30, 2: 26, 3: 26 },
    facePerson: { 1: 176, 2: 132, 3: 132 },
    faceDept: { 1: 112, 2: 84, 3: 84 },
    org: 18,
    caption: 18,
    stepNum: 76,
    stepText: 26,
    // โน๊ต: noteZoom = ขยายตัวอักษรโน๊ตให้อ่านง่ายบนจอใหญ่ / shrinkFace = ย่อรูปอันดับ 1 ที่มีโน๊ต
    noteZoom: 1.4,
    shrinkFace: 20,
  },
  // แนวตั้ง: การ์ดแท่นยืนสูง 1/3 ของจอ (PODIUM_H_P) จึงย่อรูป/ตัวอักษร/แท่นลงให้พอดี
  portrait: {
    step: { 1: 220, 2: 170, 3: 125 },
    num: { 1: 48, 2: 38, 3: 38 },
    name: { 1: 24, 2: 20, 3: 20 },
    facePerson: { 1: 148, 2: 116, 3: 116 },
    faceDept: { 1: 112, 2: 88, 3: 88 },
    org: 15,
    caption: 15,
    stepNum: 52,
    stepText: 18,
    noteZoom: 1.15,
    shrinkFace: 40,
  },
} as const;

const PODIUM_LOOK = {
  1: { bg: "bg-[#C9F25B] text-[#1B2A21]", delay: ".35s" },
  2: { bg: "bg-[#1B2A21] text-[#C9F25B]", delay: ".5s" },
  3: { bg: "bg-[#3F5E1F] text-white", delay: ".65s" },
} as const;

function Podium({
  items,
  mode,
  portrait,
}: {
  items: (PodItem | undefined)[];
  mode: View;
  portrait: boolean;
}) {
  const S = portrait ? PODIUM_SIZES.portrait : PODIUM_SIZES.landscape;
  const faceSize = mode === "person" ? S.facePerson : S.faceDept;
  const slots = [
    { place: 2 as const, e: items[1] },
    { place: 1 as const, e: items[0] },
    { place: 3 as const, e: items[2] },
  ];

  return (
    <section aria-label="3 อันดับแรก" className="h-full">
      <div
        className="flex h-full flex-col justify-end overflow-hidden rounded-[40px] bg-white px-6 pt-6"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <div className="flex items-end gap-3">
          {slots.map(({ place, e }) => {
            const L = PODIUM_LOOK[place];
            const note = e?.note ?? null;
            const ns = styleOf(note?.style);
            // อันดับ 1 ที่มีโน๊ต: ย้ายถ้วยไปเป็นป้ายมุมรูป และย่อรูปลงเล็กน้อย
            // เพื่อให้โน๊ตพอดีการ์ด (การ์ดสูงคงที่ ล้นแล้วถูกตัดด้านบน)
            const crown = place === 1 && !!note;
            const fSize = faceSize[place] - (crown ? S.shrinkFace : 0);
            return (
              <div
                key={place}
                className={`flex min-w-0 flex-col items-center ${
                  place === 1 ? "flex-[1.3]" : "flex-1"
                }`}
              >
                {e ? (
                  <>
                    {!crown && (
                      <span
                        className={`mb-2 flex h-[44px] items-center text-[#3F5E1F] ${
                          place === 1 ? "dp-float" : ""
                        }`}
                      >
                        {place === 1 && <Icon d={ICONS.trophy} size={44} />}
                      </span>
                    )}
                    {/* bubble โน๊ต เหนือรูป (กว้างกว่าคอลัมน์เล็กน้อย + zoom ให้อ่านบนจอใหญ่) */}
                    {note && (
                      <div
                        className="relative mb-5 flex w-[125%] max-w-none justify-center"
                        style={{ zoom: S.noteZoom }}
                      >
                        <div className="relative w-full text-center drop-shadow-md">
                          <NoteBox text={note.text} frame={ns.frame} />
                          {/* หางกรอบคำพูด ชี้ลงหารูป สีตามกรอบ */}
                          <span
                            aria-hidden
                            className="absolute left-1/2 top-[calc(100%-1px)] h-2 w-3.5 -translate-x-1/2 [clip-path:polygon(0_0,100%_0,50%_100%)]"
                            style={{ background: ns.tail }}
                          />
                          {ns.mood && (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute -right-3 -top-4"
                            >
                              <MoodFace kind={ns.mood} size={28} />
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="relative inline-block">
                      <Faces faces={e.faces} size={fSize} />
                      {crown && (
                        <span className="dp-float absolute -right-5 -top-6 text-[#3F5E1F]">
                          <Icon d={ICONS.trophy} size={40} />
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-3 line-clamp-2 min-h-[2.4em] w-full break-words text-center font-medium leading-tight"
                      style={{ fontSize: S.name[place] }}
                    >
                      {e.name}
                    </div>
                    <div
                      className="w-full truncate text-center text-[#6B7A6E]"
                      style={{ fontSize: S.org, height: S.org + 8 }}
                    >
                      {e.org ?? ""}
                    </div>
                    <div
                      className="mt-1 font-semibold leading-none tabular-nums"
                      style={{ fontSize: S.num[place] }}
                    >
                      {fmtNum(e.total)}
                    </div>
                    <div
                      className="mb-4 mt-2 text-[#6B7A6E]"
                      style={{ fontSize: S.caption }}
                    >
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
                  style={{ height: S.step[place], animationDelay: L.delay }}
                >
                  <span
                    className="font-semibold leading-none tabular-nums"
                    style={{ fontSize: S.stepNum }}
                  >
                    {place}
                  </span>
                  {e?.stepText && (
                    <span
                      className="line-clamp-2 w-full break-words text-center font-bold leading-tight"
                      style={{ fontSize: S.stepText }}
                    >
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

// โครงเนื้อหา
// แนวนอน: แท่นซ้าย / (รายการ + แถว card สถิติ/QR) ขวา
// แนวตั้ง: แท่นบน / รายการกลาง / แถว card สถิติ/QR ล่าง
function BodyFrame({
  dims,
  podium,
  list,
  stats,
}: {
  dims: Dims;
  podium: ReactNode;
  list: ReactNode;
  stats: Stats | null;
}) {
  const listAndQr = (
    <div className="flex min-w-0 flex-col" style={{ gap: QR_GAP }}>
      <div className="min-h-0" style={{ height: dims.listH }}>
        {list}
      </div>
      <JoinQR h={dims.qrH} stats={stats} compact={dims.portrait} />
    </div>
  );

  if (dims.portrait) {
    return (
      <div className="flex h-full flex-col" style={{ gap: PORTRAIT_GAP }}>
        <div
          className="mx-auto w-full shrink-0"
          style={{ height: PODIUM_H_P, maxWidth: PODIUM_MAX_W_P }}
        >
          {podium}
        </div>
        {listAndQr}
      </div>
    );
  }
  return (
    <div
      className="grid h-full gap-8"
      style={{ gridTemplateColumns: `${PODIUM_W}px minmax(0,1fr)` }}
    >
      {podium}
      {listAndQr}
    </div>
  );
}

// กรณีไม่มีข้อมูลเลย: การ์ดข้อความเต็มพื้นที่ + แถว card สถิติ/QR ล่าง
function EmptyFrame({
  text,
  dims,
  stats,
}: {
  text: string;
  dims: Dims;
  stats: Stats | null;
}) {
  return (
    <div className="flex h-full flex-col" style={{ gap: QR_GAP }}>
      <div className="min-h-0 flex-1">
        <Empty text={text} />
      </div>
      <JoinQR h={dims.qrH} stats={stats} compact={dims.portrait} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* เลื่อนรายการลงช้าๆ (ใช้ทั้งหน้าแผนก และหน้าบุคคลแนวตั้งที่คนเยอะ)           */
/* หยุดต้น → เลื่อน → หยุดท้าย แล้วแจ้งจบรอบ (onDone)                        */
/* ถ้ารายการสั้นจนไม่ต้องเลื่อน จะรอครบเวลาขั้นต่ำแล้วแจ้งจบรอบ                 */
/* ------------------------------------------------------------------ */

function AutoScroller({
  children,
  innerClassName,
  minKey,
  minDefault,
  onDone,
}: {
  children: ReactNode;
  innerClassName: string;
  minKey: "p" | "d";
  minDefault: number;
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

    const minMs = secParam(minKey, minDefault);
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
    // รันครั้งเดียวตอนเมานต์ (ข้อมูลรีเฟรชระหว่างเลื่อนไม่ทำให้เริ่มใหม่)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fade =
    "linear-gradient(to bottom, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)";

  return (
    <div
      ref={boxRef}
      className="h-full overflow-hidden"
      style={{ WebkitMaskImage: fade, maskImage: fade }}
    >
      <div ref={innerRef} className={`${innerClassName} will-change-transform`}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าบุคคล                                                             */
/* แนวนอน: อันดับ 4 ขึ้นไปทุกคน จัดคอลัมน์ให้พอดีจอ ไม่เลื่อน                   */
/* แนวตั้ง: จัดคอลัมน์ให้พอดีถ้าคนไม่มาก ถ้าเยอะเกินจะเลื่อนช้าๆ แทน               */
/* ------------------------------------------------------------------ */

// เลือกจำนวนคอลัมน์ให้แถวสูงพอ (ลองเกณฑ์สูงก่อน ไม่พอค่อยลด)
function personLayout(n: number, portrait: boolean, avail: number) {
  const MAX = 92;
  if (n <= 0) return { cols: 1, rows: 1, h: MAX, scroll: false };
  const maxCols = portrait ? 3 : 5;
  // คนไม่เยอะใช้ 1 คอลัมน์ ที่เหลือเริ่มที่ 2 คอลัมน์ ไม่ให้แถวยาวโล่งเกินไป
  const startCols = n <= (portrait ? 8 : 6) ? 1 : 2;
  for (const min of [72, 60, 50, 44]) {
    for (let c = startCols; c <= maxCols; c++) {
      const rows = Math.ceil(n / c);
      const h = Math.floor((avail - (rows - 1) * ROW_GAP) / rows);
      if (h >= min) return { cols: c, rows, h: Math.min(MAX, h), scroll: false };
    }
  }
  // แนวตั้งแน่นเกิน: เลื่อนอัตโนมัติ แถวละ 72px สองคอลัมน์
  if (portrait) return { cols: 2, rows: 0, h: 72, scroll: true };
  const rows = Math.ceil(n / 5);
  const h = Math.floor((avail - (rows - 1) * ROW_GAP) / rows);
  return { cols: 5, rows, h: Math.max(28, h), scroll: false };
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

function PersonBody({
  board,
  dims,
  stats,
  onDone,
}: {
  board: Board;
  dims: Dims;
  stats: Stats | null;
  onDone: () => void;
}) {
  const rest = board.entries.slice(3);
  const lay = useMemo(
    () => personLayout(rest.length, dims.portrait, dims.listH),
    [rest.length, dims.portrait, dims.listH]
  );

  if (board.entries.length === 0) {
    return (
      <EmptyFrame
        text="ยังไม่มีอันดับ ลงสนามเป็นคนแรกเลย"
        dims={dims}
        stats={stats}
      />
    );
  }

  const top = board.entries.slice(0, 3).map(toPersonItem);

  let list: ReactNode;
  if (rest.length === 0) {
    list = <Empty text="อันดับ 4 ขึ้นไปยังว่างอยู่ ชวนเพื่อนมาโดด" />;
  } else if (lay.scroll) {
    list = (
      <AutoScroller
        innerClassName="grid grid-cols-2 gap-x-4 gap-y-2 py-5"
        minKey="p"
        minDefault={PERSON_MS}
        onDone={onDone}
      >
        {rest.map((e, i) => (
          <PersonRow key={e.rank} e={e} h={lay.h} cols={2} i={i} />
        ))}
      </AutoScroller>
    );
  } else {
    list = (
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
    );
  }

  return (
    <BodyFrame
      dims={dims}
      stats={stats}
      podium={
        <Podium
          items={[top[0], top[1], top[2]]}
          mode="person"
          portrait={dims.portrait}
        />
      }
      list={list}
    />
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
        {shown.map((m, mi) => (
          <span
            key={`${m.username}-${mi}`}
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

function DeptBody({
  rows,
  dims,
  stats,
  onDone,
}: {
  rows: DeptEntry[];
  dims: Dims;
  stats: Stats | null;
  onDone: () => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyFrame
        text="ยังไม่มีแผนกหรือสาขาไหนทำคะแนน"
        dims={dims}
        stats={stats}
      />
    );
  }
  const top = rows.slice(0, 3).map(toDeptItem);
  const rest = rows.slice(3);

  return (
    <BodyFrame
      dims={dims}
      stats={stats}
      podium={
        <Podium
          items={[top[0], top[1], top[2]]}
          mode="dept"
          portrait={dims.portrait}
        />
      }
      list={
        rest.length > 0 ? (
          <AutoScroller
            // แนวตั้ง = 1 คอลัมน์เต็มความกว้าง / แนวนอน = 2 คอลัมน์
            innerClassName={`grid gap-y-2 py-5 ${
              dims.portrait ? "grid-cols-1" : "grid-cols-2 gap-x-4"
            }`}
            minKey="d"
            minDefault={DEPT_MIN_MS}
            onDone={onDone}
          >
            {rest.map((e, i) => (
              <DeptRow key={e.key ?? e.id} e={e} i={i} />
            ))}
          </AutoScroller>
        ) : (
          <DeptEmptyRest onDone={onDone} />
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* หน้าหลัก                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
@keyframes dp-in { from { opacity: 0; transform: translateY(28px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes dp-wipe { 0% { transform: translateX(-105%) skewX(-10deg); } 27% { transform: translateX(0) skewX(-10deg); } 73% { transform: translateX(0) skewX(-10deg); } 100% { transform: translateX(105%) skewX(-10deg); } }
@keyframes dp-logo { 0% { opacity: 0; transform: scale(.2); } 15% { opacity: 1; transform: scale(1.22); } 24% { transform: scale(.92); } 33% { transform: scale(1.06); } 41% { transform: scale(1); } 90% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.2); } }
@keyframes dp-wipe-text { 0% { opacity: 0; transform: translateY(40px); } 30% { opacity: 1; transform: none; } 85% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-20px); } }
@keyframes dp-jumper { 0% { opacity: 0; transform: translateY(40px) scale(.6); } 18% { opacity: 1; transform: none; } 88% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-20px); } }
@keyframes dp-row { from { opacity: 0; transform: translateY(70px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes dp-rise { from { transform: scaleY(.15); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes dp-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.dp-in { animation: dp-in 1.2s cubic-bezier(.22,1,.36,1) .2s both; }
.dp-wipe { animation: dp-wipe 3.1s cubic-bezier(.45,.05,.25,1) both; }
.dp-logo { animation: dp-logo 2.5s ease-in-out .63s both; }
.dp-wipe-text { animation: dp-wipe-text 2.3s ease-out 1s both; }
.dp-jumper { animation: dp-jumper 2.2s cubic-bezier(.22,1,.36,1) 1s both; }
.dp-wipe, .dp-logo, .dp-wipe-text, .dp-jumper { will-change: transform, opacity; }
.dp-row { animation: dp-row .7s cubic-bezier(.22,1,.36,1) both; }
.dp-rise { transform-origin: bottom; animation: dp-rise .8s cubic-bezier(.22,1,.36,1) both; }
.dp-float { animation: dp-float 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .dp-in, .dp-rise, .dp-float, .dp-row { animation: none !important; }
  .dp-wipe, .dp-logo, .dp-wipe-text, .dp-jumper { display: none !important; }
}
`;

// กล่องจอที่ใช้จริง: vw/vh = ขนาดจอ "หลังหมุน" (px) / rot = องศาที่หมุนภาพ (?rotate=)
type Box = {
  scale: number;
  portrait: boolean;
  rot: 0 | 90 | 270;
  vw: number;
  vh: number;
};

export default function DisplayBoard() {
  const person = usePersonBoard();
  const dept = useDeptRows();

  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState<View>("person");
  const [cycle, setCycle] = useState(0);
  // เปลี่ยนค่า = ยิงพลุใหม่ (เปลี่ยนหน้า หรือ อันดับ 1 เปลี่ยนคน)
  const [shot, setShot] = useState(1);
  // 0 = ยังไม่รู้เวลา (ตั้งค่าใน effect ฝั่งเบราว์เซอร์ ไม่เรียก Date.now() ตอน prerender)
  const [now, setNow] = useState(0);
  // เมาส์ไม่ขยับครบเวลา → ซ่อนเคอร์เซอร์
  const [hideCursor, setHideCursor] = useState(false);

  const portrait = box?.portrait ?? false;
  const dims = useMemo(() => dimsOf(portrait), [portrait]);
  const hasDept = (dept?.length ?? 0) > 0;

  // card สถิติ: โควต้า Point ที่เหลือ (100 คนแรกของวันเกม รีเซ็ต 06:00) + ผู้ลงทะเบียนทั้งหมด
  // ยังโหลดไม่เสร็จ หรือ API ยังไม่ส่ง registered = ไม่แสดง card
  const stats = useMemo<Stats | null>(() => {
    if (!person || person.registered == null) return null;
    return {
      quotaLeft: Math.max(0, POINT_QUOTA - (person.goalHits ?? 0)),
      registered: person.registered,
    };
  }, [person]);

  // แนวตั้งที่คนเยอะ: หน้าบุคคลเลื่อนเอง และเป็นฝ่ายแจ้งจบรอบ (ไม่ใช้ตัวจับเวลาคงที่)
  const personRest = Math.max(0, (person?.entries.length ?? 0) - 3);
  const personScrolls =
    portrait && personLayout(personRest, true, dims.listH).scroll;

  // เอฟเฟกต์สลับหน้า: แถบสีกวาดทับจอ (wipe) แล้วสลับเนื้อหาตอนแถบปิดจอพอดี
  const [wipe, setWipe] = useState(0);
  const [wipeTo, setWipeTo] = useState<View>("dept"); // หน้าที่กำลังจะไป (ใช้แสดงข้อความบนแถบ)
  const switching = useRef(false);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const shotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(
    () => () => {
      clearTimeout(switchTimer.current);
      clearTimeout(shotTimer.current);
    },
    []
  );

  const goView = (v: View) => {
    if (switching.current) return;
    switching.current = true;
    setWipeTo(v);
    setWipe((w) => w + 1);
    switchTimer.current = setTimeout(() => {
      setView(v);
      switching.current = false;
      // ยิงพลุตอนแถบเริ่มกวาดออก (ไม่ให้ซ้อนกับแอนิเมชันแถบตอนกำลังหนักสุด)
      shotTimer.current = setTimeout(() => setShot((s) => s + 1), 650);
    }, 1650);
  };

  // ย่อ/ขยายเวทีให้พอดีจอ + เลือกแนวจอ (?rotate=90|270 = หมุนภาพสำหรับจอที่วางตั้ง)
  useEffect(() => {
    const fit = () => {
      const q = Number(new URLSearchParams(window.location.search).get("rotate"));
      const rot: 0 | 90 | 270 = q === 90 ? 90 : q === 270 ? 270 : 0;
      const vw = rot ? window.innerHeight : window.innerWidth;
      const vh = rot ? window.innerWidth : window.innerHeight;
      const p = vh > vw;
      const d = dimsOf(p);
      setBox({ scale: Math.min(vw / d.w, vh / d.h), portrait: p, rot, vw, vh });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // นาฬิกาสำหรับนับถอยหลังรีเซ็ต
  useEffect(() => {
    setNow(Date.now());
    // เรนเดอร์ใหม่เฉพาะตอนนาทีเปลี่ยน (ข้อความรีเซ็ตแสดงแค่ชั่วโมง/นาที)
    const t = setInterval(
      () =>
        setNow((p) =>
          Math.floor(p / 60000) === Math.floor(Date.now() / 60000)
            ? p
            : Date.now()
        ),
      15000
    );
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

  // เมาส์ไม่ขยับ 10 วิ → ซ่อนเคอร์เซอร์ / ขยับหรือคลิก → โชว์ใหม่
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      setHideCursor(false);
      clearTimeout(timer);
      timer = setTimeout(() => setHideCursor(true), CURSOR_HIDE_MS);
    };
    arm();
    window.addEventListener("mousemove", arm);
    window.addEventListener("mousedown", arm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", arm);
      window.removeEventListener("mousedown", arm);
    };
  }, []);

  // เต็มจอ: กด F หรือดับเบิลคลิก (กดซ้ำ = ออกจากเต็มจอ)
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

  // หน้าบุคคล → หน้าแผนก ด้วยตัวจับเวลา (ยกเว้นกรณีหน้าบุคคลเลื่อนเอง จะแจ้งจบรอบเอง)
  // หน้าแผนกเป็นฝ่ายแจ้งจบเองตอนเลื่อนครบ
  useEffect(() => {
    if (view !== "person" || personScrolls) return;
    const t = setTimeout(() => {
      if (hasDept) goView("dept");
      else setCycle((c) => c + 1);
    }, secParam("p", PERSON_MS));
    return () => clearTimeout(t);
    // goView สร้างใหม่ทุกเรนเดอร์ แต่ทำงานเหมือนเดิมเสมอ ไม่ต้องใส่ใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cycle, hasDept, personScrolls]);

  // หน้าบุคคลเลื่อนจบรอบ → ไปหน้าแผนก (ถ้าไม่มีข้อมูลแผนก เริ่มเลื่อนบุคคลใหม่)
  const onPersonScrollDone = () => {
    if (hasDept) goView("dept");
    else setCycle((c) => c + 1);
  };

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

  // จุดที่พลุยิงออก = กลางแท่นยืน (สัดส่วนของเวที)
  const confettiX = portrait ? 0.5 : (PAD + PODIUM_W / 2) / dims.w;
  const confettiY = portrait
    ? (PAD + dims.headerH + BODY_GAP + PODIUM_H_P * 0.45) / dims.h
    : 0.45;

  // ขนาดอ้างอิงของแถบกวาดตอนสลับหน้า (px ตามจอหลังหมุน)
  const vw = box?.vw ?? 1920;
  const vh = box?.vh ?? 1080;

  // แถบข้อมูลใต้ชื่อหน้า (รีเซ็ตใน / จำนวนคน / คำอธิบายติ๊กถูก)
  const subtitle =
    view === "person" ? (
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
    );

  const pills = (
    <div className="flex shrink-0 items-center gap-3">
      {(["person", "dept"] as const).map((v) => (
        <span
          key={v}
          className={`rounded-full py-2 font-medium transition-colors duration-500 ${
            portrait ? "px-5 text-[20px]" : "px-7 text-[24px]"
          } ${
            view === v
              ? "bg-[#1B2A21] text-[#C9F25B]"
              : "bg-[#E3EAD6] text-[#6B7A6E]"
          }`}
        >
          {v === "person" ? "บุคคล" : "แผนก"}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-[#F3F6EC] text-[#1B2A21]"
      style={{ cursor: hideCursor ? "none" : "default" }}
      onDoubleClick={toggleFullscreen}
    >
      <style>{CSS}</style>
      {/* CSS ของกรอบ/อารมณ์/เอฟเฟกต์โน๊ต อยู่ใน NoteShared.tsx */}
      <NoteStyles />

      {/* กล่องจอ: ขนาดเท่าจอหลังหมุน (พื้นหลัง เวที และแถบกวาดอยู่ในนี้ หมุนไปพร้อมกัน) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: box ? box.vw : "100%",
          height: box ? box.vh : "100%",
          transform: `translate(-50%, -50%) rotate(${box?.rot ?? 0}deg)`,
          overflow: "hidden",
          visibility: box === null ? "hidden" : "visible",
          backgroundColor: "#F3F6EC", // สีสำรองตอนรูปยังโหลดไม่เสร็จ
          backgroundImage: "url(/img/bg.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: dims.w,
            height: dims.h,
            transform: `translate(-50%, -50%) scale(${box?.scale ?? 1})`,
            padding: PAD,
          }}
        >
          {/* หัวหน้า */}
          {portrait ? (
            <header
              className="flex flex-col justify-between"
              style={{ height: dims.headerH }}
            >
              <div className="flex items-end justify-between gap-6">
                <div className="flex min-w-0 items-end gap-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/img/logo.png"
                    alt="logo"
                    className="h-[88px] w-auto shrink-0 object-contain"
                  />
                  <h1 className="truncate text-[56px] font-semibold leading-[1.1] tracking-tight">
                    {title}
                  </h1>
                </div>
                <div className="flex shrink-0 items-end gap-6">
                  <Clock compact />
                  <div className="mb-1">{pills}</div>
                </div>
              </div>
              <div className="flex h-[30px] items-center gap-6 text-[20px] text-[#6B7A6E]">
                {subtitle}
              </div>
            </header>
          ) : (
            <header
              className="flex items-end justify-between"
              style={{ height: dims.headerH }}
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
                    {subtitle}
                  </div>
                  <h1 className="text-[56px] font-semibold leading-[1.1] tracking-tight">
                    {title}
                  </h1>
                </div>
              </div>

              <div className="flex items-end gap-10">
                <Clock />
                <div className="mb-2">{pills}</div>
              </div>
            </header>
          )}

          {/* เนื้อหา */}
          <main style={{ height: dims.bodyH, marginTop: BODY_GAP }}>
            <div key={`${view}-${portrait}`} className="dp-in h-full">
              {view === "person" ? (
                person ? (
                  <PersonBody
                    key={cycle}
                    board={person}
                    dims={dims}
                    stats={stats}
                    onDone={onPersonScrollDone}
                  />
                ) : (
                  <Empty text="กำลังโหลดอันดับ…" />
                )
              ) : dept ? (
                <DeptBody
                  rows={dept}
                  dims={dims}
                  stats={stats}
                  onDone={() => goView("person")}
                />
              ) : (
                <Empty text="กำลังโหลดอันดับ…" />
              )}
            </div>
          </main>

          {/* พลุกระดาษ: ยิงจากกลางแท่นยืน ขึ้นไปทั่วเวที */}
          {ready && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20"
            >
              <Confetti
                key={shot}
                count={140}
                originX={confettiX}
                originY={confettiY}
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
                className="flex h-full w-full flex-col items-center justify-center"
                style={{ transform: "skewX(10deg)", gap: vh * 0.02 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/img/logo.png"
                  alt=""
                  draggable={false}
                  className="dp-logo h-auto object-contain"
                  style={{ width: vw * 0.5, maxHeight: vh * 0.38 }}
                />
                <div
                  className="dp-wipe-text font-semibold leading-none text-[#1B2A21]"
                  style={{ fontSize: vw * 0.046 }}
                >
                  {wipeTo === "dept" ? "อันดับแผนก" : "อันดับบุคคล"}
                </div>
                <div className="dp-jumper">
                  <Jumper size={Math.round(vh * 0.26)} cycle={false} effects={false} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}