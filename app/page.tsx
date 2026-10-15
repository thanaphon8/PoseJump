"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Prompt } from "next/font/google";
import type {
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

const APP_NAME = "Pose Jump";

// Prompt: ฟอนต์ไทย+อังกฤษทรงเรขาคณิตมน ดูสปอร์ตและสดใส เข้ากับโทนเขียวมะนาว
const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const FONT = `${prompt.style.fontFamily}, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", Sarabun, sans-serif`;

/* ------------------------------------------------------------------ */
/* ค่าคงที่                                                             */
/* ------------------------------------------------------------------ */

// ต้องใช้เวอร์ชันเดียวกับแพ็กเกจที่ติดตั้ง: npm i @mediapipe/tasks-vision@0.10.14
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// จุดที่ต้องมองเห็นครบ: ไหล่ L/R, สะโพก L/R, ข้อเท้า L/R
const REQUIRED_LANDMARKS = [11, 12, 23, 24, 27, 28];

// ความไวการนับ ยิ่งน้อยยิ่งไว (เสี่ยงนับเกินตอนยืนนิ่ง) เป็นสัดส่วนของความยาวลำตัว
const MIN_AMPLITUDE = 0.035;
const MIN_JUMP_INTERVAL_MS = 220;

const TIME_PRESETS = [30, 60, 120, 180];
const COUNT_PRESETS = [50, 100, 200, 500];

const STORAGE_KEY = "pose-jump-settings";
const HISTORY_KEY = "pose-jump-history";
// แคลอรี่โดยประมาณต่อการกระโดด 1 ครั้ง
const KCAL_PER_JUMP = 0.1;
const DAY = 864e5;
const DAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// สี
const LIME = "#C9F25B";

type Phase =
  | "setup"
  | "loading"
  | "leveling"
  | "positioning"
  | "countdown"
  | "running"
  | "summary";
type Mode = "time" | "count";
type EndReason = "time" | "count" | "manual";
type Tab = "home" | "today" | "history" | "settings";

type Summary = {
  total: number;
  durationMs: number;
  perMin: number;
  bestTenSec: number;
  consistency: number;
  buckets: number[];
  reason: EndReason;
  record: boolean;
};

type Session = {
  id: number;
  ts: number;
  total: number;
  durationMs: number;
  perMin: number;
  best: number;
  mode: Mode;
  kcal: number;
};

type User = {
  name: string;
  username?: string;
};

type Settings = {
  mode: Mode;
  seconds: number;
  target: number;
  dailyGoal: number;
  facing: "user" | "environment";
  sound: boolean;
};

// อันดับวันนี้ (มาจาก /api/leaderboard)
type BoardEntry = {
  rank: number;
  name: string;
  total: number;
  rounds: number;
  me: boolean;
};

type Board = {
  entries: BoardEntry[];
  me: { rank: number; total: number; gap: number } | null;
  count: number;
  resetAt: number;
};

// ใช้เทียบว่าค่าตั้งค่าเปลี่ยนจากที่ซิงก์ไว้ล่าสุดไหม
const settingsKey = (v: Settings) =>
  JSON.stringify({
    mode: v.mode,
    seconds: v.seconds,
    target: v.target,
    dailyGoal: v.dailyGoal,
    facing: v.facing,
    sound: v.sound,
  });

/* ------------------------------------------------------------------ */
/* ตรวจตำแหน่งผู้เล่นก่อนเริ่ม                                             */
/* ------------------------------------------------------------------ */

const HOLD_MS = 1500;
const GUIDE_TOP = 0.05;
const GUIDE_H = 0.9;

const MIN_BODY_H = 0.5;
const MAX_BODY_H = 0.92;
const MIN_TOP = 0.03;
const MAX_BOTTOM = 0.97;
const CENTER_TOL = 0.25;

// ตั้งมือถือด้วยไจโร (องศา) 90 = ตั้งตรง น้อยกว่า = เอนหลัง กล้องหลังใช้ 180 - ค่านี้
// ตั้งค่า: พิงมือถือกับลัง/ผนังให้หงายหลัง 20 องศา (กล้องหน้าแหงนขึ้น ไม่ก้มลง) ยอมคลาดเคลื่อนได้ ±7 องศา
const LEVEL_TARGET_BETA = 70;
const LEVEL_TOL_DEG = 7;
const LEVEL_JITTER_DEG = 2;
const LEVEL_WINDOW_MS = 500;
const LEVEL_HOLD_MS = 1500;
const LEVEL_RANGE_DEG = 22;
// ราง 300px ลูกบอล 72px → ขอบสุด ±114px เว้นไว้ ±108px (ห่างขอบ 6px) พอดีสวยไม่ชน
const LEVEL_PX_PER_DEG = 108 / LEVEL_RANGE_DEG;

// ท่าจับเชือก
const HAND_MIN_OFFSET = 0.75;
const HAND_MIN_VIS = 0.3;

const SHOW_SKELETON = false;
const FORCE_CONTAIN = false;

type Placement = {
  head: boolean;
  feet: boolean;
  distance: boolean;
  centered: boolean;
  hands: boolean;
  ok: boolean;
  hint: string;
};

const EMPTY_PLACEMENT: Placement = {
  head: false,
  feet: false,
  distance: false,
  centered: false,
  hands: false,
  ok: false,
  hint: "ยืนให้กล้องเห็นตัว",
};

type LevelInfo = {
  pitchOk: boolean;
  rollOk: boolean;
  dir: "up" | "down" | "ok";
  hold: number;
  hint: string;
};

const EMPTY_LEVEL: LevelInfo = {
  pitchOk: false,
  rollOk: false,
  dir: "down",
  hold: 0,
  hint: "ปรับมุมเอียงมือถือ",
};

function isHoldingRope(lm: NormalizedLandmark[], aspect: number): boolean {
  const lw = lm[15];
  const rw = lm[16];
  if ((lw?.visibility ?? 0) < HAND_MIN_VIS) return false;
  if ((rw?.visibility ?? 0) < HAND_MIN_VIS) return false;

  const shoulderW = Math.abs(lm[11].x - lm[12].x) * aspect;
  const sy = (lm[11].y + lm[12].y) / 2;
  const hy = (lm[23].y + lm[24].y) / 2;
  const torso = hy - sy;
  if (shoulderW <= 0 || torso <= 0) return false;

  const midX = (lm[11].x + lm[12].x) / 2;
  const dl = (lw.x - midX) * aspect;
  const dr = (rw.x - midX) * aspect;
  if (dl * dr >= 0) return false;

  const minOffset = HAND_MIN_OFFSET * shoulderW;
  return Math.abs(dl) >= minOffset && Math.abs(dr) >= minOffset;
}

function evaluatePlacement(
  lm: NormalizedLandmark[] | undefined,
  aspect: number,
  mirrored: boolean
): Placement {
  if (!lm) return EMPTY_PLACEMENT;

  const vis = (i: number) => (lm[i]?.visibility ?? 0) > 0.5;

  const head = vis(0) && lm[0].y >= MIN_TOP;
  const feet =
    vis(27) && vis(28) && Math.max(lm[27].y, lm[28].y) <= MAX_BOTTOM;
  const torsoSeen = [11, 12, 23, 24].every(vis);
  if (!head || !feet || !torsoSeen) {
    let hint = "ให้กล้องเห็นลำตัวครบ";
    if (!head && !feet) hint = "ถอยหลังจนเห็นตั้งแต่ศีรษะถึงเท้า";
    else if (!head) hint = "ให้เห็นศีรษะครบ ถอยหลังอีกนิด";
    else if (!feet) hint = "ให้เห็นเท้าครบ ถอยหลังอีกนิด";
    return { ...EMPTY_PLACEMENT, head, feet, hint };
  }

  const bodyH = Math.max(lm[27].y, lm[28].y) - lm[0].y;
  const tooBig = bodyH > MAX_BODY_H;
  const tooSmall = bodyH < MIN_BODY_H;
  const distance = !tooBig && !tooSmall;

  const hipX = (lm[23].x + lm[24].x) / 2;
  const shownX = mirrored ? 1 - hipX : hipX;
  const centered = Math.abs(shownX - 0.5) <= CENTER_TOL;

  const hands = isHoldingRope(lm, aspect);

  let hint = "พร้อมแล้ว ยืนนิ่งๆ";
  if (tooBig) hint = "ถอยหลังอีกนิด";
  else if (tooSmall) hint = "เข้ามาใกล้อีกนิด";
  else if (!centered) {
    hint = shownX > 0.5 ? "ขยับไปทางซ้ายของจอ" : "ขยับไปทางขวาของจอ";
  } else if (!hands) {
    hint = "กางมือออกด้านข้างเหมือนจับเชือก";
  }

  return {
    head,
    feet,
    distance,
    centered,
    hands,
    ok: distance && centered && hands,
    hint,
  };
}

/* ------------------------------------------------------------------ */
/* กรอบรูปคน                                                            */
/* ------------------------------------------------------------------ */

function paintSilhouette(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  ht: number
) {
  const X = (x: number) => cx + x * ht;
  const Y = (y: number) => top + y * ht;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.ellipse(X(0), Y(0.068), 0.054 * ht, 0.068 * ht, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(X(-0.026), Y(0.12), 0.052 * ht, 0.075 * ht);

  const torso: [number, number][] = [
    [-0.12, 0.178],
    [-0.138, 0.205],
    [-0.1, 0.33],
    [-0.088, 0.43],
    [-0.098, 0.52],
    [0.098, 0.52],
    [0.088, 0.43],
    [0.1, 0.33],
    [0.138, 0.205],
    [0.12, 0.178],
  ];
  ctx.beginPath();
  torso.forEach(([x, y], i) =>
    i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y))
  );
  ctx.closePath();
  ctx.fill();

  const limb = (pts: [number, number][], width: number) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y))
    );
    ctx.lineWidth = width * ht;
    ctx.stroke();
  };

  for (const s of [-1, 1]) {
    limb(
      [
        [s * 0.13, 0.21],
        [s * 0.155, 0.36],
        [s * 0.21, 0.5],
      ],
      0.056
    );
    limb(
      [
        [s * 0.05, 0.52],
        [s * 0.062, 0.735],
        [s * 0.06, 0.94],
      ],
      0.092
    );
    ctx.beginPath();
    ctx.ellipse(X(s * 0.07), Y(0.965), 0.056 * ht, 0.024 * ht, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

type GuideCache = {
  w: number;
  h: number;
  ok: HTMLCanvasElement;
  idle: HTMLCanvasElement;
};
let guideCache: GuideCache | null = null;

function buildGuide(w: number, h: number): GuideCache {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  const ht = GUIDE_H * h;
  const top = GUIDE_TOP * h;
  const cx = w / 2;
  const blur = Math.max(10, h * 0.022);
  const border = Math.max(4, h / 200);

  const shadow = make();
  const sctx = shadow.getContext("2d")!;
  const OFF = w * 2;
  sctx.shadowColor = "#000";
  sctx.shadowBlur = blur;
  sctx.shadowOffsetX = OFF;
  sctx.shadowOffsetY = 0;
  sctx.fillStyle = "#000";
  sctx.strokeStyle = "#000";
  paintSilhouette(sctx, cx - OFF, top, ht);

  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    const v = Math.max(0, Math.min(1, (a - 100) / 56));
    d[i] = 0;
    d[i + 1] = 0;
    d[i + 2] = 0;
    d[i + 3] = Math.round(v * 255);
  }
  const mask = make();
  mask.getContext("2d")!.putImageData(img, 0, 0);

  const compose = (color: string) => {
    const out = make();
    const c = out.getContext("2d")!;
    c.fillStyle = "rgba(10,18,13,0.5)";
    c.fillRect(0, 0, w, h);

    const ring = make();
    const rc = ring.getContext("2d")!;
    const steps = 32;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      rc.drawImage(mask, Math.cos(a) * border, Math.sin(a) * border);
    }
    rc.drawImage(mask, 0, 0);
    rc.globalCompositeOperation = "source-in";
    rc.fillStyle = color;
    rc.fillRect(0, 0, w, h);

    c.drawImage(ring, 0, 0);
    c.globalCompositeOperation = "destination-out";
    c.drawImage(mask, 0, 0);
    return out;
  };

  return { w, h, ok: compose(LIME), idle: compose("#FFFFFF") };
}

function drawGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ok: boolean
) {
  if (!guideCache || guideCache.w !== w || guideCache.h !== h) {
    guideCache = buildGuide(w, h);
  }
  ctx.drawImage(ok ? guideCache.ok : guideCache.idle, 0, 0);
}

/* ------------------------------------------------------------------ */
/* ตัวตรวจจับการกระโดด                                                    */
/* ------------------------------------------------------------------ */

// ใช้ตำแหน่งแนวตั้งเฉลี่ยของไหล่ สะโพก ข้อเท้า ติดตามพื้นกับจุดสูงสุด
// นับ 1 ครั้งเมื่อลงพื้น และนับเฉพาะตอนอยู่ในท่าจับเชือก
function createJumpDetector() {
  let ready = false;
  let lastT = 0;
  let ema = 0;
  let hi = 0;
  let lo = 0;
  let air = false;
  let lastCount = -1e9;
  let handsScore = 0;

  const reset = () => {
    ready = false;
    air = false;
    handsScore = 0;
  };

  const update = (lm: NormalizedLandmark[], t: number, aspect: number) => {
    const visible = REQUIRED_LANDMARKS.every(
      (i) => (lm[i]?.visibility ?? 0) > 0.5
    );
    if (!visible) {
      reset();
      return { bodyOk: false, counted: false, air: false, handsOk: false };
    }

    const shoulderY = (lm[11].y + lm[12].y) / 2;
    const hipY = (lm[23].y + lm[24].y) / 2;
    const ankleY = (lm[27].y + lm[28].y) / 2;
    const torso = hipY - shoulderY;
    if (torso < 0.06) {
      reset();
      return { bodyOk: false, counted: false, air: false, handsOk: false };
    }

    const y = (shoulderY + hipY + ankleY) / 3;
    const rawHands = isHoldingRope(lm, aspect) ? 1 : 0;

    if (!ready) {
      ema = hi = lo = y;
      lastT = t;
      handsScore = rawHands;
      ready = true;
      return {
        bodyOk: true,
        counted: false,
        air: false,
        handsOk: rawHands === 1,
      };
    }

    const dt = Math.max(1, t - lastT);
    lastT = t;
    const kSmooth = 1 - Math.exp(-dt / 25);
    const kDecay = 1 - Math.exp(-dt / 1200);
    const kHands = 1 - Math.exp(-dt / 250);

    ema += (y - ema) * kSmooth;
    hi = ema > hi ? ema : hi + (ema - hi) * kDecay;
    lo = ema < lo ? ema : lo + (ema - lo) * kDecay;
    handsScore += (rawHands - handsScore) * kHands;
    const handsOk = handsScore >= 0.6;

    const amp = hi - lo;
    const mid = (hi + lo) / 2;
    let counted = false;

    if (amp >= MIN_AMPLITUDE * torso) {
      if (!air && ema < mid - 0.25 * amp) {
        air = true;
      } else if (air && ema > mid + 0.25 * amp) {
        air = false;
        if (handsOk && t - lastCount >= MIN_JUMP_INTERVAL_MS) {
          counted = true;
          lastCount = t;
        }
      }
    } else {
      air = false;
    }

    return { bodyOk: true, counted, air, handsOk };
  };

  return { update, reset };
}

/* ------------------------------------------------------------------ */
/* ฟังก์ชันช่วย                                                          */
/* ------------------------------------------------------------------ */

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function summarize(
  ts: number[],
  durationMs: number,
  reason: EndReason
): Summary {
  const total = ts.length;
  const safeDuration = Math.max(1000, durationMs);

  const bucketCount = Math.max(1, Math.ceil(safeDuration / 10000));
  const buckets: number[] = Array(bucketCount).fill(0);
  ts.forEach((t) => {
    buckets[Math.min(bucketCount - 1, Math.floor(t / 10000))]++;
  });

  let bestTenSec = 0;
  let j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > 10000) j++;
    bestTenSec = Math.max(bestTenSec, i - j + 1);
  }

  let consistency = 0;
  if (ts.length >= 5) {
    const gaps: number[] = [];
    for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance =
      gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
    const cv = Math.sqrt(variance) / mean;
    consistency = Math.round(Math.max(0, Math.min(100, 100 - cv * 100)));
  }

  return {
    total,
    durationMs: safeDuration,
    perMin: Math.round((total / safeDuration) * 60000),
    bestTenSec,
    consistency,
    buckets,
    reason,
    record: false,
  };
}

function beep(ctx: AudioContext | null, freq = 880, dur = 0.12) {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch {
    // เสียงไม่ทำงานก็ไม่เป็นไร
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestGyro(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window))
      return false;
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof DOE.requestPermission === "function") {
      return (await DOE.requestPermission()) === "granted";
    }
    return true;
  } catch {
    return false;
  }
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

/* ------------------------------------------------------------------ */
/* ส่วนประกอบ UI                                                         */
/* ------------------------------------------------------------------ */

const STYLES = `
@keyframes pj-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pj-pop { 0% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes pj-in { from { opacity: 0; } to { opacity: 1; } }
.pj-fade { animation: pj-fade .35s cubic-bezier(.2,.8,.2,1) both; }
.pj-pop { animation: pj-pop .18s ease-out; }
.pj-in { animation: pj-in .25s ease-out both; }
@keyframes pj-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
.pj-pulse { animation: pj-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .pj-fade, .pj-pop, .pj-in, .pj-pulse { animation: none; } }
`;

function Icon({
  d,
  size = 22,
  fill,
}: {
  d: string;
  size?: number;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chart: "M5 20V11M12 20V4M19 20v-6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4",
  play: "M7 4l13 8-13 8z",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 13l4 4 10-10",
  flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  down: "M12 4v15M6 13l6 6 6-6",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z",
  user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout:
    "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff:
    "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
};

function Ring({
  value,
  size,
  stroke,
  track,
  color,
  children,
}: {
  value: number;
  size: number;
  stroke: number;
  track: string;
  color: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div
      className="grid rounded-full bg-[#E3EAD6] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full font-semibold transition-all duration-200 ${
            small ? "h-8 text-[14px]" : "h-10 text-[15px]"
          } ${value === v ? "bg-white text-[#1B2A21] shadow-sm" : "text-[#6B7A6E]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-[#3F5E1F]" : "bg-[#D5DCC8]"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all duration-200 ${
          on ? "left-[22px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

function Stepper({
  display,
  unit,
  onMinus,
  onPlus,
  big,
}: {
  display: string;
  unit: string;
  onMinus: () => void;
  onPlus: () => void;
  big?: boolean;
}) {
  const btn =
    "flex h-12 w-12 items-center justify-center rounded-full bg-white text-3xl font-light text-[#1B2A21] shadow-sm transition-transform active:scale-90";
  return (
    <div className="flex items-center justify-between">
      <button onClick={onMinus} aria-label="ลดลง" className={btn}>
        −
      </button>
      <div className="text-center">
        <div
          key={display}
          className={`pj-pop font-semibold leading-none tabular-nums tracking-tight ${
            big ? "text-[64px]" : "text-[48px]"
          }`}
        >
          {display}
        </div>
        <div className="mt-2 text-[14px] text-[#6B7A6E]">{unit}</div>
      </div>
      <button onClick={onPlus} aria-label="เพิ่มขึ้น" className={btn}>
        +
      </button>
    </div>
  );
}

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

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
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

// มุมขวาบน: รูปโปรไฟล์ + เมนูออกจากระบบ (ยังไม่ล็อกอินจะเห็นหน้า login แทน)
function ProfileMenu({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <div className="relative">
      {user && (
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="เมนูโปรไฟล์"
          aria-expanded={menu}
          className="flex items-center gap-2 rounded-full bg-white p-1 pr-3 shadow-sm transition-transform active:scale-95"
        >
          <Avatar name={user.name} size={36} />
          <span className="max-w-[96px] truncate text-[14px] font-semibold">
            {user.name}
          </span>
        </button>
      )}

      {menu && user && (
        <>
          <button
            aria-label="ปิดเมนู"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setMenu(false)}
          />
          <div className="pj-in absolute right-0 top-12 z-30 w-64 rounded-3xl bg-white p-2 shadow-xl ring-1 ring-[#E3EAD6]">
            <div className="flex items-center gap-3 px-3 py-3">
              <Avatar name={user.name} size={44} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">
                  {user.name}
                </div>
                {user.username && (
                  <div className="truncate text-[12px] text-[#6B7A6E]">
                    @{user.username}
                  </div>
                )}
              </div>
            </div>
            <div className="my-1 h-px bg-[#EEF2E4]" />
            <button
              onClick={() => {
                setMenu(false);
                onLogout();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold text-[#D92D20] transition-colors hover:bg-[#FDE8E6]"
            >
              <Icon d={ICONS.logout} size={18} />
              ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// พลุกระดาษมินิมอล: ยิงจากกลางการ์ดตัวเลข สีตามธีม จางหายใน ~2.6 วิ
// ไม่ยิงถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว
function Confetti({ count = 70 }: { count?: number }) {
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

    const colors = [LIME, "#E8F5C1", "#FFFFFF", "#8FB54A"];
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
  }, [count]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

// แถบผู้ใช้ท้าย sidebar (เดสก์ท็อป)
function SidebarUser({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
      <Avatar name={user.name} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{user.name}</div>
        {user.username && (
          <div className="truncate text-[12px] text-[#6B7A6E]">
            @{user.username}
          </div>
        )}
      </div>
      <button
        onClick={onLogout}
        aria-label="ออกจากระบบ"
        title="ออกจากระบบ"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#D92D20] transition-colors hover:bg-[#FDE8E6] active:scale-90"
      >
        <Icon d={ICONS.logout} size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าเข้าสู่ระบบ / สมัครสมาชิก (เชื่อมต่อ MongoDB ผ่าน API)               */
/* ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  error,
  hint,
  maxLength,
  autoFocus,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  autoFocus?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#6B7A6E]">
        {label}
      </span>
      <span className="relative block">
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!error}
          className={`h-12 w-full select-text rounded-2xl bg-white px-4 text-[16px] text-[#1B2A21] outline-none ring-2 transition-shadow placeholder:text-[#A9B79A] focus:ring-[#C9F25B] ${
            error ? "ring-[#D92D20]/60" : "ring-transparent"
          } ${trailing ? "pr-12" : ""}`}
        />
        {trailing && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        )}
      </span>
      {error ? (
        <span role="alert" className="pj-in mt-1.5 block text-[12px] text-[#D92D20]">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-[#6B7A6E]">{hint}</span>
      ) : null}
    </label>
  );
}

function AuthScreen({ onAuthed }: { onAuthed: (u: User) => void }) {
  type Errors = Partial<
    Record<"nickname" | "username" | "password" | "confirm" | "form", string>
  >;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const isReg = mode === "register";

  const edit =
    (key: keyof Errors, set: (v: string) => void) => (v: string) => {
      set(v);
      setErrors((p) => ({ ...p, [key]: undefined, form: undefined }));
    };

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setErrors({});
    setConfirm("");
    setShow(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const nick = nickname.trim();
    const uname = username.trim();
    const err: Errors = {};
    if (isReg && !nick) err.nickname = "กรอกชื่อเล่น";
    if (!uname) err.username = "กรอก username";
    else if (isReg && !/^[A-Za-z0-9_]{3,20}$/.test(uname))
      err.username = "3-20 ตัว ใช้ a-z 0-9 และ _ เท่านั้น";
    if (!password) err.password = "กรอกรหัสผ่าน";
    else if (isReg && password.length < 6)
      err.password = "รหัสผ่านอย่างน้อย 6 ตัวอักษร";
    if (isReg && !err.password && confirm !== password)
      err.confirm = "รหัสผ่านไม่ตรงกัน";
    if (Object.keys(err).length > 0) {
      setErrors(err);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        isReg ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isReg
              ? { nickname: nick, username: uname, password }
              : { username: uname, password }
          ),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        user?: User;
        errors?: Errors;
        error?: string;
      };
      if (!res.ok || !data.user) {
        if (data.errors) setErrors(data.errors);
        else
          setErrors({
            form: data.error ?? "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง",
          });
        return;
      }
      onAuthed(data.user);
    } catch {
      setErrors({ form: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };

  const eye = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      className="flex h-9 w-9 items-center justify-center rounded-full text-[#6B7A6E] transition-colors hover:bg-[#F3F6EC] active:scale-90"
    >
      <Icon d={show ? ICONS.eyeOff : ICONS.eye} size={20} />
    </button>
  );

  const perks = [
    "นับการกระโดดอัตโนมัติด้วยกล้อง",
    "ตั้งเป้าหมายรายวัน ดูความคืบหน้า",
    "ปฏิทินติ๊กถูกทุกวันที่ทำถึงเป้า",
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isReg ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
      className="pj-in fixed inset-0 z-50 overflow-y-auto bg-[#F3F6EC] text-[#1B2A21] lg:grid lg:grid-cols-[1fr_1fr]"
    >
      {/* แผงแบรนด์ (เดสก์ท็อป) */}
      <aside className="hidden flex-col justify-between bg-[#1B2A21] p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-[20px] font-bold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#C9F25B] text-[#1B2A21]">
            <Icon d={ICONS.bolt} size={20} />
          </span>
          {APP_NAME}
        </div>
        <div>
          <h2 className="text-[48px] font-bold leading-[1.1] tracking-tight">
            โดดทุกวัน
            <br />
            <span className="text-[#C9F25B]">สร้างสถิติใหม่</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[16px] text-white/80">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                  <Icon d={ICONS.check} size={14} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-white/50">
          สถิติของคุณซิงก์ข้ามอุปกรณ์ได้
        </p>
      </aside>

      {/* ฟอร์ม */}
      <div className="flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] lg:px-12">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1B2A21] text-[#C9F25B]">
              <Icon d={ICONS.bolt} size={16} />
            </span>
            {APP_NAME}
          </div>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="mx-auto my-auto w-full max-w-sm py-6"
        >
          <h1 className="text-[30px] font-bold leading-tight tracking-tight">
            {isReg ? "สร้างบัญชีใหม่" : "ยินดีต้อนรับกลับมา"}
          </h1>
          <p className="mt-1 text-[14px] text-[#6B7A6E]">
            {isReg
              ? "สมัครสมาชิกเพื่อเริ่มเก็บสถิติการกระโดดของคุณ"
              : "เข้าสู่ระบบเพื่อไปต่อจากรอบล่าสุด"}
          </p>

          <div className="mt-6">
            <Segmented<"login" | "register">
              value={mode}
              onChange={switchMode}
              options={
                [
                  ["login", "เข้าสู่ระบบ"],
                  ["register", "สมัครสมาชิก"],
                ] as const
              }
            />
          </div>

          <div className="mt-5 space-y-4">
            {isReg && (
              <Field
                label="ชื่อเล่น"
                value={nickname}
                onChange={edit("nickname", setNickname)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="เช่น มะนาว"
                error={errors.nickname}
                autoFocus
              />
            )}
            <Field
              key={mode}
              label="Username"
              value={username}
              onChange={edit("username", setUsername)}
              maxLength={20}
              autoComplete="username"
              placeholder="เช่น manao_99"
              error={errors.username}
              hint={isReg ? "3-20 ตัว ใช้ a-z 0-9 และ _" : undefined}
              autoFocus={!isReg}
            />
            <Field
              label="รหัสผ่าน"
              value={password}
              onChange={edit("password", setPassword)}
              type={show ? "text" : "password"}
              autoComplete={isReg ? "new-password" : "current-password"}
              placeholder={isReg ? "อย่างน้อย 6 ตัวอักษร" : "รหัสผ่านของคุณ"}
              error={errors.password}
              trailing={eye}
            />
            {isReg && (
              <Field
                label="ยืนยันรหัสผ่าน"
                value={confirm}
                onChange={edit("confirm", setConfirm)}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                error={errors.confirm}
              />
            )}
          </div>

          {errors.form && (
            <p
              role="alert"
              className="pj-in mt-4 rounded-2xl bg-[#FDE8E6] px-4 py-3 text-[14px] text-[#D92D20]"
            >
              {errors.form}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348] disabled:opacity-60"
          >
            {busy ? "กำลังดำเนินการ" : isReg ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </button>

          <p className="mt-5 text-center text-[14px] text-[#6B7A6E]">
            {isReg ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(isReg ? "login" : "register")}
              className="font-semibold text-[#3F5E1F] underline-offset-2 hover:underline"
            >
              {isReg ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </button>
          </p>
          <p className="mt-3 text-center text-[12px] text-[#6B7A6E] lg:hidden">
            สถิติของคุณซิงก์ข้ามอุปกรณ์ได้
          </p>
        </form>
      </div>
    </div>
  );
}

function Shell({
  tab,
  onTab,
  profile,
  footer,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  profile: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const items: [Tab, string, string][] = [
    ["home", "หน้าหลัก", ICONS.home],
    ["today", "วันนี้", ICONS.trophy],
    ["history", "ประวัติ", ICONS.chart],
    ["settings", "ตั้งค่า", ICONS.gear],
  ];
  return (
    <div className="min-h-dvh bg-[#F3F6EC] text-[#1B2A21] lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 p-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-3 text-[20px] font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1B2A21] text-[#C9F25B]">
            <Icon d={ICONS.bolt} size={18} />
          </span>
          {APP_NAME}
        </div>
        {items.map(([t, label, d]) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className={`flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-semibold transition-colors ${
              tab === t
                ? "bg-[#C9F25B] text-[#1B2A21]"
                : "text-[#6B7A6E] hover:bg-[#E8EEDD]"
            }`}
          >
            <Icon d={d} size={20} />
            {label}
          </button>
        ))}
        <div className="mt-auto">{footer}</div>
      </aside>

      <main className="pj-fade mx-auto w-full max-w-6xl flex-1 px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-10 lg:pb-12 lg:pt-12">
        <div className="mb-4 flex h-10 items-center justify-between lg:hidden">
          <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1B2A21] text-[#C9F25B]">
              <Icon d={ICONS.bolt} size={16} />
            </span>
            {APP_NAME}
          </div>
          {profile}
        </div>
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-[#E3EAD6] bg-white/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        {items.map(([t, label, d]) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            className="flex flex-col items-center gap-0.5 text-[11px] font-semibold"
          >
            <span
              className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                tab === t ? "bg-[#C9F25B]" : "text-[#6B7A6E]"
              }`}
            >
              <Icon d={d} size={20} />
            </span>
            <span className={tab === t ? "" : "text-[#6B7A6E]"}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าหลัก                                                              */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [tab, setTab] = useState<Tab>("home");
  const [hTab, setHTab] = useState<"week" | "month">("week");
  const [mode, setMode] = useState<Mode>("count");
  const [seconds, setSeconds] = useState(60);
  const [target, setTarget] = useState(100);
  const [dailyGoal, setDailyGoal] = useState(1500);
  const [history, setHistory] = useState<Session[]>([]);
  const [now0, setNow0] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bodyOk, setBodyOk] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [placement, setPlacement] = useState<Placement>(EMPTY_PLACEMENT);
  const [hold, setHold] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [sound, setSound] = useState(true);
  const [landscape, setLandscape] = useState(false);
  const [handsOk, setHandsOk] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [vdim, setVdim] = useState({ w: 9, h: 16 });
  const [levelInfo, setLevelInfo] = useState<LevelInfo>(EMPTY_LEVEL);
  const [user, setUser] = useState<User | null>(null);
  // เช็กเซสชันเสร็จแล้วหรือยัง ก่อนเช็กจะไม่แสดงหน้าหลัก กันหน้าวาบ
  const [authReady, setAuthReady] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardErr, setBoardErr] = useState(false);
  const [boardNow, setBoardNow] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const connectionsRef = useRef<{ start: number; end: number }[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef(createJumpDetector());

  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const startRef = useRef(0);
  const jumpsRef = useRef<number[]>([]);
  const lastVideoTimeRef = useRef(-1);
  const lastTickRef = useRef(-1);
  const bodyOkRef = useRef(false);
  const handsOkRef = useRef(false);
  const settingsRef = useRef({ mode, seconds, target, facing, sound });
  const historyRef = useRef<Session[]>([]);
  const lastWarnRef = useRef(-1);
  const phaseRef = useRef<Phase>("setup");
  const placementKeyRef = useRef("");
  const okSinceRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const holdRef = useRef(0);
  const abortCountdownRef = useRef(false);
  const readyResolveRef = useRef<(() => void) | null>(null);
  const levelResolveRef = useRef<(() => void) | null>(null);
  const levelOkSinceRef = useRef<number | null>(null);
  const gotGyroRef = useRef(false);
  const gyroRef = useRef<{
    init: boolean;
    p: number;
    r: number;
    buf: { t: number; p: number; r: number }[];
  }>({ init: false, p: 0, r: 0, buf: [] });
  const levelKnobRef = useRef<HTMLDivElement>(null);
  const levelBarRef = useRef<HTMLDivElement>(null);

  // ซิงก์กับ MongoDB (ใช้เมื่อล็อกอินแล้วเท่านั้น)
  const [remoteReady, setRemoteReady] = useState(false);
  const userRef = useRef<User | null>(null);
  const syncedRef = useRef("");

  const loadRemote = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/sessions"),
      ]);
      if (hRes.ok) {
        const h = (await hRes.json()) as { sessions?: Session[] };
        if (Array.isArray(h.sessions)) setHistory(h.sessions);
      }
      if (sRes.ok) {
        const s = (await sRes.json()) as { settings?: Settings | null };
        const v = s.settings;
        if (v) {
          setMode(v.mode);
          setSeconds(v.seconds);
          setTarget(v.target);
          setDailyGoal(v.dailyGoal);
          setFacing(v.facing);
          setSound(v.sound);
          syncedRef.current = settingsKey(v);
        } else {
          // ผู้ใช้ใหม่ ยังไม่มีค่าบนเซิร์ฟเวอร์ ให้ส่งค่าปัจจุบันขึ้นไป
          syncedRef.current = "";
        }
      }
      setRemoteReady(true);
    } catch {
      // ออฟไลน์หรือเชื่อมต่อไม่ได้ ใช้ข้อมูลในเครื่องไปก่อน
    }
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    settingsRef.current = { mode, seconds, target, facing, sound };
  }, [mode, seconds, target, facing, sound]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // โหลดค่าที่ตั้งไว้และประวัติ
  useEffect(() => {
    setNow0(Date.now());
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.mode === "time" || v.mode === "count") setMode(v.mode);
        if (typeof v.seconds === "number") setSeconds(v.seconds);
        if (typeof v.target === "number") setTarget(v.target);
        if (typeof v.dailyGoal === "number") setDailyGoal(v.dailyGoal);
        if (v.facing === "user" || v.facing === "environment")
          setFacing(v.facing);
        if (typeof v.sound === "boolean") setSound(v.sound);
      }
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) {
        const arr = JSON.parse(h);
        if (Array.isArray(arr)) setHistory(arr);
      }
    } catch {
      // อ่านค่าเดิมไม่ได้ก็ใช้ค่าเริ่มต้น
    }

    // มีเซสชันค้างอยู่ในคุกกี้ไหม ถ้ามีดึงข้อมูลจาก MongoDB ถ้าไม่มี user เป็น null และหน้า login จะขึ้นเอง
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: User | null } | null) => {
        if (d?.user) {
          setUser(d.user);
          loadRemote();
        }
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [loadRemote]);

  // ผู้เยี่ยมชม: เก็บในเครื่อง / ผู้ใช้ที่ล็อกอิน: ส่งขึ้น MongoDB (หน่วง 0.6 วิ)
  useEffect(() => {
    const cur: Settings = { mode, seconds, target, dailyGoal, facing, sound };
    if (!user) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
      } catch {
        // บันทึกไม่ได้ก็ข้ามไป
      }
      return;
    }
    if (!remoteReady) return;
    const body = settingsKey(cur);
    if (body === syncedRef.current) return;
    const t = setTimeout(() => {
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then((r) => {
          if (r.ok) syncedRef.current = body;
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [user, remoteReady, mode, seconds, target, dailyGoal, facing, sound]);

  useEffect(() => {
    document.title = APP_NAME;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "#F3F6EC");
    document.documentElement.style.backgroundColor = "#F3F6EC";
    document.documentElement.style.colorScheme = "light";
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const update = () => setLandscape(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        streamRef.current &&
        "wakeLock" in navigator
      ) {
        navigator.wakeLock
          .request("screen")
          .then((l) => (wakeLockRef.current = l))
          .catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ไจโรของมือถือ ใช้ในขั้นตอนตั้งมือถือ
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      gotGyroRef.current = true;
      if (phaseRef.current !== "leveling") return;

      const now = performance.now();
      const front = settingsRef.current.facing === "user";
      const targetBeta = front ? LEVEL_TARGET_BETA : 180 - LEVEL_TARGET_BETA;
      const pitch = front ? targetBeta - e.beta : e.beta - targetBeta;
      const roll = e.gamma;
      const g = gyroRef.current;
      if (!g.init) {
        g.init = true;
        g.p = pitch;
        g.r = roll;
      } else {
        g.p += (pitch - g.p) * 0.3;
        g.r += (roll - g.r) * 0.3;
      }

      g.buf.push({ t: now, p: pitch, r: roll });
      while (g.buf.length > 0 && now - g.buf[0].t > LEVEL_WINDOW_MS) {
        g.buf.shift();
      }
      let still = false;
      if (g.buf.length > 5 && now - g.buf[0].t >= LEVEL_WINDOW_MS * 0.8) {
        let pMin = Infinity;
        let pMax = -Infinity;
        let rMin = Infinity;
        let rMax = -Infinity;
        for (const s of g.buf) {
          if (s.p < pMin) pMin = s.p;
          if (s.p > pMax) pMax = s.p;
          if (s.r < rMin) rMin = s.r;
          if (s.r > rMax) rMax = s.r;
        }
        still = pMax - pMin <= LEVEL_JITTER_DEG && rMax - rMin <= LEVEL_JITTER_DEG;
      }

      const pitchOk = Math.abs(g.p) <= LEVEL_TOL_DEG;
      const rollOk = Math.abs(g.r) <= LEVEL_TOL_DEG;
      const allOk = pitchOk && rollOk && still;

      const clamped = Math.max(
        -LEVEL_RANGE_DEG,
        Math.min(LEVEL_RANGE_DEG, g.p)
      );
      if (levelKnobRef.current) {
        levelKnobRef.current.style.transform = `translateY(${-clamped * LEVEL_PX_PER_DEG}px)`;
      }
      if (levelBarRef.current) {
        const rot = Math.max(-45, Math.min(45, -g.r));
        levelBarRef.current.style.transform = `rotate(${rot}deg)`;
      }

      let hold = 0;
      if (allOk) {
        if (levelOkSinceRef.current === null) levelOkSinceRef.current = now;
        hold = Math.min(1, (now - levelOkSinceRef.current) / LEVEL_HOLD_MS);
      } else {
        levelOkSinceRef.current = null;
      }

      let hint = "นิ่งดี ค้างไว้";
      if (!pitchOk) {
        hint =
          g.p > 0 ? "กล้องแหงนสูงไป ก้มกล้องลงนิด" : "กล้องก้มต่ำไป แหงนกล้องขึ้นนิด";
      } else if (!rollOk) {
        hint = "มือถือเอียงซ้ายขวา ตั้งให้ตรง";
      } else if (!still) {
        hint = "ขยับให้นิ่งๆ";
      }

      const q = Math.round(hold * 20) / 20;
      const dir: LevelInfo["dir"] = pitchOk ? "ok" : g.p > 0 ? "down" : "up";
      setLevelInfo((prev) =>
        prev.pitchOk === pitchOk &&
        prev.rollOk === rollOk &&
        prev.dir === dir &&
        prev.hold === q &&
        prev.hint === hint
          ? prev
          : { pitchOk, rollOk, dir, hold: q, hint }
      );

      if (hold >= 1) {
        levelOkSinceRef.current = null;
        const done = levelResolveRef.current;
        levelResolveRef.current = null;
        done?.();
      }
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      screen.orientation?.unlock?.();
    } catch {
      // ออกจากเต็มจอไม่ได้ก็ข้าม
    }
  }, []);

  const finish = useCallback(
    (reason: EndReason, durationMs: number) => {
      if (!runningRef.current) return;
      runningRef.current = false;
      const result = summarize(jumpsRef.current, durationMs, reason);

      // สถิติใหม่ = มากกว่าทุกรอบก่อนหน้า (ต้องมีประวัติเดิมอยู่แล้ว)
      const prev = historyRef.current;
      result.record =
        result.total > 0 &&
        prev.length > 0 &&
        result.total > Math.max(...prev.map((s) => s.total));

      if (result.total > 0) {
        const ts = Date.now();
        const entry: Session = {
          id: ts,
          ts,
          total: result.total,
          durationMs: result.durationMs,
          perMin: result.perMin,
          best: result.bestTenSec,
          mode: settingsRef.current.mode,
          kcal: Math.round(result.total * KCAL_PER_JUMP),
        };
        setNow0(ts);
        const loggedIn = !!userRef.current;
        setHistory((p) => {
          const next = [entry, ...p].slice(0, 300);
          if (!loggedIn) {
            try {
              localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
            } catch {
              // บันทึกไม่ได้ก็ข้ามไป
            }
          }
          return next;
        });
        if (loggedIn) {
          fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          }).catch(() => {});
        }
      }

      if (settingsRef.current.sound) beep(audioRef.current, 660, 0.5);
      stopCamera();
      setSummary(result);
      setPhase("summary");
    },
    [stopCamera]
  );

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    const now = performance.now();

    if (
      video &&
      canvas &&
      landmarker &&
      video.readyState >= 2 &&
      video.currentTime !== lastVideoTimeRef.current
    ) {
      lastVideoTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, now);
      const pts = result.landmarks[0];

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, w, h);

      const ph = phaseRef.current;
      if (ph === "positioning" || ph === "countdown") {
        const pl = evaluatePlacement(
          pts,
          w / h,
          settingsRef.current.facing === "user"
        );
        if (ctx) drawGuide(ctx, w, h, pl.ok);

        const key = `${+pl.head}${+pl.feet}${+pl.distance}${+pl.centered}${+pl.hands}${pl.hint}`;
        if (key !== placementKeyRef.current) {
          placementKeyRef.current = key;
          setPlacement(pl);
        }

        if (ph === "positioning") {
          if (pl.ok) {
            if (okSinceRef.current === null) {
              okSinceRef.current = now;
              if (settingsRef.current.sound) beep(audioRef.current, 800, 0.08);
            }
            const hold = Math.min(1, (now - okSinceRef.current) / HOLD_MS);
            const q = Math.round(hold * 20) / 20;
            if (q !== holdRef.current) {
              holdRef.current = q;
              setHold(q);
            }
            if (hold >= 1) {
              okSinceRef.current = null;
              phaseRef.current = "countdown";
              lostSinceRef.current = null;
              const ready = readyResolveRef.current;
              readyResolveRef.current = null;
              ready?.();
            }
          } else {
            okSinceRef.current = null;
            if (holdRef.current !== 0) {
              holdRef.current = 0;
              setHold(0);
            }
          }
        } else if (pl.ok) {
          lostSinceRef.current = null;
        } else if (lostSinceRef.current === null) {
          lostSinceRef.current = now;
        } else if (now - lostSinceRef.current > 800) {
          abortCountdownRef.current = true;
        }
      }

      if (pts) {
        const r = detectorRef.current.update(pts, now, w / h);

        if (r.bodyOk !== bodyOkRef.current) {
          bodyOkRef.current = r.bodyOk;
          setBodyOk(r.bodyOk);
        }
        if (r.handsOk !== handsOkRef.current) {
          handsOkRef.current = r.handsOk;
          setHandsOk(r.handsOk);
        }

        if (SHOW_SKELETON && ctx) {
          ctx.lineWidth = Math.max(3, w / 160);
          ctx.lineCap = "round";
          ctx.strokeStyle = r.air ? LIME : "#FFFFFF";
          for (const { start, end } of connectionsRef.current) {
            if (start < 11 || end < 11) continue;
            const a = pts[start];
            const b = pts[end];
            if ((a.visibility ?? 1) < 0.5 || (b.visibility ?? 1) < 0.5)
              continue;
            ctx.beginPath();
            ctx.moveTo(a.x * w, a.y * h);
            ctx.lineTo(b.x * w, b.y * h);
            ctx.stroke();
          }
        }

        if (runningRef.current && r.counted) {
          jumpsRef.current.push(now - startRef.current);
          const n = jumpsRef.current.length;
          setCount(n);
          if (navigator.vibrate) navigator.vibrate(12);
          if (settingsRef.current.sound) {
            if (n % 10 === 0) beep(audioRef.current, 1320, 0.15);
            else beep(audioRef.current, 1000, 0.04);
          }
        }
      } else {
        detectorRef.current.reset();
        if (bodyOkRef.current) {
          bodyOkRef.current = false;
          setBodyOk(false);
        }
        if (handsOkRef.current) {
          handsOkRef.current = false;
          setHandsOk(false);
        }
      }
    }

    if (runningRef.current) {
      const el = now - startRef.current;
      const tick = Math.floor(el / 100);
      if (tick !== lastTickRef.current) {
        lastTickRef.current = tick;
        setElapsed(el);
      }
      const s = settingsRef.current;
      if (s.mode === "time" && s.sound) {
        const left = Math.ceil((s.seconds * 1000 - el) / 1000);
        if (left >= 1 && left <= 3 && left !== lastWarnRef.current) {
          lastWarnRef.current = left;
          beep(audioRef.current, 700, 0.1);
        }
      }
      if (s.mode === "time" && el >= s.seconds * 1000) {
        finish("time", s.seconds * 1000);
        return;
      }
      if (s.mode === "count" && jumpsRef.current.length >= s.target) {
        const last = jumpsRef.current[jumpsRef.current.length - 1] ?? el;
        finish("count", last);
        return;
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [finish]);

  const stopAll = useCallback(() => {
    sessionRef.current++;
    runningRef.current = false;
    const pending = readyResolveRef.current;
    readyResolveRef.current = null;
    pending?.();
    const levelPending = levelResolveRef.current;
    levelResolveRef.current = null;
    levelPending?.();
    stopCamera();
  }, [stopCamera]);

  useEffect(() => stopAll, [stopAll]);

  // อันดับวันนี้: โหลดตอนเปิดแท็บ และรีเฟรชทุก 30 วินาที
  const loadBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!r.ok) throw new Error("load failed");
      setBoard((await r.json()) as Board);
      setBoardErr(false);
    } catch {
      setBoardErr(true);
    }
    setBoardNow(Date.now());
  }, []);

  useEffect(() => {
    if (phase !== "setup" || tab !== "today") return;
    loadBoard();
    const t = setInterval(loadBoard, 30000);
    return () => clearInterval(t);
  }, [phase, tab, user, loadBoard]);

  const startSession = useCallback(async () => {
    const sid = ++sessionRef.current;
    const cancelled = () => sessionRef.current !== sid;

    // ขอสิทธิ์เซนเซอร์เอียง ต้องเรียกก่อน await ใดๆ
    // กล้องหลังไม่ต้องตั้งมือถือ จึงไม่ขอสิทธิ์ไจโร
    const gyroPromise = facing === "user" ? requestGyro() : Promise.resolve(false);

    // เต็มจอ + ล็อกแนวตั้งเฉพาะมือถือ (หน้าจอแคบ) เดสก์ท็อปไม่ต้อง
    try {
      const el = document.documentElement;
      const isPhone = window.innerWidth < 1024;
      if (isPhone && !document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => {
            const o = screen.orientation as unknown as {
              lock?: (type: string) => Promise<void>;
            };
            return o.lock?.("portrait");
          })
          .catch(() => {});
      }
    } catch {
      // ขอเต็มจอไม่ได้ก็ใช้งานต่อได้
    }

    setError(null);
    setCount(0);
    setElapsed(0);
    setBodyOk(false);
    bodyOkRef.current = false;
    setHandsOk(false);
    handsOkRef.current = false;
    jumpsRef.current = [];
    runningRef.current = false;
    lastVideoTimeRef.current = -1;
    detectorRef.current.reset();
    placementKeyRef.current = "";
    setPlacement(EMPTY_PLACEMENT);
    setHold(0);
    setPhase("loading");

    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    }
    audioRef.current?.resume().catch(() => {});

    await sleep(50);

    try {
      if (!landmarkerRef.current) {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
        const make = (delegate: "GPU" | "CPU") =>
          vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        try {
          landmarkerRef.current = await make("GPU");
        } catch {
          landmarkerRef.current = await make("CPU");
        }
        connectionsRef.current = vision.PoseLandmarker.POSE_CONNECTIONS.map(
          (c: { start: number; end: number }) => ({
            start: c.start,
            end: c.end,
          })
        );
      }
      if (cancelled()) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 600 },
          height: { ideal: 800 },
          aspectRatio: { ideal: 3 / 4 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      if (cancelled()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() as
          | { zoom?: { min: number; max: number } }
          | undefined;
        if (caps?.zoom) {
          await track.applyConstraints({
            advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet],
          });
        }
      } catch {
        // ตั้งซูมไม่ได้ก็ใช้ค่าเดิม
      }

      const video = videoRef.current;
      if (!video) throw new Error("ไม่พบ video element");
      video.srcObject = stream;
      await video.play();
      setVdim({ w: video.videoWidth || 9, h: video.videoHeight || 16 });

      if ("wakeLock" in navigator) {
        navigator.wakeLock
          .request("screen")
          .then((l) => (wakeLockRef.current = l))
          .catch(() => {});
      }

      rafRef.current = requestAnimationFrame(loop);

      // ขั้นตอนตั้งมือถือ ไม่มีเซนเซอร์หรือไม่ได้รับอนุญาตจะข้ามไปสแกนตัวเลย
      let hasGyro = false;
      if (await gyroPromise) {
        const until = performance.now() + 1000;
        while (!gotGyroRef.current && performance.now() < until) {
          if (cancelled()) return;
          await sleep(50);
        }
        hasGyro = gotGyroRef.current;
      }
      if (cancelled()) return;
      if (hasGyro) {
        gyroRef.current = { init: false, p: 0, r: 0, buf: [] };
        levelOkSinceRef.current = null;
        setLevelInfo(EMPTY_LEVEL);
        phaseRef.current = "leveling";
        setPhase("leveling");
        await new Promise<void>((resolve) => {
          levelResolveRef.current = resolve;
        });
        if (cancelled()) return;
        if (settingsRef.current.sound) beep(audioRef.current, 800, 0.08);
      }

      const waitUnlessAborted = async (ms: number) => {
        const end = performance.now() + ms;
        while (performance.now() < end) {
          if (abortCountdownRef.current || cancelled()) return false;
          await sleep(50);
        }
        return !abortCountdownRef.current;
      };

      let counted = false;
      while (!counted) {
        abortCountdownRef.current = false;
        okSinceRef.current = null;
        lostSinceRef.current = null;
        holdRef.current = 0;
        setHold(0);
        phaseRef.current = "positioning";
        setPhase("positioning");

        await new Promise<void>((resolve) => {
          readyResolveRef.current = resolve;
        });
        if (cancelled()) return;

        setPhase("countdown");
        counted = true;
        for (let i = 3; i > 0; i--) {
          setCountdown(i);
          if (settingsRef.current.sound) beep(audioRef.current, 600, 0.1);
          const stillOk = await waitUnlessAborted(1000);
          if (cancelled()) return;
          if (!stillOk) {
            counted = false;
            break;
          }
        }
        setCountdown(null);
      }
      if (settingsRef.current.sound) beep(audioRef.current, 1000, 0.3);

      jumpsRef.current = [];
      startRef.current = performance.now();
      lastTickRef.current = -1;
      lastWarnRef.current = -1;
      runningRef.current = true;
      setPhase("running");
    } catch (e) {
      if (cancelled()) return;
      stopAll();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "ไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่"
          : name === "NotFoundError"
            ? "ไม่พบกล้องในอุปกรณ์นี้"
            : "เริ่มไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตและสิทธิ์กล้อง แล้วลองใหม่"
      );
      setTab("home");
      setPhase("setup");
    }
  }, [loop, stopAll, facing]);

  const skipLeveling = () => {
    const done = levelResolveRef.current;
    levelResolveRef.current = null;
    done?.();
  };

  const stopEarly = () => {
    finish("manual", performance.now() - startRef.current);
  };

  const goHome = () => {
    setTab("home");
    setPhase("setup");
  };

  // ยกเลิกตอนสแกนตัว: ปิดกล้อง ยกเลิกรอบที่ค้าง แล้วกลับหน้าหลัก
  const cancelScan = () => {
    stopAll();
    goHome();
  };

  const login = (u: User) => {
    setUser(u);
    loadRemote();
  };

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setRemoteReady(false);
    syncedRef.current = "";
    // กลับไปใช้ประวัติของผู้เยี่ยมชมที่เก็บในเครื่อง
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      const arr = h ? JSON.parse(h) : [];
      setHistory(Array.isArray(arr) ? arr : []);
    } catch {
      setHistory([]);
    }
  };

  /* ---------------------- ข้อมูลสรุปจากประวัติ ---------------------- */

  const sod = now0 ? startOfDay(now0) : 0;
  const todayList = now0
    ? history.filter((s) => dayKey(s.ts) === dayKey(now0))
    : [];
  const todayTotal = todayList.reduce((a, s) => a + s.total, 0);
  const todayMs = todayList.reduce((a, s) => a + s.durationMs, 0);
  const todayKcal = todayList.reduce((a, s) => a + s.kcal, 0);
  const goalPct = Math.min(1, todayTotal / Math.max(1, dailyGoal));

  let streak = 0;
  if (now0) {
    const days = new Set(history.map((s) => dayKey(s.ts)));
    let t = now0;
    if (!days.has(dayKey(t))) t -= DAY;
    while (days.has(dayKey(t))) {
      streak++;
      t -= DAY;
    }
  }

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

  /* ---------------------------- ตั้งค่ารอบ ---------------------------- */

  const presets = mode === "time" ? TIME_PRESETS : COUNT_PRESETS;
  const value = mode === "time" ? seconds : target;
  const step = 10;
  const setValue = (n: number) => {
    const v = Math.max(5, Math.min(mode === "time" ? 3600 : 10000, n || 5));
    if (mode === "time") setSeconds(v);
    else setTarget(v);
  };

  const fontStyle = { fontFamily: FONT, touchAction: "manipulation" as const };
  const card = "rounded-3xl bg-white";
  const limeBtn =
    "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348]";

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

  /* ------------------------ รอเช็กเซสชันก่อนแสดงหน้า ------------------------ */

  if (!authReady) {
    return <div className="min-h-dvh bg-[#F3F6EC]" />;
  }

  /* ------------------------------ หน้าหลัก ----------------------------- */

  if (phase === "setup") {
    const left = Math.max(0, dailyGoal - todayTotal);

    const homeView = (
      <>
        <header className="mb-5">
          <p className="min-h-[18px] text-[13px] text-[#6B7A6E]">
            {now0
              ? new Date(now0).toLocaleDateString("th-TH", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : ""}
          </p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[36px]">
            พร้อมโดดไหม{user ? ` ${user.name}` : ""} 👋
          </h1>
        </header>

        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
          <div className="space-y-4">
            <section className="rounded-3xl bg-[#1B2A21] p-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-semibold">เป้าหมายวันนี้</span>
                {streak > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-[#C9F25B]">
                    <Icon d={ICONS.flame} size={14} />
                    ต่อเนื่อง {streak} วัน
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[56px] font-semibold leading-none tabular-nums tracking-tight lg:text-[72px]">
                    {fmtNum(todayTotal)}
                  </div>
                  <div className="mt-2 text-[14px] text-white/60">
                    จาก {fmtNum(dailyGoal)} ครั้ง
                  </div>
                  <div className="mt-2 text-[13px] font-medium text-[#C9F25B]">
                    {left > 0
                      ? `อีก ${fmtNum(left)} ครั้งก็ถึงเป้า!`
                      : "ถึงเป้าวันนี้แล้ว เก่งมาก!"}
                  </div>
                </div>
                <Ring
                  value={goalPct}
                  size={112}
                  stroke={10}
                  track="rgba(255,255,255,0.12)"
                  color={LIME}
                >
                  <span className="text-[24px] font-semibold tabular-nums text-[#C9F25B]">
                    {Math.round(goalPct * 100)}%
                  </span>
                  <span className="text-[11px] text-white/60">ทำได้แล้ว</span>
                </Ring>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div className={`${card} flex items-center gap-3 p-4`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
                  <Icon d={ICONS.clock} size={20} />
                </span>
                <div>
                  <div className="text-[20px] font-semibold tabular-nums">
                    {formatTime(todayMs)}
                  </div>
                  <div className="text-[12px] text-[#6B7A6E]">นาทีที่กระโดด</div>
                </div>
              </div>
              <div className={`${card} flex items-center gap-3 p-4`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
                  <Icon d={ICONS.flame} size={20} />
                </span>
                <div>
                  <div className="text-[20px] font-semibold tabular-nums">
                    {todayKcal}
                  </div>
                  <div className="text-[12px] text-[#6B7A6E]">กิโลแคลอรี่</div>
                </div>
              </div>
              <div className={`${card} hidden items-center gap-3 p-4 lg:flex`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
                  <Icon d={ICONS.bolt} size={20} />
                </span>
                <div>
                  <div className="text-[20px] font-semibold tabular-nums">
                    {todayList.length}
                  </div>
                  <div className="text-[12px] text-[#6B7A6E]">รอบวันนี้</div>
                </div>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="pj-in rounded-2xl bg-white px-4 py-3 text-[14px] text-[#D92D20]"
              >
                {error}
              </p>
            )}

            <button onClick={startSession} className={limeBtn}>
              <Icon d={ICONS.play} size={20} fill />
              เริ่มกระโดด
            </button>
            <p className="text-center text-[12px] text-[#6B7A6E]">
              พิงมือถือกับลังหรือผนังให้หงายขึ้นเล็กน้อย สูงระดับเอว ยืนให้เห็นศีรษะถึงเท้า แล้วกางมือเหมือนจับเชือก
            </p>
          </div>

          <div className="space-y-4">
            <section className="rounded-3xl bg-[#E8F5C1] p-5">
              <h2 className="mb-3 text-[16px] font-semibold">รอบถัดไปของคุณ</h2>
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                options={
                  [
                    ["count", "จำนวนครั้ง"],
                    ["time", "เวลา"],
                  ] as const
                }
              />
              <div className="mt-5">
                <Stepper
                  big
                  display={mode === "time" ? formatTime(seconds * 1000) : `${target}`}
                  unit={mode === "time" ? "นาที : วินาที" : "ครั้ง"}
                  onMinus={() => setValue(value - step)}
                  onPlus={() => setValue(value + step)}
                />
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => setValue(p)}
                    className={`h-8 rounded-full px-4 text-[14px] font-semibold transition-all duration-200 active:scale-95 ${
                      value === p
                        ? "bg-[#1B2A21] text-white"
                        : "bg-white text-[#1B2A21]"
                    }`}
                  >
                    {mode === "time" ? formatTime(p * 1000) : p}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-[16px] font-semibold">รอบล่าสุด</h2>
                <button
                  onClick={() => setTab("history")}
                  className="text-[13px] font-medium text-[#3F5E1F]"
                >
                  ดูทั้งหมด →
                </button>
              </div>
              {history.length === 0 ? (
                <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
                  ยังไม่มีประวัติ เริ่มกระโดดรอบแรกได้เลย
                </p>
              ) : (
                <ul className={`${card} divide-y divide-[#EEF2E4]`}>
                  {history.slice(0, 3).map(sessionRow)}
                </ul>
              )}
            </section>
          </div>
        </div>
      </>
    );

    const leader = board?.entries[0];
    const leaderTotal = Math.max(1, leader?.total ?? 1);
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

    const todayView = (
      <>
        <header className="mb-5">
          <p className="min-h-[18px] text-[13px] text-[#6B7A6E]">
            {board ? `รีเซ็ตใน ${resetText}` : ""}
          </p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[36px]">
            อันดับวันนี้
          </h1>
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
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
            <div className="space-y-4">
              <section className="rounded-3xl bg-[#1B2A21] p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[15px] font-semibold">ผู้นำวันนี้</span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-[#C9F25B]">
                    {board.count} คนลงสนาม
                  </span>
                </div>
                {leader ? (
                  <div className="mt-4 flex items-center gap-4">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
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
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[16px] text-white/80">
                    ยังไม่มีใครกระโดดวันนี้ ลงสนามเป็นคนแรกเลย
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
                    <button onClick={startSession} className={`${limeBtn} mt-4`}>
                      <Icon d={ICONS.play} size={20} fill />
                      เริ่มกระโดด
                    </button>
                  </>
                )}
              </section>
            </div>

            <section>
              <h2 className="mb-2 px-1 text-[16px] font-semibold">ตารางอันดับ</h2>
              {board.entries.length === 0 ? (
                <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
                  ยังไม่มีอันดับ
                </p>
              ) : (
                <ul className={`${card} divide-y divide-[#EEF2E4] overflow-hidden`}>
                  {board.entries.map((e) => (
                    <li
                      key={e.rank}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        e.me ? "bg-[#E8F5C1]" : ""
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${rankBadge(
                          e.rank
                        )}`}
                      >
                        {e.rank}
                      </span>
                      <Avatar name={e.name} size={40} />
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
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EEF2E4]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width: `${(e.total / leaderTotal) * 100}%`,
                              background: e.rank === 1 ? "#1B2A21" : "#A9B79A",
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[18px] font-semibold tabular-nums">
                          {fmtNum(e.total)}
                        </div>
                        <div className="text-[11px] text-[#6B7A6E]">
                          {e.rounds} รอบ
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
                นับจากรอบที่ผู้ใช้ล็อกอินบันทึกไว้ รีเซ็ตทุกเที่ยงคืนเวลาไทย
              </p>
            </section>
          </div>
        )}
      </>
    );

    const historyView = (
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
          <div className="space-y-4">
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

            {now0 && (
              <Calendar history={history} goal={dailyGoal} now={now0} />
            )}
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
              <ul className={`${card} divide-y divide-[#EEF2E4]`}>
                {history.slice(0, 20).map(sessionRow)}
              </ul>
            )}
          </section>
        </div>
      </>
    );

    const settingsView = (
      <>
        <h1 className="text-[30px] font-bold tracking-tight lg:text-[36px]">
          ตั้งค่า
        </h1>
        <div className="mt-5 space-y-4 lg:grid lg:max-w-4xl lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <section className="rounded-3xl bg-[#E8F5C1] p-5">
            <h2 className="mb-4 text-[16px] font-semibold">เป้าหมายต่อวัน</h2>
            <Stepper
              display={fmtNum(dailyGoal)}
              unit="ครั้งต่อวัน"
              onMinus={() => setDailyGoal(Math.max(100, dailyGoal - 100))}
              onPlus={() => setDailyGoal(Math.min(20000, dailyGoal + 100))}
            />
          </section>

          <div className="space-y-4">
          <ul className={`${card} divide-y divide-[#EEF2E4]`}>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[16px]">กล้อง</span>
              <div className="w-40">
                <Segmented<"user" | "environment">
                  small
                  value={facing}
                  onChange={setFacing}
                  options={
                    [
                      ["user", "หน้า"],
                      ["environment", "หลัง"],
                    ] as const
                  }
                />
              </div>
            </li>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[16px]">เสียงนับและเตือน</span>
              <Switch on={sound} onChange={setSound} label="เสียงนับและเตือน" />
            </li>
          </ul>

          <button
            onClick={() => {
              if (window.confirm("ลบประวัติการกระโดดทั้งหมด?")) {
                setHistory([]);
                if (user) {
                  fetch("/api/sessions", { method: "DELETE" }).catch(() => {});
                } else {
                  try {
                    localStorage.removeItem(HISTORY_KEY);
                  } catch {
                    // ลบไม่ได้ก็ข้ามไป
                  }
                }
              }
            }}
            className="h-12 w-full rounded-full bg-white text-[15px] font-semibold text-[#D92D20] transition-transform active:scale-[0.98]"
          >
            ล้างประวัติ
          </button>
          </div>
        </div>
      </>
    );

    return (
      <div style={fontStyle} className="select-none antialiased">
        <style>{STYLES}</style>
        <Shell
          tab={tab}
          onTab={setTab}
          profile={
            <ProfileMenu user={user} onLogout={logout} />
          }
          footer={<SidebarUser user={user} onLogout={logout} />}
        >
          {tab === "home" && homeView}
          {tab === "today" && todayView}
          {tab === "history" && historyView}
          {tab === "settings" && settingsView}
        </Shell>
        {!user && <AuthScreen onAuthed={login} />}
      </div>
    );
  }

  /* ----------------------------- หน้าสรุปผล ---------------------------- */

  if (phase === "summary" && summary) {
    const reached = todayTotal >= dailyGoal;
    const title = summary.record
      ? "สถิติใหม่!"
      : reached
        ? "เก่งมาก! ถึงเป้าแล้ว"
        : summary.reason === "manual"
          ? "จบการกระโดด"
          : "ทำได้ดีมาก!";
    const sub =
      summary.reason === "time"
        ? "ครบเวลา"
        : summary.reason === "count"
          ? "ครบจำนวนครั้ง"
          : "หยุดเอง";
    const kcal = Math.round(summary.total * KCAL_PER_JUMP);
    const bars = summary.buckets.map((n, i) => ({
      label: `${i * 10}`,
      value: n,
    }));
    const peak = bars.reduce(
      (bi, b, i, arr) => (b.value > arr[bi].value ? i : bi),
      0
    );

    const tiles: [string, string, string][] = [
      ["เวลา", formatTime(summary.durationMs), "นาที"],
      ["พลังงาน", `~${kcal}`, "กิโลแคลอรี่"],
      ["เฉลี่ย", `${summary.perMin}`, "ครั้ง/นาที"],
    ];

    return (
      <div
        style={fontStyle}
        className="min-h-dvh select-none bg-[#F3F6EC] text-[#1B2A21] antialiased"
      >
        <style>{STYLES}</style>
        <main className="pj-fade mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] lg:max-w-5xl lg:py-10">
          <header className="flex items-start gap-3">
            <button
              onClick={goHome}
              aria-label="ปิด"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white transition-transform active:scale-90"
            >
              <Icon d={ICONS.close} size={18} />
            </button>
            <div>
              <h1 className="text-[22px] font-bold leading-tight">
                {APP_NAME} · สรุปผล
              </h1>
              <p className="text-[13px] text-[#6B7A6E]">{sub}</p>
            </div>
          </header>

          <div className="mt-5 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9F25B]">
              <Icon d={ICONS.check} size={18} />
            </span>
            <span className="text-[18px] font-semibold">{title}</span>
          </div>

          <div className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          <div className="space-y-3">
          <section className="relative overflow-hidden rounded-3xl bg-[#1B2A21] px-5 py-8 text-center text-white lg:py-12">
            {summary.total > 0 && (
              <Confetti count={summary.record ? 110 : 70} />
            )}
            <div className="text-[13px] text-white/60">จำนวนครั้งทั้งหมด</div>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              <span className="pj-pop text-[88px] font-semibold leading-none tabular-nums tracking-tight">
                {fmtNum(summary.total)}
              </span>
              <span className="text-[18px] text-white/70">ครั้ง</span>
            </div>
            {summary.record && (
              <span className="mt-4 inline-block rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-medium text-[#C9F25B]">
                🏆 สถิติใหม่ของคุณ
              </span>
            )}
          </section>

          <div className="grid grid-cols-3 gap-3">
            {tiles.map(([label, v, unit]) => (
              <div key={label} className="rounded-2xl bg-white p-3 text-center">
                <div className="text-[12px] text-[#6B7A6E]">{label}</div>
                <div className="mt-1 text-[22px] font-semibold tabular-nums">
                  {v}
                </div>
                <div className="text-[11px] text-[#6B7A6E]">{unit}</div>
              </div>
            ))}
          </div>

          </div>

          <div className="space-y-3">
          <section className={`${card} p-4 lg:p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">จังหวะการกระโดด</h2>
              <span className="text-[12px] text-[#6B7A6E]">
                ครั้ง / 10 วินาที
              </span>
            </div>
            <div className="mt-4">
              <BarChart bars={bars} highlight={peak} height={112} />
            </div>
            <p className="mt-3 text-[12px] text-[#6B7A6E]">
              10 วินาทีที่เร็วสุด {summary.bestTenSec} ครั้ง
              {summary.total >= 5 && ` · จังหวะสม่ำเสมอ ${summary.consistency}%`}
            </p>
          </section>

          <section className="rounded-3xl bg-[#E8F5C1] p-4 lg:p-5">
            <div className="flex items-center justify-between text-[14px] font-semibold">
              <span>
                วันนี้ {fmtNum(todayTotal)} / {fmtNum(dailyGoal)} ครั้ง
              </span>
              <span className="tabular-nums">{Math.round(goalPct * 100)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-[#3F5E1F] transition-[width] duration-500"
                style={{ width: `${goalPct * 100}%` }}
              />
            </div>
          </section>

          </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-6 lg:flex-row lg:gap-4 lg:pt-8">
            <button onClick={startSession} className={limeBtn}>
              เริ่มอีกรอบ
            </button>
            <button
              onClick={goHome}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-[17px] font-semibold transition-all active:scale-[0.98]"
            >
              <Icon d={ICONS.home} size={20} />
              กลับหน้าหลัก
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* ------------------------------- หน้ากล้อง --------------------------- */

  const remaining = Math.max(0, seconds * 1000 - elapsed);
  const timerText =
    mode === "time"
      ? formatTime(Math.ceil(remaining / 1000) * 1000)
      : formatTime(elapsed);
  const livePerMin =
    elapsed > 5000 ? Math.round((count / elapsed) * 60000) : 0;

  const progress =
    phase !== "running"
      ? 0
      : mode === "time"
        ? Math.min(1, elapsed / (seconds * 1000))
        : Math.min(1, count / target);

  const glass = "bg-black/45 backdrop-blur-xl";
  const isPrep = phase === "positioning" || phase === "countdown";
  const isLevel = phase === "leveling";
  // มุมหงายหลังเป้าหมาย (องศา) = 90 - beta เป้าหมาย → 20° (กล้องหน้า)
  const targetLean =
    90 - (facing === "user" ? LEVEL_TARGET_BETA : 180 - LEVEL_TARGET_BETA);
  const flip = facing === "user" ? "-scale-x-100" : "";
  const fit =
    FORCE_CONTAIN || (vp.w > 0 && vp.w / vp.h > vdim.w / vdim.h)
      ? "object-contain"
      : "object-cover";

  const checks: [string, boolean][] = [
    ["เห็นศีรษะ", placement.head],
    ["เห็นเท้า", placement.feet],
    ["ระยะพอดี", placement.distance],
    ["อยู่ในจอ", placement.centered],
    ["ท่าจับเชือก", placement.hands],
  ];

  return (
    <div
      style={{ ...fontStyle, touchAction: "none", overscrollBehavior: "none" }}
      className="fixed inset-0 select-none overflow-hidden bg-[#F3F6EC] text-white antialiased lg:flex lg:items-center lg:justify-center lg:gap-6 lg:p-6"
    >
      <style>{STYLES}</style>

      {/* เวทีกล้อง: มือถือเต็มจอ เดสก์ท็อปเป็นกรอบมน สัดส่วนเท่าภาพจริง */}
      <div
        className="fixed inset-0 h-dvh w-full overflow-hidden bg-black lg:relative lg:inset-auto lg:h-full lg:max-h-[880px] lg:w-auto lg:rounded-[32px] lg:shadow-xl lg:[aspect-ratio:var(--ar)]"
        style={{ ["--ar" as string]: `${vdim.w} / ${vdim.h}` }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full ${fit} ${flip}`}
        />
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full ${fit} ${flip}`}
        />

        {/* ระหว่างกระโดด (มือถือ): วงแหวนความคืบหน้า + ตัวนับ */}
        {phase === "running" && (
          <div className="pj-in absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
            <div className={`${glass} flex items-center gap-4 rounded-3xl p-3`}>
              <Ring
                value={progress}
                size={104}
                stroke={9}
                track="rgba(255,255,255,0.2)"
                color={LIME}
              >
                <span
                  key={count}
                  className={`text-[38px] font-semibold leading-none tabular-nums ${
                    count > 0 ? "pj-pop" : ""
                  }`}
                >
                  {count}
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white/70">
                  {mode === "count" ? `จาก ${target} ครั้ง` : "จำนวนครั้ง"}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[22px] font-semibold tabular-nums">
                      {timerText}
                    </div>
                    <div className="text-[11px] text-white/60">
                      {mode === "time" ? "เหลือ" : "เวลา"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[22px] font-semibold tabular-nums">
                      {livePerMin}
                    </div>
                    <div className="text-[11px] text-white/60">ครั้ง/นาที</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ตั้งมือถือ */}
        {isLevel && (
          <div className="pj-in absolute inset-0 flex flex-col items-center bg-[#F3F6EC] px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-[#1B2A21]">
            <h2 className="text-[22px] font-semibold">ปรับมุมเอียงมือถือ</h2>
            <p className="mt-2 min-h-[24px] text-center text-[17px] font-medium">
              {levelInfo.hint}
            </p>
            <div
              className="mt-3 h-1.5 w-44 overflow-hidden rounded-full bg-[#E3EAD6]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(levelInfo.hold * 100)}
            >
              <div
                className="h-full rounded-full bg-[#3F5E1F] transition-[width] duration-150"
                style={{ width: `${levelInfo.hold * 100}%` }}
              />
            </div>
            <p className="mt-3 text-center text-[13px] leading-5 text-[#6B7A6E]">
              พิงมือถือกับลังหรือผนังให้หงายขึ้นประมาณ {Math.abs(targetLean)}° ตามลูกศร แล้วค้างไว้ให้นิ่ง
            </p>
            {landscape && (
              <p className="mt-1 text-center text-[12px] text-[#D92D20]">
                หมุนมือถือเป็นแนวตั้งจะใช้งานง่ายกว่า
              </p>
            )}

            <div className="mt-4 flex h-3 w-40 items-center justify-center">
              <div
                ref={levelBarRef}
                className={`h-1 w-full rounded-full transition-colors ${
                  levelInfo.rollOk ? "bg-[#3F5E1F]" : "bg-[#C5CFB5]"
                }`}
              />
            </div>

            <div className="relative mt-6 h-[300px] w-[84px] shrink-0 rounded-full bg-[#E3EAD6]">
              <div
                className={`absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-dashed transition-colors ${
                  levelInfo.pitchOk ? "border-[#3F5E1F]" : "border-[#A9B79A]"
                }`}
              />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div
                  ref={levelKnobRef}
                  className={`flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-md transition-colors ${
                    levelInfo.pitchOk
                      ? "bg-[#C9F25B] text-[#1B2A21]"
                      : "bg-white text-[#1B2A21]"
                  }`}
                  style={{ willChange: "transform" }}
                >
                  {levelInfo.dir === "ok" ? (
                    <Icon d={ICONS.check} size={36} />
                  ) : (
                    <span
                      className={levelInfo.dir === "up" ? "rotate-180" : ""}
                    >
                      <Icon d={ICONS.down} size={36} />
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={skipLeveling}
              className="mt-auto h-12 px-6 text-[17px] font-semibold text-[#3F5E1F] active:opacity-60"
            >
              ข้าม
            </button>
          </div>
        )}

        {/* ก่อนเริ่ม (มือถือ): เช็กลิสต์ซ้าย คำแนะนำขวา */}
        {isPrep && (
          <div className="pj-in pointer-events-none absolute left-2 top-[max(0.75rem,env(safe-area-inset-top))] flex w-[96px] flex-col items-start gap-1.5 lg:hidden">
            {checks.map(([label, passed]) => (
              <div
                key={label}
                className={`${glass} flex items-center gap-1 rounded-full py-[3px] pl-1 pr-2 text-[11px] font-medium leading-4`}
              >
                <span
                  aria-hidden
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none transition-colors duration-200 ${
                    passed
                      ? "bg-[#C9F25B] text-black"
                      : "border border-white/60 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
        )}

        {isPrep && (
          <div className="pj-in pointer-events-none absolute right-2 top-[max(0.75rem,env(safe-area-inset-top))] flex w-[112px] flex-col items-end gap-2 lg:hidden">
            <div
              className={`${glass} rounded-2xl px-3 py-1.5 text-right text-[13px] font-semibold leading-[18px]`}
            >
              {placement.hint}
            </div>
            {phase === "positioning" && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-white/25"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(hold * 100)}
              >
                <div
                  className="h-full rounded-full bg-[#C9F25B] transition-[width] duration-150"
                  style={{ width: `${hold * 100}%` }}
                />
              </div>
            )}
            {landscape && (
              <p className="text-right text-[11px] leading-4 text-white/85 drop-shadow">
                หมุนมือถือเป็นแนวตั้งจะใช้งานง่ายกว่า
              </p>
            )}
          </div>
        )}

        {phase === "running" && (!bodyOk || !handsOk) && (
          <div
            role="status"
            className={`${glass} pj-in absolute inset-x-6 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] rounded-2xl px-4 py-3 text-center text-[15px] font-medium lg:bottom-6`}
          >
            {!bodyOk
              ? "ถอยให้เห็นทั้งตัว ตั้งแต่ศีรษะถึงข้อเท้า"
              : "กางมือออกด้านข้างเหมือนจับเชือก ถึงจะนับ"}
          </div>
        )}

        {phase === "loading" && (
          <div className="pj-in absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#F3F6EC] text-[#1B2A21]">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#C9F25B] border-t-[#1B2A21]" />
            <p className="text-[17px] font-medium">กำลังเตรียมกล้อง</p>
          </div>
        )}

        {phase === "countdown" && countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              key={countdown}
              className="pj-pop font-semibold leading-none text-[#C9F25B] drop-shadow-lg"
              style={{ fontSize: "clamp(120px, 40vw, 220px)" }}
            >
              {countdown}
            </span>
          </div>
        )}

        {/* ปุ่มย้อนกลับ ตอนสแกนตัว */}
        {isPrep && (
          <button
            onClick={cancelScan}
            aria-label="ย้อนกลับ"
            className="pj-in absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-10 flex h-12 items-center gap-2 rounded-full bg-white/90 py-1 pl-1 pr-5 text-[16px] font-semibold text-[#1B2A21] backdrop-blur transition-transform active:scale-95 lg:bottom-5 lg:left-5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9F25B]">
              <Icon d={ICONS.left} size={20} />
            </span>
            ย้อนกลับ
          </button>
        )}

        {/* ปุ่มจบ (มือถือ) */}
        {phase === "running" && (
          <div className="pj-in absolute inset-x-0 bottom-0 flex justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
            <button
              onClick={stopEarly}
              className="h-12 w-full max-w-xs rounded-full bg-white/90 text-[16px] font-semibold text-[#1B2A21] backdrop-blur transition-transform active:scale-[0.98]"
            >
              จบการกระโดด
            </button>
          </div>
        )}
      </div>

      {/* แผงด้านข้าง (เดสก์ท็อป) */}
      {(isPrep || phase === "running") && (
        <aside className="pj-in hidden h-full max-h-[880px] w-[360px] shrink-0 flex-col gap-4 text-[#1B2A21] lg:flex">
          <div className="flex items-center gap-2 text-[20px] font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1B2A21] text-[#C9F25B]">
              <Icon d={ICONS.bolt} size={18} />
            </span>
            {APP_NAME}
          </div>

          {isPrep && (
            <>
              <section className="rounded-3xl bg-[#1B2A21] p-5 text-white">
                <p className="text-[13px] text-white/60">เตรียมตัว</p>
                <p className="mt-1 text-[22px] font-semibold leading-snug">
                  {placement.hint}
                </p>
                {phase === "positioning" && (
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(hold * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-[#C9F25B] transition-[width] duration-150"
                      style={{ width: `${hold * 100}%` }}
                    />
                  </div>
                )}
              </section>
              <ul className="divide-y divide-[#EEF2E4] overflow-hidden rounded-3xl bg-white">
                {checks.map(([label, passed]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between px-4 py-3 text-[15px]"
                  >
                    <span>{label}</span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-200 ${
                        passed
                          ? "bg-[#C9F25B] text-[#1B2A21]"
                          : "border border-[#C5CFB5] text-transparent"
                      }`}
                    >
                      <Icon d={ICONS.check} size={14} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === "running" && (
            <>
              <section className="flex flex-col items-center rounded-3xl bg-[#1B2A21] p-6 text-white">
                <Ring
                  value={progress}
                  size={248}
                  stroke={16}
                  track="rgba(255,255,255,0.12)"
                  color={LIME}
                >
                  <span className="text-[13px] text-white/60">จำนวนครั้ง</span>
                  <span
                    key={count}
                    className={`text-[84px] font-semibold leading-none tabular-nums tracking-tight ${
                      count > 0 ? "pj-pop" : ""
                    }`}
                  >
                    {count}
                  </span>
                  <span className="mt-1 text-[13px] text-white/60">
                    {mode === "count" ? `/ ${target} ครั้ง` : "ครั้ง"}
                  </span>
                  <span className="mt-2 rounded-full bg-white/10 px-3 py-0.5 text-[12px] font-semibold text-[#C9F25B]">
                    {Math.round(progress * 100)}%
                  </span>
                </Ring>
              </section>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-4 text-center">
                  <div className="text-[28px] font-semibold tabular-nums">
                    {timerText}
                  </div>
                  <div className="text-[12px] text-[#6B7A6E]">
                    {mode === "time" ? "เวลาที่เหลือ" : "เวลาที่ใช้"}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-4 text-center">
                  <div className="text-[28px] font-semibold tabular-nums">
                    {livePerMin}
                  </div>
                  <div className="text-[12px] text-[#6B7A6E]">ครั้ง/นาที</div>
                </div>
              </div>
              <button
                onClick={stopEarly}
                className="mt-auto h-14 w-full rounded-full bg-white text-[17px] font-semibold transition-all active:scale-[0.98]"
              >
                จบการกระโดด
              </button>
            </>
          )}
        </aside>
      )}
    </div>
  );
}