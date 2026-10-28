"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { APP_NAME, ICONS, Icon, Logo } from "./auth-shared";
import { gameDayKey, gameDayStart } from "./goal";

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

// สี
const LIME = "#C9F25B";

/* ------------------------------------------------------------------ */
/* ชนิดข้อมูล (ซ้ำกับ app/page.tsx เพราะไฟล์ page.tsx export ได้แค่ default) */
/* ------------------------------------------------------------------ */

type Phase = "loading" | "leveling" | "positioning" | "countdown" | "running";
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
  record: boolean;
};

type PoseSettings = {
  mode: Mode;
  seconds: number;
  target: number;
  dailyGoal: number;
  facing: "user" | "environment";
  sound: boolean;
};

// ภาพยืนยันของวันนี้: ภาพแรกของวัน (ครั้งเดียว) + ภาพตอนใกล้ถึงเป้าประจำวัน (ครั้งเดียว)
type DayShots = { day: string; start: string | null; end: string | null };

type PoseProps = {
  settings: PoseSettings;
  audioRef: { current: AudioContext | null };
  // ผลของ Pose.prime() ที่เรียกตอนผู้ใช้แตะปุ่มเริ่ม
  gyroPromise: Promise<boolean>;
  shotsRef: { current: DayShots };
  // ยอดรวมวันนี้ก่อนเริ่มรอบนี้
  getTodayBase: () => number;
  onShot: (kind: "start" | "end", img: string | null) => void;
  onVideoSize: (w: number, h: number) => void;
  onFinish: (result: Summary) => void;
  // รอบที่ข้ามเวลารีเซ็ต 06:00 น. เป็นโมฆะ ไม่เรียก onFinish ไม่บันทึกคะแนน
  onVoid: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

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

// ตั้งมือถือไม่ผ่านเกินเวลานี้ → แสดงปุ่มข้าม
const GYRO_SKIP_MS = 30_000;
// รอสัญญาณไจโรแรกหลังได้สิทธิ์ ไม่มีสัญญาณ = เครื่องไม่มีเซนเซอร์ (ข้ามหน้าตั้งมือถือ)
const GYRO_WAIT_MS = 2000;

// ท่าจับเชือก
const HAND_MIN_OFFSET = 0.75;
const HAND_MIN_VIS = 0.3;

const SHOW_SKELETON = false;
// true = กล้องหน้าแสดงภาพเต็มไม่ครอป (ไม่ซูม) อาจมีแถบดำ กล้องหลังใช้ logic เดิม
const FORCE_CONTAIN = true;

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

// wait = กำลังขอสิทธิ์/รอสัญญาณ, ok = มีสัญญาณ, denied = ไม่ได้สิทธิ์, none = เครื่องไม่มีเซนเซอร์
type GyroState = "wait" | "ok" | "denied" | "none";

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

// key ของ "วันเกม" (รีเซ็ต 06:00 น. เวลาไทย) ใช้เทียบกับ shots.day
// ต้องตรงกับ dayKey ใน app/page.tsx (ทั้งคู่ใช้ gameDayKey จาก ./goal)
const dayKey = gameDayKey;

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

// iOS 13+ ต้องขอสิทธิ์ไจโรด้วยการแตะ (มี requestPermission) เครื่องอื่นไม่มี API นี้
// ใช้แยกว่า "ผู้ใช้ปฏิเสธสิทธิ์" (iOS) กับ "เครื่องไม่มีไจโร" (PC / มือถือไม่มีเซนเซอร์)
function needsGyroPermission(): boolean {
  try {
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: unknown;
    };
    return typeof DOE?.requestPermission === "function";
  } catch {
    return false;
  }
}

// งานที่ต้องทำทันทีที่ผู้ใช้แตะปุ่มเริ่ม (ก่อน await ใดๆ) เรียกจาก app/page.tsx ผ่าน Pose.prime
// ขอสิทธิ์ไจโร เต็มจอ+ล็อกแนวตั้ง และเตรียมเสียง คืน Promise ของสิทธิ์ไจโรให้ส่งเข้า Pose
function primeSession(
  facing: "user" | "environment",
  audioRef: { current: AudioContext | null }
): Promise<boolean> {
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

  if (!audioRef.current) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) audioRef.current = new Ctor();
  }
  audioRef.current?.resume().catch(() => {});

  return gyroPromise;
}

// โหลดโมเดลครั้งเดียวแล้วใช้ซ้ำทุกรอบ (เก็บไว้ที่ระดับโมดูล ไม่หายตอนคอมโพเนนต์ถูกถอด)
type LandmarkerBundle = {
  lm: PoseLandmarker;
  connections: { start: number; end: number }[];
};
let landmarkerPromise: Promise<LandmarkerBundle> | null = null;

function loadLandmarker(): Promise<LandmarkerBundle> {
  if (!landmarkerPromise) {
    const p = (async () => {
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
      let lm: PoseLandmarker;
      try {
        lm = await make("GPU");
      } catch {
        lm = await make("CPU");
      }
      const connections = vision.PoseLandmarker.POSE_CONNECTIONS.map(
        (c: { start: number; end: number }) => ({
          start: c.start,
          end: c.end,
        })
      );
      return { lm, connections };
    })();
    landmarkerPromise = p;
    // โหลดพลาดแล้วให้รอบหน้าลองใหม่ได้
    p.catch(() => {
      if (landmarkerPromise === p) landmarkerPromise = null;
    });
  }
  return landmarkerPromise;
}

/* ------------------------------------------------------------------ */
/* ส่วนประกอบ UI                                                         */
/* ------------------------------------------------------------------ */

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

// รูปตัวอย่างการตั้งมือถือ (public/img/phone.png) ใช้ในขั้นตอนปรับมุมเอียง
function PhoneExample() {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <figure className="w-full shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/img/phone.png"
        alt="ตัวอย่างการตั้งมือถือ"
        draggable={false}
        onError={() => setOk(false)}
        className="mx-auto max-h-[170px] w-auto max-w-full rounded-2xl object-contain"
      />
      <figcaption className="mt-1.5 text-center text-[12px] text-[#6B7A6E]">
        ตัวอย่างการตั้งมือถือ
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* หน้าสแกนตัว + นับการกระโดด                                            */
/* ------------------------------------------------------------------ */

function PoseSession(props: PoseProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bodyOk, setBodyOk] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [placement, setPlacement] = useState<Placement>(EMPTY_PLACEMENT);
  const [hold, setHold] = useState(0);
  const [landscape, setLandscape] = useState(false);
  const [handsOk, setHandsOk] = useState(false);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [vdim, setVdim] = useState({ w: 9, h: 16 });
  const [levelInfo, setLevelInfo] = useState<LevelInfo>(EMPTY_LEVEL);
  const [gyroState, setGyroState] = useState<GyroState>("wait");
  const [canSkip, setCanSkip] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const connectionsRef = useRef<{ start: number; end: number }[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef(createJumpDetector());
  // ยอดรวมวันนี้ก่อนเริ่มรอบปัจจุบัน
  const todayBaseRef = useRef(0);
  // เวลาสิ้นสุดวันเกมของรอบปัจจุบัน (epoch ms) = 06:00 น. ถัดไป
  // ถ้ารอบยังวิ่งอยู่ตอนถึงเวลานี้ รอบนั้นเป็นโมฆะ
  const dayEndRef = useRef(Infinity);

  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const startRef = useRef(0);
  const jumpsRef = useRef<number[]>([]);
  const lastVideoTimeRef = useRef(-1);
  const lastTickRef = useRef(-1);
  const bodyOkRef = useRef(false);
  const handsOkRef = useRef(false);
  const settingsRef = useRef(props.settings);
  const P = useRef(props);
  const lastWarnRef = useRef(-1);
  const phaseRef = useRef<Phase>("loading");
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

  // ให้ callback ด้านล่างอ่านค่า props ล่าสุดได้โดยไม่ต้องสร้างฟังก์ชันใหม่
  useEffect(() => {
    P.current = props;
    settingsRef.current = props.settings;
  });

  const { mode, seconds, target, facing } = props.settings;

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

  // ถ่ายภาพนิ่งจากวิดีโอ (กลับด้านเหมือนที่เห็นบนจอถ้าเป็นกล้องหน้า) พร้อมประทับเวลา
  const captureShot = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    try {
      const scale = Math.min(1, 480 / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      if (settingsRef.current.facing === "user") {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const label = new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const fs = Math.max(12, Math.round(w / 26));
      const pad = Math.round(fs * 0.5);
      ctx.font = `600 ${fs}px sans-serif`;
      ctx.textBaseline = "top";
      const boxW = ctx.measureText(label).width + pad * 2;
      const boxH = fs + pad;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(pad, h - pad - boxH, boxW, boxH);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, pad * 2, h - pad - boxH + pad / 2);
      return c.toDataURL("image/jpeg", 0.75);
    } catch {
      return null;
    }
  }, []);

  const finish = useCallback(
    (reason: EndReason, durationMs: number) => {
      if (!runningRef.current) return;
      runningRef.current = false;
      const result = summarize(jumpsRef.current, durationMs, reason);

      if (settingsRef.current.sound) beep(P.current.audioRef.current, 660, 0.5);
      stopCamera();
      // บันทึกประวัติ ส่งเซิร์ฟเวอร์ และแสดงหน้าสรุป เป็นหน้าที่ของ app/page.tsx
      P.current.onFinish(result);
    },
    [stopCamera]
  );

  // รอบที่ยังวิ่งอยู่ตอนถึง 06:00 น. เป็นโมฆะ: ปิดกล้อง ไม่ส่งผล ไม่บันทึกคะแนน
  // แจ้ง app/page.tsx ให้กลับหน้าหลักพร้อมข้อความ
  const voidRound = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (settingsRef.current.sound) beep(P.current.audioRef.current, 440, 0.4);
    stopCamera();
    P.current.onVoid();
  }, [stopCamera]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    const now = performance.now();
    const audio = P.current.audioRef;

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
              if (settingsRef.current.sound) beep(audio.current, 800, 0.08);
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
            if (n % 10 === 0) beep(audio.current, 1320, 0.15);
            else beep(audio.current, 1000, 0.04);
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
      // ถึง 06:00 น. ระหว่างรอบ: รอบนี้ข้ามวันเกม เป็นโมฆะทันที
      if (Date.now() >= dayEndRef.current) {
        voidRound();
        return;
      }

      const el = now - startRef.current;
      const tick = Math.floor(el / 100);
      if (tick !== lastTickRef.current) {
        lastTickRef.current = tick;
        setElapsed(el);
      }
      const s = settingsRef.current;
      // ภาพใกล้ถึงเป้าประจำวัน: ถ่ายครั้งเดียวต่อวัน เมื่อยอดรวมวันนี้ (รวมรอบก่อนหน้า) ถึง 90% ของเป้า
      // ไม่ถ่ายตอนกดจบเอง เพราะผู้ใช้อาจแบ่งโดดหลายช่วง
      const shots = P.current.shotsRef.current;
      if (
        jumpsRef.current.length > 0 &&
        !(shots.day === dayKey(Date.now()) && shots.end) &&
        todayBaseRef.current + jumpsRef.current.length >=
          Math.ceil(s.dailyGoal * 0.9)
      ) {
        P.current.onShot("end", captureShot());
      }
      if (s.mode === "time" && s.sound) {
        const left = Math.ceil((s.seconds * 1000 - el) / 1000);
        if (left >= 1 && left <= 3 && left !== lastWarnRef.current) {
          lastWarnRef.current = left;
          beep(audio.current, 700, 0.1);
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
  }, [finish, captureShot, voidRound]);

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

  // ตรวจว่าเครื่องมีไจโรจริงไหม ไม่แตะ UI คืนผลให้ผู้เรียกตัดสินใจ
  // ok = มีสัญญาณ / denied = iOS ผู้ใช้ปฏิเสธสิทธิ์ / none = เครื่องไม่มีไจโร / null = ถูกยกเลิก
  const detectGyro = useCallback(
    async (
      granted: boolean,
      cancelled: () => boolean
    ): Promise<GyroState | null> => {
      if (!granted) return needsGyroPermission() ? "denied" : "none";
      const until = performance.now() + GYRO_WAIT_MS;
      while (!gotGyroRef.current && performance.now() < until) {
        if (cancelled()) return null;
        await sleep(50);
      }
      if (cancelled()) return null;
      return gotGyroRef.current ? "ok" : "none";
    },
    []
  );

  // ปุ่ม "ขอสิทธิ์อีกครั้ง" (เรียกจากการแตะของผู้ใช้จริง iOS จึงยอมให้ขอสิทธิ์)
  const retryGyro = useCallback(async () => {
    const sid = sessionRef.current;
    setGyroState("wait");
    const ok = await requestGyro();
    const st = await detectGyro(ok, () => sessionRef.current !== sid);
    if (!st) return;
    setGyroState(st);
    if (st !== "ok") setCanSkip(true);
  }, [detectGyro]);

  // ปุ่ม "ข้ามขั้นตอนนี้"
  const skipLevel = () => {
    const done = levelResolveRef.current;
    levelResolveRef.current = null;
    done?.();
  };

  const startSession = useCallback(async () => {
    const sid = ++sessionRef.current;
    const cancelled = () => sessionRef.current !== sid;

    // สิทธิ์ไจโรถูกขอไว้แล้วตอนแตะปุ่มเริ่ม (Pose.prime)
    const gyroPromise = P.current.gyroPromise;
    const audio = P.current.audioRef;

    // ยอดรวมวันนี้ก่อนรอบนี้ ใช้ตัดสินว่าเมื่อไรใกล้ถึงเป้าประจำวัน
    todayBaseRef.current = P.current.getTodayBase();

    // โหลดโมเดลเบื้องหลังตั้งแต่ต้น ระหว่างผู้ใช้ตั้งมือถือ เน็ตช้าจะได้ไม่ต้องรอซ้ำ
    const modelPromise = loadLandmarker();
    modelPromise.catch(() => {}); // error ไปจัดการตอน await ด้านล่าง

    await sleep(50);

    try {
      const isFront = settingsRef.current.facing === "user";

      // ขั้นที่ 1 (กล้องหน้าเท่านั้น): ตรวจไจโรก่อน ระหว่างนี้ยังแสดงหน้า loading
      // เครื่องไม่มีไจโร (PC / มือถือไม่มีเซนเซอร์) → ข้ามหน้าตั้งมือถือไปเลย
      if (isFront) {
        const st = await detectGyro(await gyroPromise, cancelled);
        if (cancelled() || !st) return;

        if (st !== "none") {
          // ok = ตั้งมือถือตามปกติ / denied = iOS ปฏิเสธสิทธิ์ แสดงปุ่มขอใหม่และข้าม
          gyroRef.current = { init: false, p: 0, r: 0, buf: [] };
          levelOkSinceRef.current = null;
          setLevelInfo(EMPTY_LEVEL);
          setGyroState(st);
          setCanSkip(st !== "ok");
          phaseRef.current = "leveling";
          setPhase("leveling");

          // ผ่านเมื่อตั้งนิ่งครบ (onOrient เรียก) หรือผู้ใช้กดข้าม (skipLevel เรียก)
          const levelDone = new Promise<void>((resolve) => {
            levelResolveRef.current = resolve;
          });
          // ตั้งไม่ผ่านเกิน 30 วิ → แสดงปุ่มข้าม
          const skipTimer = setTimeout(() => setCanSkip(true), GYRO_SKIP_MS);
          try {
            await levelDone;
          } finally {
            clearTimeout(skipTimer);
          }
          if (cancelled()) return;
          setCanSkip(false);
          if (settingsRef.current.sound) beep(audio.current, 800, 0.08);
        }
      }

      // ขั้นที่ 2: โหลดโมเดล + ขอสิทธิ์กล้อง
      phaseRef.current = "loading";
      setPhase("loading");

      const { lm, connections } = await modelPromise;
      landmarkerRef.current = lm;
      connectionsRef.current = connections;
      if (cancelled()) return;

      // กล้องหน้า: ไม่บังคับ aspect ratio เพื่อไม่ให้เบราว์เซอร์ครอปภาพ (ลดอาการซูม)
      // กล้องหลัง: ใช้ค่าเดิม
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isFront
          ? {
              facingMode: { ideal: "user" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 },
            }
          : {
              facingMode: { ideal: "environment" },
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
          if (isFront) {
            await track.applyConstraints({
              zoom: caps.zoom.min,
            } as MediaTrackConstraints);
          } else {
            await track.applyConstraints({
              advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet],
            });
          }
        }
      } catch {
        // ตั้งซูมไม่ได้ก็ใช้ค่าเดิม
      }

      const video = videoRef.current;
      if (!video) throw new Error("ไม่พบ video element");
      video.srcObject = stream;
      await video.play();
      const dim = { w: video.videoWidth || 9, h: video.videoHeight || 16 };
      setVdim(dim);
      P.current.onVideoSize(dim.w, dim.h);

      if ("wakeLock" in navigator) {
        navigator.wakeLock
          .request("screen")
          .then((l) => (wakeLockRef.current = l))
          .catch(() => {});
      }

      rafRef.current = requestAnimationFrame(loop);

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
          // ภาพแรกของวัน: ถ่ายครั้งเดียวต่อวัน ตอนนับ 1 ผู้เล่นยืนในตำแหน่งที่ผ่านการตรวจแล้ว
          const shots = P.current.shotsRef.current;
          if (i === 1 && !(shots.day === dayKey(Date.now()) && shots.start)) {
            P.current.onShot("start", captureShot());
          }
          if (settingsRef.current.sound) beep(audio.current, 600, 0.1);
          const stillOk = await waitUnlessAborted(1000);
          if (cancelled()) return;
          if (!stillOk) {
            counted = false;
            break;
          }
        }
        setCountdown(null);
      }
      if (settingsRef.current.sound) beep(audio.current, 1000, 0.3);

      jumpsRef.current = [];
      startRef.current = performance.now();
      lastTickRef.current = -1;
      lastWarnRef.current = -1;
      // วันเกมของรอบนี้สิ้นสุดตอน 06:00 น. ถัดไป ถ้ารอบยังไม่จบตอนนั้น = โมฆะ
      dayEndRef.current = gameDayStart(Date.now()) + 864e5;
      runningRef.current = true;
      phaseRef.current = "running";
      setPhase("running");
    } catch (e) {
      if (cancelled()) return;
      stopAll();
      const name = e instanceof DOMException ? e.name : "";
      P.current.onError(
        name === "NotAllowedError"
          ? "ไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วลองใหม่"
          : name === "NotFoundError"
            ? "ไม่พบกล้องในอุปกรณ์นี้"
            : "เริ่มไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตและสิทธิ์กล้อง แล้วลองใหม่"
      );
    }
  }, [loop, stopAll, captureShot, detectGyro]);

  // เริ่มสแกนทันทีที่คอมโพเนนต์ถูกแสดง และปิดกล้องตอนถูกถอด
  useEffect(() => {
    startSession();
    return stopAll;
  }, [startSession, stopAll]);

  const stopEarly = () => {
    finish("manual", performance.now() - startRef.current);
  };

  // ยกเลิกตอนสแกนตัว: ปิดกล้อง ยกเลิกรอบที่ค้าง แล้วกลับหน้าหลัก
  const cancelScan = () => {
    stopAll();
    props.onCancel();
  };

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
  // ข้อความบอกสถานะในหน้าตั้งมือถือ (ขอสิทธิ์ / ไม่ได้สิทธิ์ / ไม่มีเซนเซอร์ / คำแนะนำตั้งมุม)
  const levelHint =
    gyroState === "wait"
      ? "กำลังขอสิทธิ์เซนเซอร์เอียง กด “อนุญาต” ที่หน้าต่างที่ขึ้นมา"
      : gyroState === "denied"
        ? "ยังไม่ได้รับสิทธิ์เซนเซอร์เอียง"
        : gyroState === "none"
          ? "เครื่องนี้ไม่มีเซนเซอร์เอียง"
          : levelInfo.hint;
  // มุมหงายหลังเป้าหมาย (องศา) = 90 - beta เป้าหมาย → 20° (กล้องหน้า)
  const targetLean =
    90 - (facing === "user" ? LEVEL_TARGET_BETA : 180 - LEVEL_TARGET_BETA);
  const flip = facing === "user" ? "-scale-x-100" : "";
  const fit =
    (FORCE_CONTAIN && facing === "user") ||
    (vp.w > 0 && vp.w / vp.h > vdim.w / vdim.h)
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
      style={{ touchAction: "none", overscrollBehavior: "none" }}
      className="fixed inset-0 select-none overflow-hidden bg-[#F3F6EC] text-white antialiased lg:flex lg:items-center lg:justify-center lg:gap-6 lg:p-6"
    >
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
              {levelHint}
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

            <div className="mt-3 flex flex-col items-center gap-3">
            <PhoneExample />
            <div className="relative h-[300px] w-[84px] shrink-0 rounded-full bg-[#E3EAD6]">
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
            </div>

            <div className="mt-auto flex w-full max-w-xs flex-col items-center gap-2">
              {gyroState === "denied" && (
                <>
                  <p className="text-center text-[12px] leading-4 text-[#6B7A6E]">
                    iPhone: ปิด Safari แล้วเปิดใหม่ จากนั้นกด “ขอสิทธิ์อีกครั้ง” และเลือกอนุญาต
                  </p>
                  <button
                    onClick={retryGyro}
                    className="h-12 w-full rounded-full bg-[#C9F25B] text-[16px] font-semibold text-[#1B2A21] active:scale-[0.98]"
                  >
                    ขอสิทธิ์อีกครั้ง
                  </button>
                </>
              )}
              {canSkip && (
                <button
                  onClick={skipLevel}
                  className="h-12 w-full rounded-full bg-white text-[16px] font-semibold text-[#1B2A21] active:scale-[0.98]"
                >
                  ข้ามขั้นตอนนี้
                </button>
              )}
              <button
                onClick={cancelScan}
                className="h-12 px-6 text-[17px] font-semibold text-[#3F5E1F] active:opacity-60"
              >
                ย้อนกลับ
              </button>
            </div>
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
            <Logo size={88} className="-my-[26px]" />
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

/* ------------------------------------------------------------------ */
/* ทางออกของไฟล์                                                        */
/* ------------------------------------------------------------------ */

// ไฟล์ชื่อ page.tsx ใน app/ ถูก Next.js มองเป็นเส้นทาง (/components/pose) และ export ได้แค่ default
// จึงมีตัวห่อที่ไม่ทำอะไรถ้าถูกเปิดตรงๆ (ไม่มี props) กันบิลด์พัง
// ถ้าย้ายไฟล์นี้ไปชื่ออื่น (เช่น PoseSession.tsx) ลบตัวห่อนี้ได้
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PosePage(props: any) {
  if (!props || !props.settings) return null;
  return <PoseSession {...(props as PoseProps)} />;
}

// เรียกตอนผู้ใช้แตะปุ่มเริ่ม: const gyro = Pose.prime(facing, audioRef)
PosePage.prime = primeSession;

export default PosePage;