"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Noto Sans Thai", Sarabun, sans-serif';

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

// ปรับความไวตรงนี้ ยิ่งน้อยยิ่งไว (แต่เสี่ยงนับเกินตอนยืนนิ่ง)
// ค่าเป็นสัดส่วนของความยาวลำตัว (ไหล่ถึงสะโพก)
const MIN_AMPLITUDE = 0.035;
// ห่างขั้นต่ำระหว่างการนับสองครั้ง (มิลลิวินาที) กันนับซ้ำจากสัญญาณสั่น
const MIN_JUMP_INTERVAL_MS = 220;

const TIME_PRESETS = [30, 60, 120, 180];
const COUNT_PRESETS = [50, 100, 200, 500];

type Phase =
  | "setup"
  | "loading"
  | "positioning"
  | "countdown"
  | "running"
  | "summary";
type Mode = "time" | "count";
type EndReason = "time" | "count" | "manual";

type Summary = {
  total: number;
  durationMs: number;
  perMin: number;
  bestTenSec: number;
  consistency: number;
  buckets: number[];
  reason: EndReason;
};

/* ------------------------------------------------------------------ */
/* ตรวจตำแหน่งผู้เล่นก่อนเริ่ม                                             */
/* ------------------------------------------------------------------ */

// ผู้เล่นต้องยืนนิ่งในตำแหน่งที่ถูกต้องต่อเนื่องเท่านี้ ถึงจะเริ่มนับถอยหลัง
const HOLD_MS = 1500;

// ขนาดและตำแหน่งของกรอบรูปคน เทียบกับความสูงของภาพ
// กรอบสูง 83.5% ของภาพ เริ่มที่ 8.5% จากขอบบน (เหลือที่ให้ข้อความด้านบนและปุ่มด้านล่าง)
const GUIDE_TOP = 0.085;
const GUIDE_H = 0.835;

// ความสูงจากจมูกถึงข้อเท้า เทียบกับความสูงของภาพ
// ในกรอบ จมูกอยู่ราว 0.068 ข้อเท้าอยู่ราว 0.94 ของความสูงกรอบ => ราว 0.73 ของภาพ
const MIN_BODY_H = 0.64;
const MAX_BODY_H = 0.82;
// ต้องเหลือที่ว่างเหนือศีรษะและใต้เท้า เพื่อให้กระโดดได้
const MIN_TOP = 0.04;
const MAX_BOTTOM = 0.98;
// ยอมให้สะโพกเยื้องจากกึ่งกลางภาพได้เท่านี้
const CENTER_TOL = 0.1;
// ยอมให้แนวไหล่ถึงข้อเท้าเอียงจากแนวตั้งได้กี่องศา
const TILT_MAX_DEG = 8;

// ท่าจับเชือก (ปรับได้)
// มือแต่ละข้างต้องห่างจากแนวกลางลำตัวอย่างน้อยกี่เท่าของความกว้างไหล่
// แขนห้อยปกติอยู่ราว 0.6 ท่าจับเชือกราว 0.85 ขึ้นไป
const HAND_MIN_OFFSET = 0.75;
// ช่วงความสูงของมือ วัดจากไหล่ลงไปเป็นสัดส่วนของความยาวลำตัว (ไหล่ถึงสะโพก)
const HAND_TOP = 0.45;
const HAND_BOTTOM = 0.35;
// มือบนภาพจับยากกว่าลำตัว จึงยอมรับความมั่นใจต่ำกว่า
const HAND_MIN_VIS = 0.3;

// เปิดเป็น true ถ้าต้องการดูเส้นโครงร่างตอนจูนระบบ
const SHOW_SKELETON = false;

// false = ภาพเต็มจอ ไม่มีแถบดำ (ตัดเฉพาะขอบซ้ายขวาที่เกินจอ ความสูงภาพไม่ถูกตัด จึงไม่ซูมแนวตั้ง)
// true = แสดงภาพเต็มเฟรมทั้งภาพ แต่จะมีแถบดำบนล่าง
const FORCE_CONTAIN = false;

type Placement = {
  visible: boolean;
  distance: boolean;
  centered: boolean;
  upright: boolean;
  hands: boolean;
  ok: boolean;
  hint: string;
};

const EMPTY_PLACEMENT: Placement = {
  visible: false,
  distance: false,
  centered: false,
  upright: false,
  hands: false,
  ok: false,
  hint: "ยืนให้กล้องเห็นตัว",
};

// ท่าจับเชือก: มือสองข้างอยู่ระดับเอว ห่างจากแนวกลางลำตัวออกไปด้านข้าง
// แขนที่ห้อยลงตามธรรมชาติจะอยู่ใกล้ลำตัวกว่านี้ จึงไม่ผ่านเงื่อนไข
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
  if (dl * dr >= 0) return false; // ต้องอยู่คนละข้างของลำตัว

  const minOffset = HAND_MIN_OFFSET * shoulderW;
  if (Math.abs(dl) < minOffset || Math.abs(dr) < minOffset) return false;

  const yMin = sy + HAND_TOP * torso;
  const yMax = hy + HAND_BOTTOM * torso;
  return lw.y >= yMin && lw.y <= yMax && rw.y >= yMin && rw.y <= yMax;
}

function evaluatePlacement(
  lm: NormalizedLandmark[] | undefined,
  aspect: number,
  mirrored: boolean
): Placement {
  if (!lm) return EMPTY_PLACEMENT;

  const need = [0, 11, 12, 23, 24, 27, 28];
  const visible = need.every((i) => (lm[i]?.visibility ?? 0) > 0.5);
  if (!visible) {
    return {
      ...EMPTY_PLACEMENT,
      hint: "ให้กล้องเห็นตั้งแต่ศีรษะถึงข้อเท้า",
    };
  }

  const top = lm[0].y;
  const bottom = Math.max(lm[27].y, lm[28].y);
  const bodyH = bottom - top;
  const tooBig = bodyH > MAX_BODY_H || top < MIN_TOP || bottom > MAX_BOTTOM;
  const tooSmall = bodyH < MIN_BODY_H;
  const distance = !tooBig && !tooSmall;

  // กล้องหน้าแสดงภาพกลับซ้ายขวาเหมือนส่องกระจก กล้องหลังไม่กลับ
  const hipX = (lm[23].x + lm[24].x) / 2;
  const shownX = mirrored ? 1 - hipX : hipX;
  const centered = Math.abs(shownX - 0.5) <= CENTER_TOL;

  // มุมเอียงของแนวไหล่ถึงข้อเท้า ใช้ตรวจว่ากล้องตั้งตรงและผู้เล่นยืนตรง
  const sx = (lm[11].x + lm[12].x) / 2;
  const sy = (lm[11].y + lm[12].y) / 2;
  const ax = (lm[27].x + lm[28].x) / 2;
  const ay = (lm[27].y + lm[28].y) / 2;
  const tilt =
    (Math.abs(Math.atan2((sx - ax) * aspect, ay - sy)) * 180) / Math.PI;
  const upright = tilt <= TILT_MAX_DEG;

  const hands = isHoldingRope(lm, aspect);

  let hint = "พร้อมแล้ว ยืนนิ่งๆ";
  if (tooBig) hint = "ถอยหลังอีกนิด";
  else if (tooSmall) hint = "เข้ามาใกล้อีกนิด";
  else if (!centered) {
    hint = shownX > 0.5 ? "ขยับไปทางซ้ายของจอ" : "ขยับไปทางขวาของจอ";
  } else if (!upright) {
    hint = "ตั้งมือถือให้ตรง ไม่เอียง";
  } else if (!hands) {
    hint = "ถือมือเหมือนจับเชือกที่ระดับเอว กางศอกออกเล็กน้อย";
  }

  return {
    visible,
    distance,
    centered,
    upright,
    hands,
    ok: distance && centered && upright && hands,
    hint,
  };
}

/* ------------------------------------------------------------------ */
/* กรอบรูปคน                                                            */
/* ------------------------------------------------------------------ */

// วาดชิ้นส่วนของรูปคนสมส่วน (ประมาณ 7.5 หัว) ท่ายืนถือเชือกที่ระดับเอว
// ทุกชิ้นวาดด้วยสีดำทึบ แล้วให้ buildGuide เบลอรวมกันเป็นรูปเดียวที่ขอบเรียบต่อเนื่อง
// dx ใช้เลื่อนไปวาดนอกจอ เพราะเราต้องการแค่เงาเบลอของมัน
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

  // ศีรษะและคอ
  ctx.beginPath();
  ctx.ellipse(X(0), Y(0.068), 0.054 * ht, 0.068 * ht, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(X(-0.026), Y(0.12), 0.052 * ht, 0.075 * ht);

  // ลำตัว
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
    // แขน: ศอกชิดลำตัว มือยื่นออกด้านข้างที่ระดับเอวเหมือนจับเชือก
    limb(
      [
        [s * 0.13, 0.21],
        [s * 0.158, 0.36],
        [s * 0.225, 0.5],
      ],
      0.056
    );
    // ขา
    limb(
      [
        [s * 0.05, 0.52],
        [s * 0.062, 0.735],
        [s * 0.06, 0.94],
      ],
      0.092
    );
    // เท้า
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

// สร้างภาพกรอบครั้งเดียวต่อขนาดภาพ แล้วเก็บไว้ใช้ซ้ำทุกเฟรม
// ขั้นตอน: วาดชิ้นส่วนเป็นเงาเบลอ -> ตัดที่ระดับครึ่งหนึ่งได้รูปคนขอบมน ข้อต่อเนียน
// -> ขยายขอบออกเป็นเส้นกรอบเส้นเดียวต่อเนื่อง -> เจาะรูปคนให้เห็นภาพกล้อง
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

  // 1) เงาเบลอของรูปคน (วาดตัวจริงไว้นอกจอ เหลือแต่เงาในจอ)
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

  // 2) ตัดที่ระดับครึ่งหนึ่งของความเข้มเงา ได้รูปคนที่ขอบเรียบ (ขอบนุ่มเล็กน้อยกันแตก)
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

  // 3) ประกอบภาพกรอบตามสี
  const compose = (color: string) => {
    const out = make();
    const c = out.getContext("2d")!;
    c.fillStyle = "rgba(18,18,20,0.55)";
    c.fillRect(0, 0, w, h);

    // ขยายขอบรูปคนออกรอบทิศ ได้วงแหวนเส้นเดียวที่ต่อเนื่อง
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
    // เจาะรูปคนให้เห็นภาพกล้องชัดเต็มๆ
    c.globalCompositeOperation = "destination-out";
    c.drawImage(mask, 0, 0);
    return out;
  };

  return { w, h, ok: compose("#30D158"), idle: compose("#FFFFFF") };
}

// พื้นที่นอกรูปคนเป็นสีเทาดำโปร่ง ส่วนในรูปคนเห็นภาพกล้องชัดเต็มๆ
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

// หลักการ: ใช้ตำแหน่งแนวตั้งเฉลี่ยของไหล่ สะโพก และข้อเท้า เป็นสัญญาณเดียว
// แล้วติดตามขอบบน (พื้น) กับขอบล่าง (จุดสูงสุดของการกระโดด) แบบค่อยๆ ลดลง
// เมื่อสัญญาณข้ามจุดกลางลงมาแล้วกลับขึ้นไป ถือว่ากระโดดครบ 1 ครั้งตอนลงพื้น
// และนับเฉพาะตอนที่ผู้เล่นอยู่ในท่าจับเชือก (มืออยู่ระดับเอวและกางออกด้านข้าง)
// กระโดดเฉยๆ โดยแขนห้อยหรือมือไม่อยู่ในท่า จะไม่นับ
function createJumpDetector() {
  let ready = false;
  let lastT = 0;
  let ema = 0;
  let hi = 0; // ตำแหน่งต่ำสุดในภาพ (y มาก) = พื้น
  let lo = 0; // ตำแหน่งสูงสุดในภาพ (y น้อย) = ลอยสูงสุด
  let air = false;
  let lastCount = -1e9;
  let handsScore = 0; // 0-1 ความมั่นใจว่ากำลังอยู่ในท่าจับเชือก

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
      // ไกลเกินไป หรือท่าทางผิดปกติ
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

  // ความสม่ำเสมอของจังหวะ: 100 - สัมประสิทธิ์การกระจายของช่วงเวลาระหว่างกระโดด
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

/* ------------------------------------------------------------------ */
/* หน้าหลัก                                                              */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<Mode>("time");
  const [seconds, setSeconds] = useState(60);
  const [target, setTarget] = useState(100);
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
  const lastWarnRef = useRef(-1);
  const phaseRef = useRef<Phase>("setup");
  const placementKeyRef = useRef("");
  const okSinceRef = useRef<number | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  const holdRef = useRef(0);
  const abortCountdownRef = useRef(false);
  const readyResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    settingsRef.current = { mode, seconds, target, facing, sound };
  }, [mode, seconds, target, facing, sound]);

  // จำค่าที่ตั้งไว้ครั้งก่อน
  useEffect(() => {
    try {
      const raw = localStorage.getItem("jump-rope-settings");
      if (!raw) return;
      const v = JSON.parse(raw);
      if (v.mode === "time" || v.mode === "count") setMode(v.mode);
      if (typeof v.seconds === "number") setSeconds(v.seconds);
      if (typeof v.target === "number") setTarget(v.target);
      if (v.facing === "user" || v.facing === "environment")
        setFacing(v.facing);
      if (typeof v.sound === "boolean") setSound(v.sound);
    } catch {
      // อ่านค่าเดิมไม่ได้ก็ใช้ค่าเริ่มต้น
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "jump-rope-settings",
        JSON.stringify({ mode, seconds, target, facing, sound })
      );
    } catch {
      // บันทึกไม่ได้ก็ข้ามไป
    }
  }, [mode, seconds, target, facing, sound]);

  // ตรวจว่ามือถืออยู่แนวนอนหรือไม่
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const update = () => setLandscape(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ขนาดหน้าจอ ใช้เลือกว่าจะให้ภาพเต็มจอหรือเห็นครบ
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // สลับแอปแล้วกลับมา ต้องขอล็อกหน้าจอใหม่ ไม่งั้นจอดับระหว่างเล่น
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

      // ขั้นตอนจัดตำแหน่งและนับถอยหลัง: วาดกรอบ ตรวจตำแหน่ง ตัดสินว่าพร้อมหรือไม่
      const ph = phaseRef.current;
      if (ph === "positioning" || ph === "countdown") {
        const pl = evaluatePlacement(
          pts,
          w / h,
          settingsRef.current.facing === "user"
        );
        if (ctx) drawGuide(ctx, w, h, pl.ok);

        const key = `${+pl.visible}${+pl.distance}${+pl.centered}${+pl.upright}${+pl.hands}${pl.hint}`;
        if (key !== placementKeyRef.current) {
          placementKeyRef.current = key;
          setPlacement(pl);
        }

        if (ph === "positioning") {
          if (pl.ok) {
            if (okSinceRef.current === null) {
              okSinceRef.current = now;
              // เสียงบอกว่ายืนถูกตำแหน่งแล้ว เผื่อผู้เล่นยืนไกลจนอ่านจอไม่ทัน
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
          // ออกนอกตำแหน่งระหว่างนับถอยหลัง ให้กลับไปจัดตำแหน่งใหม่
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
          ctx.strokeStyle = r.air ? "#30D158" : "#FFFFFF";
          for (const { start, end } of connectionsRef.current) {
            if (start < 11 || end < 11) continue; // ไม่วาดใบหน้า
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
            // ติ๊กเบาๆ ทุกครั้ง และเสียงสูงยาวขึ้นทุก 10 ครั้ง
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
        // เตือน 3 วินาทีสุดท้าย
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
    // ปลดการรอจัดตำแหน่งที่ค้างอยู่ (ถ้ามี)
    const pending = readyResolveRef.current;
    readyResolveRef.current = null;
    pending?.();
    stopCamera();
  }, [stopCamera]);

  useEffect(() => stopAll, [stopAll]);

  const startSession = useCallback(async () => {
    const sid = ++sessionRef.current;
    const cancelled = () => sessionRef.current !== sid;

    // ขอเต็มจอและล็อกแนวตั้ง ต้องเรียกตอนผู้ใช้กดปุ่ม
    // Android และเดสก์ท็อปใช้ได้ iPhone ไม่รองรับ จะข้ามไปเอง
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
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

    // AudioContext ต้องสร้างจากการกดปุ่มของผู้ใช้ มือถือถึงจะยอมให้เล่นเสียง
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    }
    audioRef.current?.resume().catch(() => {});

    await sleep(50); // รอให้ <video> ถูก mount

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
          // ภาพแนวตั้ง 3:4 ตามสัดส่วนเซนเซอร์จริงของมือถือ ได้มุมกว้างเต็ม ไม่ถูกครอปจนดูซูม
          // (เดิมขอ 9:16 ทำให้เบราว์เซอร์ตัดบนล่างของภาพทิ้งไปราว 25%)
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

      // ถ้ากล้องรองรับซูม ให้ตั้งไว้ที่ต่ำสุด (บางเครื่องคือมุมกว้างพิเศษ) ไม่รองรับก็ข้าม
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

      // รอให้ผู้เล่นยืนตรงกรอบจนผ่าน แล้วนับ 3-2-1
      // ถ้าขยับออกนอกตำแหน่งระหว่างนับ จะกลับไปจัดตำแหน่งใหม่
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
      setPhase("setup");
    }
  }, [loop, stopAll, facing]);

  const cancelSession = () => {
    stopAll();
    setCountdown(null);
    setPhase("setup");
  };

  const stopEarly = () => {
    finish("manual", performance.now() - startRef.current);
  };

  /* ---------------------------- หน้าตั้งค่า ---------------------------- */

  const presets = mode === "time" ? TIME_PRESETS : COUNT_PRESETS;
  const value = mode === "time" ? seconds : target;
  const step = 10;
  const setValue = (n: number) => {
    const v = Math.max(5, Math.min(mode === "time" ? 3600 : 10000, n || 5));
    if (mode === "time") setSeconds(v);
    else setTarget(v);
  };

  const fontStyle = { fontFamily: FONT, touchAction: "manipulation" as const };

  if (phase === "setup") {
    return (
      <div
        style={fontStyle}
        className="min-h-dvh select-none bg-[#F5F5F7] text-[#1D1D1F] antialiased"
      >
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">
            กระโดดเชือก
          </h1>

          {/* ตัวเลือกโหมดแบบ segmented control ของ iOS */}
          <div className="mt-6 grid grid-cols-2 rounded-[10px] bg-[#7676801F] p-0.5">
            {(
              [
                ["time", "เวลา"],
                ["count", "จำนวนครั้ง"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`h-9 rounded-[8px] text-[15px] font-medium transition-all ${
                  mode === m ? "bg-white shadow-sm" : "text-[#1D1D1F]/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ค่าที่ตั้ง */}
          <section className="mt-6 rounded-2xl bg-white px-4 py-8">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setValue(value - step)}
                aria-label="ลดลง"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F7] text-3xl font-light text-[#007AFF] active:bg-[#E8E8ED]"
              >
                −
              </button>
              <div className="text-center">
                <div className="text-[64px] font-semibold leading-none tabular-nums tracking-tight">
                  {mode === "time" ? formatTime(seconds * 1000) : target}
                </div>
                <div className="mt-2 text-[15px] text-[#6E6E73]">
                  {mode === "time" ? "นาที : วินาที" : "ครั้ง"}
                </div>
              </div>
              <button
                onClick={() => setValue(value + step)}
                aria-label="เพิ่มขึ้น"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F7] text-3xl font-light text-[#007AFF] active:bg-[#E8E8ED]"
              >
                +
              </button>
            </div>

            <div className="mt-8 flex justify-center gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setValue(p)}
                  className={`h-8 rounded-full px-4 text-[15px] font-medium transition-colors ${
                    value === p
                      ? "bg-[#007AFF] text-white"
                      : "bg-[#F5F5F7] text-[#007AFF]"
                  }`}
                >
                  {mode === "time" ? formatTime(p * 1000) : p}
                </button>
              ))}
            </div>
          </section>

          <ul className="mt-4 divide-y divide-[#3C3C4329] overflow-hidden rounded-2xl bg-white">
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">กล้อง</span>
              <div className="grid w-40 grid-cols-2 rounded-[8px] bg-[#7676801F] p-0.5">
                {(
                  [
                    ["user", "หน้า"],
                    ["environment", "หลัง"],
                  ] as const
                ).map(([f, label]) => (
                  <button
                    key={f}
                    onClick={() => setFacing(f)}
                    className={`h-8 rounded-[6px] text-[14px] font-medium transition-all ${
                      facing === f ? "bg-white shadow-sm" : "text-[#1D1D1F]/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[17px]">เสียงนับและเตือน</span>
              <button
                role="switch"
                aria-checked={sound}
                aria-label="เสียงนับและเตือน"
                onClick={() => setSound(!sound)}
                className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${
                  sound ? "bg-[#34C759]" : "bg-[#78788029]"
                }`}
              >
                <span
                  className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${
                    sound ? "left-[22px]" : "left-[2px]"
                  }`}
                />
              </button>
            </li>
          </ul>

          <div className="mt-4 space-y-1 px-2 text-[13px] leading-5 text-[#6E6E73]">
            <p>วางมือถือแนวตั้ง สูงระดับเอว พิงของให้นิ่งและไม่เอียง ยืนห่างจนตัวเต็มรูปคนบนจอ</p>
            <p>เปิดไฟให้สว่าง อย่าให้แสงจ้าอยู่ด้านหลังตัว</p>
            <p>ถือเชือกที่ระดับเอวและกางศอกออกเล็กน้อย กระโดดเฉยๆ โดยไม่ถือเชือก แอปจะไม่นับ</p>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-2xl bg-white px-4 py-3 text-[15px] text-[#FF3B30]"
            >
              {error}
            </p>
          )}

          <button
            onClick={startSession}
            className="mt-auto h-14 w-full rounded-full bg-[#007AFF] text-[17px] font-semibold text-white transition-colors active:bg-[#0062CC]"
          >
            เริ่ม
          </button>
        </main>
      </div>
    );
  }

  /* ----------------------------- หน้าสรุปผล ---------------------------- */

  if (phase === "summary" && summary) {
    const maxBucket = Math.max(1, ...summary.buckets);
    const reasonLabel =
      summary.reason === "time"
        ? "ครบเวลา"
        : summary.reason === "count"
          ? "ครบจำนวนครั้ง"
          : "หยุดเอง";

    const rows: [string, string][] = [
      ["เวลาที่ใช้", formatTime(summary.durationMs)],
      ["เฉลี่ยต่อนาที", `${summary.perMin} ครั้ง`],
      ["10 วินาทีที่เร็วสุด", `${summary.bestTenSec} ครั้ง`],
      [
        "จังหวะสม่ำเสมอ",
        summary.total >= 5 ? `${summary.consistency}%` : "-",
      ],
    ];

    return (
      <div
        style={fontStyle}
        className="min-h-dvh select-none bg-[#F5F5F7] text-[#1D1D1F] antialiased"
      >
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">
            สรุปผล
          </h1>
          <p className="text-[15px] text-[#6E6E73]">{reasonLabel}</p>

          <div className="mt-6 text-center">
            <div className="text-[96px] font-semibold leading-none tabular-nums tracking-tight">
              {summary.total}
            </div>
            <div className="mt-1 text-[17px] text-[#6E6E73]">ครั้ง</div>
          </div>

          <ul className="mt-8 divide-y divide-[#3C3C4329] overflow-hidden rounded-2xl bg-white">
            {rows.map(([label, val]) => (
              <li
                key={label}
                className="flex items-center justify-between px-4 py-3.5 text-[17px]"
              >
                <span>{label}</span>
                <span className="font-medium tabular-nums text-[#6E6E73]">
                  {val}
                </span>
              </li>
            ))}
          </ul>

          <section className="mt-4 rounded-2xl bg-white px-4 py-4">
            <h2 className="text-[15px] font-semibold">
              จำนวนครั้งในแต่ละ 10 วินาที
            </h2>
            <div className="mt-4 flex h-32 items-end gap-1.5">
              {summary.buckets.map((n, i) => (
                <div
                  key={i}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="text-[11px] tabular-nums text-[#6E6E73]">
                    {n}
                  </span>
                  <div
                    className="w-full rounded-full bg-[#007AFF]"
                    style={{ height: `${(n / maxBucket) * 100}%`, minHeight: 4 }}
                  />
                </div>
              ))}
            </div>
          </section>

          <div className="mt-auto flex flex-col gap-1 pt-8">
            <button
              onClick={startSession}
              className="h-14 w-full rounded-full bg-[#007AFF] text-[17px] font-semibold text-white transition-colors active:bg-[#0062CC]"
            >
              เริ่มอีกรอบ
            </button>
            <button
              onClick={() => setPhase("setup")}
              className="h-12 w-full text-[17px] font-medium text-[#007AFF]"
            >
              เปลี่ยนการตั้งค่า
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

  const progress =
    phase !== "running"
      ? 0
      : mode === "time"
        ? Math.min(1, elapsed / (seconds * 1000))
        : Math.min(1, count / target);

  const glass = "bg-black/35 backdrop-blur-xl";
  const isPrep = phase === "positioning" || phase === "countdown";
  const flip = facing === "user" ? "-scale-x-100" : "";
  // จอสูงกว่าภาพ (มือถือแนวตั้ง) ให้ภาพเต็มจอ จอกว้างกว่าภาพ (แท็บเล็ต เดสก์ท็อป) ให้เห็นภาพครบ
  // FORCE_CONTAIN = true แสดงภาพเต็มเฟรมไม่ครอปข้าง (จอยาวๆ จะมีแถบดำบนล่าง)
  const fit =
    FORCE_CONTAIN || (vp.w > 0 && vp.w / vp.h > vdim.w / vdim.h)
      ? "object-contain"
      : "object-cover";

  const checks: [string, boolean][] = [
    ["เห็นทั้งตัว", placement.visible],
    ["ระยะพอดี", placement.distance],
    ["อยู่กลางกรอบ", placement.centered],
    ["กล้องตั้งตรง", placement.upright],
    ["ท่าจับเชือก", placement.hands],
  ];

  return (
    <div
      style={{ ...fontStyle, touchAction: "none", overscrollBehavior: "none" }}
      className="fixed inset-0 select-none overflow-hidden bg-black text-white antialiased"
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

      {/* ตอนกระโดด: เวลาซ้าย ตัวนับขวา เว้นกลางจอไว้ให้เห็นผู้เล่น */}
      {phase === "running" && (
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/65 via-black/30 to-transparent px-4 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between">
            <div
              className={`${glass} rounded-full px-4 py-1.5 text-[22px] font-semibold tabular-nums`}
            >
              {timerText}
            </div>
            <div className="text-right">
              <div
                className="font-semibold leading-none tabular-nums tracking-tight drop-shadow-lg"
                style={{ fontSize: "clamp(64px, 11dvh, 104px)" }}
              >
                {count}
              </div>
              <div className="mt-1 text-[13px] text-white/80 drop-shadow">
                {mode === "count" ? `จาก ${target} ครั้ง` : "ครั้ง"}
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-[#30D158]"
              style={{
                width: `${progress * 100}%`,
                transition: "width 150ms linear",
              }}
            />
          </div>
        </div>
      )}

      {/* ก่อนเริ่ม: คำแนะนำสั้นๆ อยู่บนสุดบรรทัดเดียว ไม่บังกรอบรูปคน */}
      {isPrep && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div
            className={`${glass} max-w-full rounded-full px-3.5 py-1 text-center text-[14px] font-semibold leading-5`}
          >
            {placement.hint}
          </div>
          {landscape && (
            <p className="text-center text-[11px] text-white/85 drop-shadow">
              หมุนมือถือเป็นแนวตั้งจะใช้งานง่ายกว่า
            </p>
          )}
        </div>
      )}

      {/* ก่อนเริ่ม: สถานะทั้งหมดอยู่แถบด้านซ้าย ปล่อยกลางจอให้กรอบรูปคนเต็มที่ */}
      {isPrep && (
        <div className="pointer-events-none absolute left-2 top-[max(3.25rem,calc(env(safe-area-inset-top)+2.75rem))] flex w-[104px] flex-col items-start gap-1.5">
          {checks.map(([label, passed]) => (
            <div
              key={label}
              className={`${glass} flex items-center gap-1 rounded-full py-[3px] pl-1 pr-2 text-[11px] font-medium leading-4`}
            >
              <span
                aria-hidden
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] leading-none ${
                  passed
                    ? "bg-[#30D158] text-black"
                    : "border border-white/60 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="whitespace-nowrap">{label}</span>
            </div>
          ))}
          {phase === "positioning" && (
            <div
              className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/25"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hold * 100)}
            >
              <div
                className="h-full rounded-full bg-[#30D158] transition-[width] duration-150"
                style={{ width: `${hold * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* คำเตือนระหว่างกระโดด อยู่ด้านล่างเหนือปุ่ม */}
      {phase === "running" && (!bodyOk || !handsOk) && (
        <div
          role="status"
          className={`${glass} absolute inset-x-6 bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] rounded-2xl px-4 py-3 text-center text-[15px] font-medium`}
        >
          {!bodyOk
            ? "ถอยให้เห็นทั้งตัว ตั้งแต่ศีรษะถึงข้อเท้า"
            : "ถือมือเหมือนจับเชือกที่ระดับเอว ถึงจะนับ"}
        </div>
      )}

      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
          <p className="text-[17px]">กำลังเตรียมกล้อง</p>
        </div>
      )}

      {phase === "countdown" && countdown !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="font-semibold leading-none drop-shadow-lg"
            style={{ fontSize: "clamp(120px, 40vw, 220px)" }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* ปุ่มล่าง เล็กลงเพื่อไม่บังเท้า */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {phase === "running" ? (
          <button
            onClick={stopEarly}
            className={`${glass} h-12 w-full max-w-xs rounded-full text-[17px] font-semibold text-[#FF453A] active:bg-black/50`}
          >
            สิ้นสุด
          </button>
        ) : (
          <button
            onClick={cancelSession}
            className={`${glass} h-10 w-36 rounded-full text-[16px] font-semibold active:bg-black/50`}
          >
            ยกเลิก
          </button>
        )}
      </div>
    </div>
  );
}