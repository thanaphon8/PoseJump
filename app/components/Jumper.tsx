"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * ตัวการ์ตูนกระโดดเชือก เล่นวนไม่รู้จบ พื้นหลังโปร่งใส (SVG ล้วน ไม่ใช้รูป)
 *
 * ใช้งาน:
 *   <Jumper />                      // ขนาดเริ่มต้น 220px
 *   <Jumper size={140} />
 *   <Jumper size={96} paused />     // ค้างท่าและหยุดสลับท่า
 *   <Jumper speed={0.6} />          // วินาทีต่อ 1 รอบกระโดด (ยิ่งน้อยยิ่งเร็ว)
 *   <Jumper effects={false} />      // ปิดเงา ฝุ่น เหงื่อ และควันหอบ
 *   <Jumper cycle={false} />        // กระโดดอย่างเดียว ไม่เหนื่อย/ไม่นั่งพัก
 *   <Jumper phase="sleep" />        // บังคับท่า (ปิดการวนอัตโนมัติ)
 *
 * วงจรอัตโนมัติ (ทุกท่าเชื่อมกันด้วยการเคลื่อนไหว ไม่ตัดฉับ):
 *   jump    กระโดดปกติ ~8 วิ (ครบรอบพอดีก่อนเปลี่ยนท่า)
 *   wind    กระโดดช้าลง เตี้ยลง เริ่มหมดแรง
 *   tired   เชือกหลุดมือตกพื้น แขนห้อย หอบ แล้วยกมือปาดเหงื่อที่หน้าผาก
 *   sitdown ย่อตัว ทิ้งตัวลงนั่ง มีฝุ่นฟุ้งและเด้งเบาๆ ตอนก้นถึงพื้น
 *   rest    นั่งหอบ ถอนหายใจ (กางเกง + รองเท้าหันหน้า ไม่เห็นขา)
 *   sleep   พยักหน้างีบ หลับตา มีฟองน้ำมูกพองยุบและตัว Z ลอยขึ้น
 *   wake    สะดุ้งตื่น มีเครื่องหมาย ! ลุกขึ้น หยิบเชือกกลับมาโดดต่อ (2 วิ)
 *           เชือกถูกหยิบจากพื้น แกว่งขึ้นหลังตัว แล้วหมุนต่อเนื่องเข้าท่ากระโดดโดยไม่กระตุก
 */

type Phase = "jump" | "wind" | "tired" | "sitdown" | "rest" | "sleep" | "wake";

type Props = {
  size?: number;
  speed?: number;
  paused?: boolean;
  effects?: boolean;
  /** วนท่า กระโดด -> เหนื่อย -> นั่ง -> หลับ -> ตื่น อัตโนมัติ (ค่าเริ่มต้น true) */
  cycle?: boolean;
  /** บังคับท่า (ถ้าใส่จะไม่วนอัตโนมัติ) */
  phase?: Phase;
  className?: string;
  label?: string;
};

const ORDER: Phase[] = ["jump", "wind", "tired", "sitdown", "rest", "sleep", "wake"];

// ท่า wind โดดช้าลงกี่เท่า และเตี้ยลงเท่าไร
const SLOW = 1.7;
const WIND_AMP = 0.6;

// ระยะเวลาแต่ละท่า (มิลลิวินาที) ท่ากระโดดปัดให้ลงตัวกับรอบ เพื่อสลับท่าตอนตัวอยู่ในท่าเริ่มต้นรอบพอดี
function phaseMs(p: Phase, speed: number) {
  switch (p) {
    case "jump":
      return Math.max(3, Math.round(8 / speed)) * speed * 1000;
    case "wind":
      return 2 * speed * SLOW * 1000;
    case "tired":
      return 2400;
    case "sitdown":
      return 1000;
    case "rest":
      return 3000;
    case "sleep":
      return 5200;
    case "wake":
      return 2000;
  }
}

// สีตัวการ์ตูน
const HAIR = "#F2B632";
const SKIN = "#FF6B9D";
const NOSE = "#EE3F78";
const TANK = "#C9F25B";
const SHORTS = "#0B76C4";
const BAND = "#2D7DD2";
const SHOE = "#FFFFFF";
const SHOE_LINE = "#C9D2DA";
const SWEAT = "#8FD3FF";

const FEET_Y = 282; // จุดหมุนของการยืด/ย่อตัว (ระดับพื้น)
const SIT_Y = 38; // ตอนนั่ง ลำตัวและหัวต่ำลงจากท่ายืนเท่านี้

// ตำแหน่งมือพื้นฐาน (จุดจับเชือก)
const HL = { x: 155, y: 208 };
const HR = { x: 325, y: 203 };

// ข้อมือขยับวนเป็นวงเล็กตามเชือก 9 จังหวะ (ครบรอบ = จังหวะแรกกับจังหวะสุดท้ายเหมือนกัน)
const OFF_L: [number, number][] = [
  [-2, -9],
  [-6, -6],
  [-9, -2],
  [-7, 3],
  [-3, 9],
  [-7, 3],
  [-9, -2],
  [-6, -6],
  [-2, -9],
];
const OFF_R: [number, number][] = OFF_L.map(([x, y]) => [-x, y]);

const N = OFF_L.length; // 9 จังหวะ = 8 ช่วง
const KEY_TIMES = Array.from({ length: N }, (_, i) => +(i / (N - 1)).toFixed(4)).join(";");

type P = { x: number; y: number };

// เชือก 1 เส้น (โครงสร้าง M C C เหมือนกันทุกจังหวะ เพื่อให้ SMIL animate ค่า d ได้ลื่น)
// top = ความสูงจุดยอดโค้ง, c1 = ความโค้งออกด้านข้าง, c2 = ความสูงของโค้งด้านข้าง
const ropePath = (hl: P, hr: P, top: number, c1: number, c2: number) =>
  `M${hl.x} ${hl.y} C ${hl.x - c1} ${hl.y - c2}, ${hl.x - c1 + 15} ${top}, 240 ${top} ` +
  `C ${hr.x + c1 - 15} ${top}, ${hr.x + c1} ${hr.y - c2}, ${hr.x} ${hr.y}`;

// เชือกหมุนครบรอบ: เหนือหัว -> ลงมาหน้าตัว -> ใต้เท้า -> ขึ้นหลังตัว -> เหนือหัว
// จังหวะ 0-3 เชือกอยู่หน้าตัว (ผ่านหน้า) จังหวะ 5-8 อยู่หลังตัว (ผ่านขึ้น)
const SHAPES: [number, number, number][] = [
  [-14, 50, 48], // เหนือหัว (พ้นผมแอฟโฟร)
  [50, 46, 35], // ผ่านหน้าระดับหน้า
  [125, 30, 18], // ผ่านหน้าระดับอก
  [195, 5, 3], // ผ่านหน้าระดับมือ
  [302, -5, -75], // ใต้เท้า
  [195, 5, 3], // หลังตัวระดับมือ
  [125, 30, 18],
  [50, 46, 35],
  [-14, 50, 48],
];

const handL = (i: number): P => ({ x: HL.x + OFF_L[i][0], y: HL.y + OFF_L[i][1] });
const handR = (i: number): P => ({ x: HR.x + OFF_R[i][0], y: HR.y + OFF_R[i][1] });

const ROPE_VALUES = SHAPES.map(([t, a, b], i) =>
  ropePath(handL(i), handR(i), t, a, b)
);

// แขน: จากไหล่ไปที่มือ ข้อศอกโก่งออกด้านนอกเล็กน้อย
const SH_L = { x: 184, y: 140 };
const SH_R = { x: 296, y: 138 };
const armPath = (s: P, h: P, out: number) =>
  `M${s.x} ${s.y} Q ${(s.x + h.x) / 2 + out} ${(s.y + h.y) / 2 + 2} ${h.x} ${h.y}`;

const ARM_L_VALUES = OFF_L.map((_, i) => {
  const h = handL(i);
  return armPath(SH_L, { x: h.x + 2, y: h.y + 2 }, -6);
});
const ARM_R_VALUES = OFF_R.map((_, i) => {
  const h = handR(i);
  return armPath(SH_R, { x: h.x - 2, y: h.y + 2 }, 6);
});

const moveValues = (off: [number, number][]) =>
  off.map(([x, y]) => `${x} ${y}`).join(";");

/* ---------- ตำแหน่งปลายทางของท่าต่างๆ (ใช้ต่อเนื่องระหว่างท่า) ---------- */

// มือขณะกระโดดที่จังหวะแรกของรอบ (จุดที่เปลี่ยนท่าเข้า/ออก)
const JUMP_HAND_L = { x: HL.x, y: HL.y - 7 }; // 155,201
const JUMP_HAND_R = { x: HR.x, y: HR.y - 7 }; // 325,196
// ด้ามเชือกขณะกระโดดที่จังหวะแรก [x1,y1,x2,y2]
const JUMP_HANDLE_L = [138, 194, 170, 205];
const JUMP_HANDLE_R = [312, 204, 344, 191];

// มือและด้ามเชือกขณะกระโดด ณ จังหวะที่ i (ใช้ต่อท่าตื่นเข้ากับท่ากระโดดให้เนียน)
const jumpHandL = (i: number): P => ({
  x: HL.x + OFF_L[i][0] + 2,
  y: HL.y + OFF_L[i][1] + 2,
});
const jumpHandR = (i: number): P => ({
  x: HR.x + OFF_R[i][0] - 2,
  y: HR.y + OFF_R[i][1] + 2,
});
const jumpHandleL = (i: number): number[] => [
  140 + OFF_L[i][0],
  203 + OFF_L[i][1],
  172 + OFF_L[i][0],
  214 + OFF_L[i][1],
];
const jumpHandleR = (i: number): number[] => [
  310 + OFF_R[i][0],
  213 + OFF_R[i][1],
  342 + OFF_R[i][0],
  200 + OFF_R[i][1],
];

// ยืนเหนื่อย: แขนห้อยข้างตัว ไหล่ตกลงเล็กน้อย
const SH_L_T = { x: 184, y: 146 };
const SH_R_T = { x: 296, y: 144 };
const TIRED_HAND_L = { x: 170, y: 242 };
const TIRED_HAND_R = { x: 310, y: 242 };
const TIRED_ARM_L = armPath(SH_L_T, TIRED_HAND_L, -8);
const TIRED_ARM_R = armPath(SH_R_T, TIRED_HAND_R, 8);

// ปาดเหงื่อ: มือขวายกไปที่หน้าผาก แล้วปาดไปมา
const WIPE_A = { x: 266, y: 96 };
const WIPE_B = { x: 249, y: 91 };
const WIPE_ARM_A = armPath(SH_R_T, WIPE_A, 14);
const WIPE_ARM_B = armPath(SH_R_T, WIPE_B, 14);

// นั่ง: ลำตัวลดลง SIT_Y มือยันพื้นด้านหลังสองข้าง (อยู่สูงกว่าเท้าบนจอ = อยู่ไกลกว่า)
const SH_L_R = { x: SH_L_T.x, y: SH_L_T.y + SIT_Y };
const SH_R_R = { x: SH_R_T.x, y: SH_R_T.y + SIT_Y };
const REST_HAND_L = { x: 150, y: 272 };
const REST_HAND_R = { x: 330, y: 272 };
const REST_ARM_L = armPath(SH_L_R, REST_HAND_L, -8);
const REST_ARM_R = armPath(SH_R_R, REST_HAND_R, 8);

// เชือกกับด้ามที่กองบนพื้น (ตอนเหนื่อย/นั่ง/หลับ)
const FLOOR_L = { x: 152, y: 296 };
const FLOOR_R = { x: 328, y: 296 };
const FLOOR_ROPE = ropePath(FLOOR_L, FLOOR_R, 304, -4, -16);
const FLOOR_HANDLE_L = [134, 290, 152, 296];
const FLOOR_HANDLE_R = [328, 296, 346, 290];

// เชือกที่ถูกหิ้วขึ้นมาห้อยในมือ (ตอนลุกขึ้นยืนแล้ว ก่อนแกว่งขึ้นหลังตัว)
const HANG_HANDLE_L = [
  TIRED_HAND_L.x - 17,
  TIRED_HAND_L.y - 7,
  TIRED_HAND_L.x + 15,
  TIRED_HAND_L.y + 4,
];
const HANG_HANDLE_R = [
  TIRED_HAND_R.x - 13,
  TIRED_HAND_R.y + 8,
  TIRED_HAND_R.x + 19,
  TIRED_HAND_R.y - 5,
];
const HANG_ROPE = ropePath(TIRED_HAND_L, TIRED_HAND_R, 294, -4, -16);

const CSS = `
@keyframes jmp-jump {
  0%   { transform: translateY(3px) scale(1.09, .88); }
  16%  { transform: translateY(calc(-7px * var(--jmp-amp, 1))) scale(.93, 1.09); }
  50%  { transform: translateY(calc(-30px * var(--jmp-amp, 1))) scale(.98, 1.03); }
  84%  { transform: translateY(calc(-7px * var(--jmp-amp, 1))) scale(.96, 1.05); }
  93%  { transform: translateY(0) scale(1, 1); }
  100% { transform: translateY(3px) scale(1.09, .88); }
}
@keyframes jmp-head {
  0%, 100% { transform: translateY(5px) rotate(2deg); }
  18% { transform: translateY(-4px) rotate(-4deg); }
  50% { transform: translateY(-3px) rotate(4deg); }
  82% { transform: translateY(3px) rotate(-3deg); }
}
@keyframes jmp-afro {
  0%, 100% { transform: translateY(7px); }
  20% { transform: translateY(-6px); }
  50% { transform: translateY(-2px); }
  78% { transform: translateY(5px); }
}
@keyframes jmp-belly {
  0%, 100% { transform: translateY(6px); }
  20% { transform: translateY(-5px); }
  50% { transform: translateY(-1px); }
  80% { transform: translateY(4px); }
}
@keyframes jmp-stache {
  0%, 100% { transform: translateY(1.5px); }
  20% { transform: translateY(-2px); }
  55% { transform: translateY(-.5px); }
  85% { transform: translateY(1px); }
}
@keyframes jmp-tail {
  0%, 100% { transform: rotate(6deg); }
  30% { transform: rotate(-12deg); }
  55% { transform: rotate(16deg); }
  80% { transform: rotate(-4deg); }
}
@keyframes jmp-foot-l {
  0%, 100% { transform: translateY(0); }
  14% { transform: translateY(-5px); }
  48% { transform: translateY(-15px); }
  86% { transform: translateY(-3px); }
}
@keyframes jmp-foot-r {
  0%, 100% { transform: translateY(0); }
  18% { transform: translateY(-4px); }
  54% { transform: translateY(-10px); }
  88% { transform: translateY(-2px); }
}
@keyframes jmp-eyes {
  0%, 100% { transform: scaleY(.75); }
  18% { transform: scaleY(1.15); }
  50% { transform: scaleY(1.22); }
  85% { transform: scaleY(1); }
}
@keyframes jmp-blink {
  0%, 90%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(.08); }
}
@keyframes jmp-mouth {
  0%, 100% { transform: scale(1, .25); }
  18% { transform: scale(1.1, 1.15); }
  50% { transform: scale(1, .8); }
  85% { transform: scale(1, .4); }
}
@keyframes jmp-shadow {
  0%, 100% { transform: scale(1.08); opacity: .2; }
  50% { transform: scale(.65); opacity: .08; }
}
@keyframes jmp-dust-l {
  0% { opacity: .4; transform: translateX(0) scale(.3); }
  40% { opacity: 0; transform: translateX(-20px) scale(1.6); }
  100% { opacity: 0; transform: translateX(-20px) scale(1.6); }
}
@keyframes jmp-dust-r {
  0% { opacity: .4; transform: translateX(0) scale(.3); }
  40% { opacity: 0; transform: translateX(20px) scale(1.6); }
  100% { opacity: 0; transform: translateX(20px) scale(1.6); }
}
@keyframes jmp-sweat-a {
  0%, 100% { opacity: 0; transform: translate(0, 0) scale(.4); }
  12% { opacity: 1; transform: translate(-3px, 2px) scale(1); }
  45% { opacity: 0; transform: translate(-22px, 26px) scale(.8); }
}
@keyframes jmp-sweat-b {
  0%, 100% { opacity: 0; transform: translate(0, 0) scale(.4); }
  12% { opacity: 1; transform: translate(3px, 2px) scale(1); }
  45% { opacity: 0; transform: translate(22px, 26px) scale(.8); }
}

/* ---------- หอบ (เหนื่อย / นั่ง / หลับ): ความเร็วคุมด้วย --jmp-slow ---------- */
@keyframes jmp-t-head {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(3px) rotate(2.5deg); }
}
@keyframes jmp-t-afro {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(2.5px); }
}
@keyframes jmp-t-stache {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(1.2px); }
}
@keyframes jmp-t-tail {
  0%, 100% { transform: rotate(4deg); }
  50% { transform: rotate(-6deg); }
}
@keyframes jmp-t-mouth {
  0%, 100% { transform: scale(1, .5); }
  50% { transform: scale(1.15, 1.45); }
}
@keyframes jmp-z-mouth {
  0%, 100% { transform: scale(.7, .5); }
  50% { transform: scale(.95, 1.1); }
}
@keyframes jmp-t-breath {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.03, 1.08); }
}
@keyframes jmp-t-drop {
  0% { opacity: 0; transform: translate(0, 0) scale(.5); }
  20% { opacity: 1; transform: translate(0, 4px) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx, -5px), 34px) scale(.9); }
}

/* ---------- เชื่อมท่า: เหนื่อย ---------- */
@keyframes jmp-settle {
  from { transform: translateY(3px) scale(1.09, .88); }
  60% { transform: translateY(-1px) scale(.98, 1.03); }
  to { transform: translateY(0) scale(1, 1); }
}
@keyframes jmp-droop {
  from { transform: translateY(5px) rotate(2deg); }
  to { transform: translateY(9px) rotate(6deg); }
}

/* ---------- เชื่อมท่า: ทิ้งตัวลงนั่ง ---------- */
@keyframes jmp-sitdown {
  0%   { transform: translateY(0) scale(1, 1); }
  26%  { transform: translateY(9px) scale(1.06, .93); }
  54%  { transform: translateY(${SIT_Y + 4}px) scale(.96, 1.07); }
  68%  { transform: translateY(${SIT_Y}px) scale(1.12, .86); }
  84%  { transform: translateY(${SIT_Y - 2}px) scale(.98, 1.03); }
  100% { transform: translateY(${SIT_Y}px) scale(1, 1); }
}
@keyframes jmp-sit-head {
  0%   { transform: translateY(9px) rotate(6deg); }
  28%  { transform: translateY(14px) rotate(11deg); }
  56%  { transform: translateY(5px) rotate(-9deg); }
  72%  { transform: translateY(13px) rotate(3deg); }
  100% { transform: translateY(9px) rotate(-4deg); }
}
@keyframes jmp-legs-fold {
  0%   { opacity: 1; transform: scaleY(1); }
  26%  { opacity: 1; transform: scaleY(.88); }
  52%  { opacity: 1; transform: scaleY(.55); }
  62%  { opacity: 0; transform: scaleY(.4); }
  100% { opacity: 0; transform: scaleY(.4); }
}
@keyframes jmp-shoe-in {
  0%, 50% { opacity: 0; transform: scale(.4); }
  72% { opacity: 1; transform: scale(1.18); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes jmp-puff {
  0% { opacity: .75; transform: translate(0, 0) scale(.3); }
  100% { opacity: 0; transform: translate(var(--px, 14px), -8px) scale(1.6); }
}
@keyframes jmp-sigh {
  0% { opacity: 0; transform: translate(0, 0) scale(.3); }
  25% { opacity: .85; }
  100% { opacity: 0; transform: translate(20px, -16px) scale(1.4); }
}

/* ---------- หลับ ---------- */
@keyframes jmp-nod {
  0%   { transform: translateY(0) rotate(-4deg); }
  22%  { transform: translateY(5px) rotate(9deg); }
  30%  { transform: translateY(1px) rotate(1deg); }
  52%  { transform: translateY(7px) rotate(13deg); }
  62%  { transform: translateY(4px) rotate(8deg); }
  100% { transform: translateY(8px) rotate(15deg); }
}
@keyframes jmp-eye-shut {
  to { opacity: 0; }
}
@keyframes jmp-arc-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes jmp-bubble {
  0%, 100% { transform: scale(.2); opacity: .9; }
  55% { transform: scale(1); opacity: 1; }
  66% { transform: scale(1.08); opacity: 1; }
  74% { transform: scale(1.3); opacity: 0; }
  75% { transform: scale(.2); opacity: 0; }
}
/* ตัว Z แต่ละตัวมีตำแหน่งของตัวเอง (กำหนดที่ x,y) ลอยแค่เล็กน้อยแล้วจาง จึงไม่ซ้อนกัน */
@keyframes jmp-zzz {
  0% { opacity: 0; transform: translate(0, 0) scale(.5) rotate(-12deg); }
  20% { opacity: 1; }
  75% { opacity: .9; }
  100% { opacity: 0; transform: translate(8px, -10px) scale(1.1) rotate(8deg); }
}

/* ---------- ตื่น + ลุกขึ้น (ท่าสุดท้ายตรงกับจังหวะแรกของท่ากระโดด) ---------- */
@keyframes jmp-standup {
  0%   { transform: translateY(${SIT_Y}px) scale(1, 1); }
  15%  { transform: translateY(${SIT_Y}px) scale(1, 1); }
  27%  { transform: translateY(${SIT_Y + 4}px) scale(1.07, .93); }
  46%  { transform: translateY(-7px) scale(.95, 1.08); }
  58%  { transform: translateY(4px) scale(1.08, .91); }
  68%  { transform: translateY(0) scale(1, 1); }
  100% { transform: translateY(3px) scale(1.09, .88); }
}
@keyframes jmp-wake-head {
  0%   { transform: translateY(17px) rotate(15deg); }
  12%  { transform: translateY(-3px) rotate(-11deg); }
  26%  { transform: translateY(7px) rotate(5deg); }
  100% { transform: translateY(4px) rotate(0deg); }
}
@keyframes jmp-wake-afro {
  0%   { transform: translateY(0); }
  12%  { transform: translateY(-5px); }
  26%  { transform: translateY(4px); }
  100% { transform: translateY(5.5px); }
}
@keyframes jmp-wake-stache {
  0%   { transform: translateY(0); }
  12%  { transform: translateY(-2px); }
  100% { transform: translateY(1px); }
}
@keyframes jmp-wake-tail {
  0%   { transform: rotate(0deg); }
  20%  { transform: rotate(-14deg); }
  50%  { transform: rotate(10deg); }
  100% { transform: rotate(-4deg); }
}
@keyframes jmp-wake-shadow {
  0%   { transform: scale(1.42); opacity: .2; }
  40%  { transform: scale(1.3); opacity: .18; }
  46%  { transform: scale(.85); opacity: .1; }
  58%  { transform: scale(1.15); opacity: .2; }
  100% { transform: scale(1.08); opacity: .2; }
}
@keyframes jmp-legs-unfold {
  0%, 32% { opacity: 0; transform: scaleY(.4); }
  42% { opacity: 1; transform: scaleY(.6); }
  58% { opacity: 1; transform: scaleY(1.08); }
  70%, 100% { opacity: 1; transform: scaleY(1); }
}
@keyframes jmp-shoe-out {
  0%, 16% { opacity: 1; transform: scale(1); }
  34%, 100% { opacity: 0; transform: scale(.5); }
}
@keyframes jmp-eye-pop {
  0% { opacity: 0; transform: scaleY(.1); }
  10% { opacity: 1; transform: scaleY(1.45); }
  40% { opacity: 1; transform: scaleY(1.2); }
  100% { opacity: 1; transform: scaleY(.89); }
}
@keyframes jmp-arc-out {
  0%, 6% { opacity: 1; }
  12%, 100% { opacity: 0; }
}
@keyframes jmp-mouth-pop {
  0% { transform: scale(1.1, 1.5); }
  40% { transform: scale(1.1, 1.25); }
  100% { transform: scale(1, .33); }
}
@keyframes jmp-bang {
  0% { opacity: 0; transform: translateY(8px) scale(.3); }
  12% { opacity: 1; transform: translateY(0) scale(1.25); }
  24% { transform: translateY(0) scale(1); }
  60% { opacity: 1; transform: translateY(-2px) scale(1); }
  80%, 100% { opacity: 0; transform: translateY(-8px) scale(.8); }
}

.jmp-anim {
  animation-duration: var(--jmp-dur);
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-play-state: var(--jmp-state);
}
.jmp-slow {
  animation-duration: var(--jmp-slow, 1.2s);
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  animation-play-state: var(--jmp-state);
}
/* แอนิเมชันครั้งเดียว (ท่าเชื่อม) ค้างที่ท่าสุดท้าย */
.jmp-once {
  animation-iteration-count: 1;
  animation-fill-mode: both;
  animation-timing-function: ease-in-out;
  animation-play-state: var(--jmp-state);
}
.jmp-fb { transform-box: fill-box; transform-origin: center; }

.jmp-jump { animation-name: jmp-jump; transform-origin: 0 0; }
.jmp-head { animation-name: jmp-head; transform-origin: 0 0; animation-delay: calc(var(--jmp-dur) * -0.92); }
.jmp-afro { animation-name: jmp-afro; animation-delay: calc(var(--jmp-dur) * -0.84); }
.jmp-belly { animation-name: jmp-belly; animation-delay: calc(var(--jmp-dur) * -0.9); }
.jmp-stache { animation-name: jmp-stache; animation-delay: calc(var(--jmp-dur) * -0.88); }
.jmp-tail { animation-name: jmp-tail; transform-origin: 0 0; animation-delay: calc(var(--jmp-dur) * -0.78); }
.jmp-foot-l { animation-name: jmp-foot-l; }
.jmp-foot-r { animation-name: jmp-foot-r; animation-delay: calc(var(--jmp-dur) * -0.96); }
.jmp-eyes { animation-name: jmp-eyes; animation-delay: calc(var(--jmp-dur) * -0.92); }
.jmp-blink { animation-name: jmp-blink; animation-duration: calc(var(--jmp-dur) * 4); }
.jmp-mouth { animation-name: jmp-mouth; animation-delay: calc(var(--jmp-dur) * -0.92); }
.jmp-shadow { animation-name: jmp-shadow; }
.jmp-dust-l { animation-name: jmp-dust-l; animation-timing-function: ease-out; }
.jmp-dust-r { animation-name: jmp-dust-r; animation-timing-function: ease-out; }
.jmp-sweat-a { animation-name: jmp-sweat-a; animation-duration: calc(var(--jmp-dur) * 2.5); animation-timing-function: ease-out; }
.jmp-sweat-b { animation-name: jmp-sweat-b; animation-duration: calc(var(--jmp-dur) * 2.5); animation-timing-function: ease-out; animation-delay: calc(var(--jmp-dur) * -1.2); }

.jmp-t-head { animation-name: jmp-t-head; transform-origin: 0 0; }
.jmp-t-afro { animation-name: jmp-t-afro; }
.jmp-t-stache { animation-name: jmp-t-stache; }
.jmp-t-tail { animation-name: jmp-t-tail; transform-origin: 0 0; }
.jmp-t-mouth { animation-name: jmp-t-mouth; }
.jmp-z-mouth { animation-name: jmp-z-mouth; }
.jmp-t-eyes { transform: scaleY(.3); }
.jmp-t-breath { animation-name: jmp-t-breath; transform-box: fill-box; transform-origin: 50% 100%; }
.jmp-t-drop-a { animation-name: jmp-t-drop; animation-duration: calc(var(--jmp-slow, 1.2s) * 1.8); animation-timing-function: ease-in; --dx: -6px; }
.jmp-t-drop-b { animation-name: jmp-t-drop; animation-duration: calc(var(--jmp-slow, 1.2s) * 1.8); animation-timing-function: ease-in; animation-delay: calc(var(--jmp-slow, 1.2s) * -0.9); --dx: 6px; }

.jmp-settle { animation-name: jmp-settle; animation-duration: .5s; animation-timing-function: ease-out; transform-origin: 0 0; }
.jmp-droop { animation-name: jmp-droop; animation-duration: .6s; animation-timing-function: ease-out; transform-origin: 0 0; }
.jmp-sitdown { animation-name: jmp-sitdown; animation-duration: 1s; transform-origin: 0 0; }
.jmp-sit-head { animation-name: jmp-sit-head; animation-duration: 1s; transform-origin: 0 0; }
.jmp-legs-fold { animation-name: jmp-legs-fold; animation-duration: 1s; transform-origin: 0 0; }
.jmp-shoe-in { animation-name: jmp-shoe-in; animation-duration: 1s; }
.jmp-puff { animation-name: jmp-puff; animation-duration: .7s; animation-delay: .62s; animation-fill-mode: backwards; animation-timing-function: ease-out; animation-iteration-count: 1; }
.jmp-sigh { animation-name: jmp-sigh; animation-duration: 1.7s; animation-timing-function: ease-out; animation-fill-mode: backwards; animation-iteration-count: 1; }

.jmp-nod { animation-name: jmp-nod; animation-duration: 2.6s; transform-origin: 0 0; }
.jmp-eye-shut { animation-name: jmp-eye-shut; animation-duration: .5s; animation-delay: .35s; }
.jmp-arc-in { animation-name: jmp-arc-in; animation-duration: .4s; animation-delay: .5s; opacity: 0; }
.jmp-bubble { animation-name: jmp-bubble; transform-box: fill-box; transform-origin: 100% 50%; }
.jmp-zzz {
  animation-name: jmp-zzz;
  animation-duration: 3.2s;
  animation-timing-function: ease-out;
  animation-iteration-count: infinite;
  animation-fill-mode: backwards;
  animation-play-state: var(--jmp-state);
  transform-box: fill-box;
  transform-origin: center;
}
.jmp-z1 { animation-delay: .6s; }
.jmp-z2 { animation-delay: 1.6s; }
.jmp-z3 { animation-delay: 2.6s; }

.jmp-standup { animation-name: jmp-standup; animation-duration: 2s; transform-origin: 0 0; }
.jmp-wake-head { animation-name: jmp-wake-head; animation-duration: 2s; transform-origin: 0 0; }
.jmp-wake-afro { animation-name: jmp-wake-afro; animation-duration: 2s; }
.jmp-wake-stache { animation-name: jmp-wake-stache; animation-duration: 2s; }
.jmp-wake-tail { animation-name: jmp-wake-tail; animation-duration: 2s; transform-origin: 0 0; }
.jmp-wake-shadow { animation-name: jmp-wake-shadow; animation-duration: 2s; }
.jmp-legs-unfold { animation-name: jmp-legs-unfold; animation-duration: 2s; transform-origin: 0 0; }
.jmp-shoe-out { animation-name: jmp-shoe-out; animation-duration: 2s; }
.jmp-eye-pop { animation-name: jmp-eye-pop; animation-duration: 2s; }
.jmp-arc-out { animation-name: jmp-arc-out; animation-duration: 2s; }
.jmp-mouth-pop { animation-name: jmp-mouth-pop; animation-duration: 2s; }
.jmp-bang { animation-name: jmp-bang; animation-duration: 2s; transform-box: fill-box; transform-origin: center bottom; }

@media (prefers-reduced-motion: reduce) {
  .jmp-anim, .jmp-slow, .jmp-once, .jmp-zzz { animation: none; }
}
`;

/* ------------------------------------------------------------------ */
/* ตัวช่วยทำแอนิเมชัน SMIL แบบครั้งเดียวค้างท่าสุดท้าย                       */
/* ------------------------------------------------------------------ */

type Ease = string | string[];

// attr ที่ animate, v = ค่าแต่ละช่วง, dur = วินาที, kt = สัดส่วนเวลา (เริ่ม 0 จบ 1), begin = หน่วงเริ่ม
// ease = เส้นโค้งความเร็ว (สตริงเดียวใช้ทุกช่วง หรือใส่เป็นอาร์เรย์แยกแต่ละช่วง)
function A({
  attr,
  v,
  dur,
  kt,
  begin = 0,
  ease = ".4 0 .2 1",
}: {
  attr: string;
  v: (string | number)[];
  dur: number;
  kt?: number[];
  begin?: number;
  ease?: Ease;
}) {
  const n = v.length;
  const times = kt ?? v.map((_, i) => i / (n - 1));
  return (
    <animate
      attributeName={attr}
      values={v.join(";")}
      keyTimes={times.map((t) => +t.toFixed(4)).join(";")}
      dur={`${dur}s`}
      begin={begin ? `${begin}s` : "0s"}
      fill="freeze"
      calcMode="spline"
      keySplines={Array.from({ length: n - 1 }, (_, i) =>
        Array.isArray(ease) ? ease[i] : ease
      ).join(";")}
    />
  );
}

// ด้ามเชือก 4 พิกัดเคลื่อนจากที่หนึ่งไปอีกที่ (หรือหลายช่วงเมื่อมี kt)
function Handle({
  frames,
  dur,
  kt,
  begin,
  ease,
}: {
  frames: number[][];
  dur: number;
  kt?: number[];
  begin?: number;
  ease?: Ease;
}) {
  const f0 = frames[0];
  return (
    <line
      x1={f0[0]}
      y1={f0[1]}
      x2={f0[2]}
      y2={f0[3]}
      stroke="#111"
      strokeWidth="8"
      strokeLinecap="round"
    >
      {(["x1", "y1", "x2", "y2"] as const).map((a, i) => (
        <A
          key={a}
          attr={a}
          v={frames.map((f) => f[i])}
          dur={dur}
          kt={kt}
          begin={begin}
          ease={ease}
        />
      ))}
    </line>
  );
}

// มือ (วงกลม) เคลื่อนผ่านจุดต่างๆ
function Hand({
  pts,
  dur,
  kt,
  begin,
  ease,
}: {
  pts: P[];
  dur: number;
  kt?: number[];
  begin?: number;
  ease?: Ease;
}) {
  return (
    <circle cx={pts[0].x} cy={pts[0].y} r="13" fill={SKIN}>
      <A attr="cx" v={pts.map((p) => p.x)} dur={dur} kt={kt} begin={begin} ease={ease} />
      <A attr="cy" v={pts.map((p) => p.y)} dur={dur} kt={kt} begin={begin} ease={ease} />
    </circle>
  );
}

// แขนเคลื่อนผ่านท่าต่างๆ
function Arm({
  paths,
  dur,
  kt,
  begin,
  ease,
}: {
  paths: string[];
  dur: number;
  kt?: number[];
  begin?: number;
  ease?: Ease;
}) {
  return (
    <path d={paths[0]} fill="none" stroke={SKIN} strokeWidth="26" strokeLinecap="round">
      <A attr="d" v={paths} dur={dur} kt={kt} begin={begin} ease={ease} />
    </path>
  );
}

// เชือกเคลื่อนผ่านรูปทรงต่างๆ
function Rope({
  paths,
  dur,
  kt,
  begin,
  ease,
}: {
  paths: string[];
  dur: number;
  kt?: number[];
  begin?: number;
  ease?: Ease;
}) {
  return (
    <path
      d={paths[0]}
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <A attr="d" v={paths} dur={dur} kt={kt} begin={begin} ease={ease} />
    </path>
  );
}

// จุดหมุนแบบซ้อนกลุ่ม: ให้ CSS transform หมุน/ยืดรอบจุด (cx, cy) ได้โดยไม่ต้องรู้ transform-box
function Pivot({
  cx,
  cy,
  cls,
  children,
}: {
  cx: number;
  cy: number;
  cls: string;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className={cls}>
        <g transform={`translate(${-cx} ${-cy})`}>{children}</g>
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* ส่วนประกอบที่ใช้ร่วมกันทุกท่า                                           */
/* ------------------------------------------------------------------ */

// class ของแต่ละชิ้นส่วนบนหัว
type HeadCls = {
  head: string;
  afro: string;
  eyes: string;
  blink: string;
  mouth: string;
  stache: string;
  tail: string;
};

const HEAD_JUMP: HeadCls = {
  head: "jmp-anim jmp-head",
  afro: "jmp-anim jmp-afro",
  eyes: "jmp-anim jmp-fb jmp-eyes",
  blink: "jmp-anim jmp-fb jmp-blink",
  mouth: "jmp-anim jmp-fb jmp-mouth",
  stache: "jmp-anim jmp-stache",
  tail: "jmp-anim jmp-tail",
};

// เหนื่อย/นั่ง: ตาหรี่ ไม่กะพริบ อ้าปากหอบ
const HEAD_PANT: HeadCls = {
  head: "jmp-slow jmp-t-head",
  afro: "jmp-slow jmp-t-afro",
  eyes: "jmp-fb jmp-t-eyes",
  blink: "",
  mouth: "jmp-slow jmp-fb jmp-t-mouth",
  stache: "jmp-slow jmp-t-stache",
  tail: "jmp-slow jmp-t-tail",
};

// หลับ: ตาค่อยๆ หลับ ปากเปิดนิดๆ หายใจช้า
const HEAD_SLEEP: HeadCls = {
  head: "jmp-slow jmp-t-head",
  afro: "jmp-slow jmp-t-afro",
  eyes: "jmp-fb jmp-t-eyes",
  blink: "jmp-once jmp-fb jmp-eye-shut",
  mouth: "jmp-slow jmp-fb jmp-z-mouth",
  stache: "jmp-slow jmp-t-stache",
  tail: "jmp-slow jmp-t-tail",
};

// ตื่น: ตาเบิกโพลง ปากอ้าตกใจ แล้วค่อยๆ ปรับท่าทุกชิ้นให้ตรงกับจังหวะแรกของท่ากระโดด
const HEAD_WAKE: HeadCls = {
  head: "",
  afro: "jmp-once jmp-wake-afro",
  eyes: "jmp-once jmp-fb jmp-eye-pop",
  blink: "",
  mouth: "jmp-once jmp-fb jmp-mouth-pop",
  stache: "jmp-once jmp-wake-stache",
  tail: "jmp-once jmp-wake-tail",
};

// หัว: เอียงและเด้งรอบคอ (จุดหมุนอยู่ที่คอ 240,135)
// arcs = ตาหลับเป็นเส้นโค้ง ("in" ค่อยๆ ปรากฏ / "out" หายไปตอนตื่น) snore = ฟองน้ำมูก
function Head({
  c,
  arcs,
  snore,
}: {
  c: HeadCls;
  arcs?: "in" | "out";
  snore?: boolean;
}) {
  return (
    <g transform="translate(240 135)">
      <g className={c.head}>
        <g transform="translate(-240 -135)">
          {/* ผมแอฟโฟร (เด้งช้ากว่าหน้า) */}
          <g className={c.afro}>
            <circle cx="240" cy="68" r="46" fill={HAIR} />
            <circle cx="198" cy="82" r="26" fill={HAIR} />
            <circle cx="282" cy="82" r="26" fill={HAIR} />
            <circle cx="212" cy="48" r="26" fill={HAIR} />
            <circle cx="268" cy="48" r="26" fill={HAIR} />
            <circle cx="240" cy="36" r="28" fill={HAIR} />
          </g>

          {/* หู + หน้า */}
          <circle cx="203" cy="104" r="9" fill={SKIN} />
          <circle cx="277" cy="104" r="9" fill={SKIN} />
          <ellipse cx="240" cy="104" rx="36" ry="37" fill={SKIN} />

          {/* ผ้าคาดหัว */}
          <path d="M205 80 Q240 72 275 80 L276 94 Q240 86 204 94 Z" fill="#FFFFFF" />
          <path d="M204.6 84 Q240 76 275.4 84" fill="none" stroke={BAND} strokeWidth="2.5" />
          <path d="M204.2 89 Q240 81 275.8 89" fill="none" stroke={BAND} strokeWidth="2.5" />

          {/* ชายผ้าคาดหัว พลิ้วตามจังหวะ */}
          <g transform="translate(274 87)">
            <g className={c.tail}>
              <g transform="translate(-274 -87)">
                <path d="M272 82 Q290 76 302 90 L291 94 Q285 88 272 90Z" fill="#FFFFFF" />
                <path d="M272 86 Q287 82 298 91" fill="none" stroke={BAND} strokeWidth="2" />
                <path d="M272 91 Q286 99 296 110 L287 112 Q282 102 272 96Z" fill="#FFFFFF" />
              </g>
            </g>
          </g>

          {/* จมูก ตา */}
          <circle cx="224" cy="110" r="11" fill={NOSE} />
          <g className={c.eyes}>
            <ellipse className={c.blink} cx="231" cy="101" rx="2.6" ry="4.2" fill="#1A1A1A" />
            <ellipse className={c.blink} cx="251" cy="101" rx="2.6" ry="4.2" fill="#1A1A1A" />
          </g>
          {arcs && (
            <g
              className={arcs === "in" ? "jmp-once jmp-arc-in" : "jmp-once jmp-arc-out"}
              fill="none"
              stroke="#1A1A1A"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <path d="M225 102 Q231 108 237 102" />
              <path d="M245 102 Q251 108 257 102" />
            </g>
          )}

          {/* ฟองน้ำมูก (พองยุบตามลมหายใจ) */}
          {snore && (
            <g className="jmp-slow jmp-bubble" style={{ "--jmp-slow": "3.6s" } as CSSProperties}>
              <circle
                cx="208"
                cy="116"
                r="9"
                fill={SWEAT}
                fillOpacity=".35"
                stroke="#CFEFFF"
                strokeWidth="1.5"
              />
              <circle cx="205" cy="112" r="2.2" fill="#FFFFFF" opacity=".85" />
            </g>
          )}

          {/* ปาก (อยู่หลังหนวด) */}
          <ellipse className={c.mouth} cx="241" cy="128" rx="6.5" ry="4.5" fill="#7A1F3D" />

          {/* หนวด */}
          <g className={c.stache}>
            <path
              d="M221 121 Q232 112 241 118 Q250 111 262 118 Q250 126 241 121 Q232 126 221 121Z"
              fill="#3B2410"
            />
          </g>
        </g>
      </g>
    </g>
  );
}

// ขา + รองเท้า (ท่ายืนเฉยๆ ส่ง class เป็นสตริงว่าง)
function Legs({ l, r }: { l: string; r: string }) {
  return (
    <>
      <g className={l}>
        <rect x="204" y="254" width="12" height="16" rx="5" fill={SKIN} />
        <path
          d="M190 276 Q190 266 208 266 L226 268 Q232 276 224 280 L196 282 Q190 281 190 276Z"
          fill={SHOE}
        />
      </g>
      <g className={r}>
        <rect x="264" y="252" width="12" height="16" rx="5" fill={SKIN} />
        <path
          d="M290 274 Q290 264 272 264 L254 266 Q248 274 256 278 L284 280 Q290 279 290 274Z"
          fill={SHOE}
        />
      </g>
    </>
  );
}

// กางเกง
function Shorts() {
  return (
    <path
      d="M188 204 Q240 218 292 204 L298 240 Q292 260 272 260 L252 244 Q240 238 228 244 L208 260 Q188 260 182 240 Z"
      fill={SHORTS}
    />
  );
}

// พุง + ผ้ากล้าม
function Belly({ cls }: { cls: string }) {
  return (
    <g className={cls}>
      <ellipse cx="240" cy="198" rx="56" ry="15" fill={SKIN} />
      <circle cx="240" cy="197" r="2.4" fill={NOSE} />
      <path
        d="M198 116 Q240 142 282 116 L300 160 Q312 190 296 193 Q240 202 184 193 Q168 190 180 160 Z"
        fill={TANK}
      />
    </g>
  );
}

// หยดเหงื่อช้าๆ (เหนื่อย/นั่ง) dy = ระยะที่หัวต่ำลงจากท่ายืน
function PantSweat({ dy }: { dy: number }) {
  return (
    <>
      <path
        className="jmp-slow jmp-fb jmp-t-drop-a"
        d={`M196 ${66 + dy} Q202 ${74 + dy} 196 ${80 + dy} Q190 ${74 + dy} 196 ${66 + dy}Z`}
        fill={SWEAT}
      />
      <path
        className="jmp-slow jmp-fb jmp-t-drop-b"
        d={`M286 ${62 + dy} Q292 ${70 + dy} 286 ${76 + dy} Q280 ${70 + dy} 286 ${62 + dy}Z`}
        fill={SWEAT}
      />
    </>
  );
}

// รองเท้าวงกลมหันหน้าเข้าหาคนดู (ตอนนั่ง ไม่เห็นขา)
function FrontShoe({ cx, cy, cls }: { cx: number; cy: number; cls?: string }) {
  return (
    <g className={cls ? `${cls} jmp-fb` : undefined}>
      <circle cx={cx} cy={cy} r="15" fill={SHOE} />
      <circle cx={cx} cy={cy} r="9.5" fill="none" stroke={SHOE_LINE} strokeWidth="2.5" />
    </g>
  );
}

// ฝุ่นฟุ้งตอนก้นถึงพื้น
function Puffs() {
  return (
    <>
      <circle
        className="jmp-once jmp-fb jmp-puff"
        style={{ "--px": "-16px" } as CSSProperties}
        cx="176"
        cy="306"
        r="10"
        fill="#EAF7C9"
      />
      <circle
        className="jmp-once jmp-fb jmp-puff"
        style={{ "--px": "16px" } as CSSProperties}
        cx="304"
        cy="306"
        r="10"
        fill="#EAF7C9"
      />
    </>
  );
}

// พื้น: เงาใต้ตัว
function Shadow({ rx = 54 }: { rx?: number }) {
  return <ellipse cx="240" cy="298" rx={rx} ry="7" fill="#000" opacity=".2" />;
}

/* ------------------------------------------------------------------ */
/* ฉากของแต่ละท่า                                                        */
/* ------------------------------------------------------------------ */

type SmilCommon = { keyTimes: string; dur: string; repeatCount: "indefinite" };

// ท่ากระโดด (และท่า wind ที่โดดช้า/เตี้ยลง ใช้ฉากเดียวกัน)
function JumpScene({ speed, effects, smil }: { speed: number; effects: boolean; smil: SmilCommon }) {
  return (
    <>
      {/* เงาพื้น + ฝุ่นตอนลงพื้น */}
      {effects && (
        <>
          <ellipse
            className="jmp-anim jmp-fb jmp-shadow"
            cx="240"
            cy="296"
            rx="52"
            ry="7"
            fill="#000"
          />
          <circle className="jmp-anim jmp-fb jmp-dust-l" cx="204" cy="291" r="9" fill="#000" />
          <circle className="jmp-anim jmp-fb jmp-dust-r" cx="276" cy="291" r="9" fill="#000" />
        </>
      )}

      <g transform={`translate(240 ${FEET_Y})`}>
        <g className="jmp-anim jmp-jump">
          <g transform={`translate(-240 -${FEET_Y})`}>
            {/* เชือกช่วงขึ้น (อยู่หลังตัว) เห็นเฉพาะครึ่งหลังของรอบ */}
            <path
              d={ROPE_VALUES[0]}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0"
            >
              <animate attributeName="d" values={ROPE_VALUES.join(";")} {...smil} />
              <animate
                attributeName="opacity"
                values="0;1"
                keyTimes="0;0.5"
                calcMode="discrete"
                dur={`${speed}s`}
                repeatCount="indefinite"
              />
            </path>

            {/* แขน (ปลายแขนตามข้อมือ) */}
            <path
              d={ARM_L_VALUES[0]}
              fill="none"
              stroke={SKIN}
              strokeWidth="26"
              strokeLinecap="round"
            >
              <animate attributeName="d" values={ARM_L_VALUES.join(";")} {...smil} />
            </path>
            <path
              d={ARM_R_VALUES[0]}
              fill="none"
              stroke={SKIN}
              strokeWidth="26"
              strokeLinecap="round"
            >
              <animate attributeName="d" values={ARM_R_VALUES.join(";")} {...smil} />
            </path>

            <Legs l="jmp-anim jmp-foot-l" r="jmp-anim jmp-foot-r" />
            <Shorts />
            <Belly cls="jmp-anim jmp-belly" />

            {/* เหงื่อกระเด็น */}
            {effects && (
              <>
                <path
                  className="jmp-anim jmp-fb jmp-sweat-a"
                  d="M196 66 Q202 74 196 80 Q190 74 196 66Z"
                  fill={SWEAT}
                />
                <path
                  className="jmp-anim jmp-fb jmp-sweat-b"
                  d="M286 62 Q292 70 286 76 Q280 70 286 62Z"
                  fill={SWEAT}
                />
              </>
            )}

            <Head c={HEAD_JUMP} />

            {/* เชือกช่วงลง (อยู่หน้าตัว ผ่านหน้าและหัว) เห็นเฉพาะครึ่งแรกของรอบ */}
            <path
              d={ROPE_VALUES[0]}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <animate attributeName="d" values={ROPE_VALUES.join(";")} {...smil} />
              <animate
                attributeName="opacity"
                values="1;0"
                keyTimes="0;0.5"
                calcMode="discrete"
                dur={`${speed}s`}
                repeatCount="indefinite"
              />
            </path>

            {/* มือ + ด้ามเชือก (หมุนวนตามเชือก) */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values={moveValues(OFF_L)}
                {...smil}
              />
              <line x1="140" y1="203" x2="172" y2="214" stroke="#111" strokeWidth="8" strokeLinecap="round" />
              <circle cx={HL.x + 2} cy={HL.y + 2} r="13" fill={SKIN} />
            </g>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values={moveValues(OFF_R)}
                {...smil}
              />
              <line x1="310" y1="213" x2="342" y2="200" stroke="#111" strokeWidth="8" strokeLinecap="round" />
              <circle cx={HR.x - 2} cy={HR.y + 2} r="13" fill={SKIN} />
            </g>
          </g>
        </g>
      </g>
    </>
  );
}

// ท่าเหนื่อย (2.4 วิ): ตัวยวบลงจากท่าลงพื้น เชือกหลุดมือตกพื้น แขนห้อย หอบ แล้วยกมือปาดเหงื่อ
function TiredScene({ effects }: { effects: boolean }) {
  const T = 2.4;
  // ไทม์ไลน์มือขวา: 0 ท่าโดด -> .23 ห้อย -> .40 ห้อย -> ปาดไปมา -> .90 ห้อย
  const kt = [0, 0.23, 0.4, 0.52, 0.6, 0.68, 0.76, 0.9, 1];
  const rArms = [
    ARM_R_VALUES[0],
    TIRED_ARM_R,
    TIRED_ARM_R,
    WIPE_ARM_A,
    WIPE_ARM_B,
    WIPE_ARM_A,
    WIPE_ARM_B,
    TIRED_ARM_R,
    TIRED_ARM_R,
  ];
  const rHands: P[] = [
    JUMP_HAND_R,
    TIRED_HAND_R,
    TIRED_HAND_R,
    WIPE_A,
    WIPE_B,
    WIPE_A,
    WIPE_B,
    TIRED_HAND_R,
    TIRED_HAND_R,
  ];
  return (
    <g style={{ "--jmp-slow": "1.1s" } as CSSProperties}>
      {effects && <Shadow />}

      {/* แขนซ้ายตกลงมาห้อย (อยู่หลังลำตัว) */}
      <Arm paths={[ARM_L_VALUES[0], TIRED_ARM_L]} dur={0.55} />

      {/* ตัวยวบรับแรงตอนหยุดโดด */}
      <Pivot cx={240} cy={FEET_Y} cls="jmp-once jmp-settle">
        <Legs l="" r="" />
        <Shorts />
        <g transform="translate(0 6)">
          <Belly cls="jmp-slow jmp-t-breath" />
        </g>
        {effects && <PantSweat dy={9} />}
        {/* หัวก้มลงช้าๆ แล้วหอบ */}
        <Pivot cx={240} cy={135} cls="jmp-once jmp-droop">
          <Head c={HEAD_PANT} />
        </Pivot>
      </Pivot>

      {/* เชือกหลุดมือตกลงพื้น */}
      <Rope paths={[ROPE_VALUES[0], FLOOR_ROPE]} dur={0.6} begin={0.05} ease=".5 0 .9 .6" />
      <Handle frames={[JUMP_HANDLE_L, FLOOR_HANDLE_L]} dur={0.5} begin={0.08} />
      <Handle frames={[JUMP_HANDLE_R, FLOOR_HANDLE_R]} dur={0.5} begin={0.08} />
      <Hand pts={[JUMP_HAND_L, TIRED_HAND_L]} dur={0.55} />

      {/* มือขวาห้อย แล้วยกขึ้นปาดเหงื่อที่หน้าผาก (วาดทับหน้า) */}
      <Arm paths={rArms} dur={T} kt={kt} />
      <Hand pts={rHands} dur={T} kt={kt} />
    </g>
  );
}

// ท่าทิ้งตัวลงนั่ง (1 วิ): ย่อ -> ทิ้งตัว -> ก้นถึงพื้นยวบ + ฝุ่นฟุ้ง -> เด้งเบาๆ
function SitDownScene({ effects }: { effects: boolean }) {
  const kt = [0, 0.2, 0.7, 1];
  return (
    <g style={{ "--jmp-slow": "1.1s" } as CSSProperties}>
      {effects && <Shadow />}

      {/* แขนกวาดไปยันพื้นด้านหลัง */}
      <Arm paths={[TIRED_ARM_L, TIRED_ARM_L, REST_ARM_L, REST_ARM_L]} dur={1} kt={kt} />
      <Arm paths={[TIRED_ARM_R, TIRED_ARM_R, REST_ARM_R, REST_ARM_R]} dur={1} kt={kt} />
      <Hand pts={[TIRED_HAND_L, TIRED_HAND_L, REST_HAND_L, REST_HAND_L]} dur={1} kt={kt} />
      <Hand pts={[TIRED_HAND_R, TIRED_HAND_R, REST_HAND_R, REST_HAND_R]} dur={1} kt={kt} />

      {/* ขาพับหายไป */}
      <Pivot cx={240} cy={FEET_Y} cls="jmp-once jmp-legs-fold">
        <Legs l="" r="" />
      </Pivot>

      {/* ลำตัว + หัวทิ้งตัวลง */}
      <Pivot cx={240} cy={FEET_Y} cls="jmp-once jmp-sitdown">
        <Shorts />
        <g transform="translate(0 6)">
          <Belly cls="jmp-slow jmp-t-breath" />
        </g>
        {effects && <PantSweat dy={9} />}
        <Pivot cx={240} cy={135} cls="jmp-once jmp-sit-head">
          <Head c={HEAD_PANT} />
        </Pivot>
      </Pivot>

      <Rope paths={[FLOOR_ROPE]} dur={0.01} />
      <Handle frames={[FLOOR_HANDLE_L]} dur={0.01} />
      <Handle frames={[FLOOR_HANDLE_R]} dur={0.01} />

      {/* รองเท้าวงกลมโผล่มาตอนขาพับ */}
      <FrontShoe cx={195} cy={300} cls="jmp-once jmp-shoe-in" />
      <FrontShoe cx={285} cy={300} cls="jmp-once jmp-shoe-in" />

      {effects && <Puffs />}
    </g>
  );
}

// ฉากนั่งที่ใช้ร่วมกันระหว่างนั่งพักและหลับ: ต่างกันที่หัวและเอฟเฟกต์
function SeatedBase({
  effects,
  head,
}: {
  effects: boolean;
  head: ReactNode;
}) {
  return (
    <>
      {effects && <Shadow rx={74} />}

      {/* แขนยันพื้นด้านหลัง (อยู่หลังลำตัว) */}
      <Arm paths={[REST_ARM_L]} dur={0.01} />
      <Arm paths={[REST_ARM_R]} dur={0.01} />
      <circle cx={REST_HAND_L.x} cy={REST_HAND_L.y} r="13" fill={SKIN} />
      <circle cx={REST_HAND_R.x} cy={REST_HAND_R.y} r="13" fill={SKIN} />

      {/* ลำตัวนั่ง: กางเกง + พุง + หัว (ไม่เห็นขา) */}
      <g transform={`translate(0 ${SIT_Y})`}>
        <Shorts />
        <g transform="translate(0 6)">
          <Belly cls="jmp-slow jmp-t-breath" />
        </g>
        {head}
      </g>

      {/* เชือกวางบนพื้น */}
      <path
        d={FLOOR_ROPE}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Handle frames={[FLOOR_HANDLE_L]} dur={0.01} />
      <Handle frames={[FLOOR_HANDLE_R]} dur={0.01} />

      {/* รองเท้าวงกลมหันหน้าเข้าหาคนดู */}
      <FrontShoe cx={195} cy={300} />
      <FrontShoe cx={285} cy={300} />
    </>
  );
}

// ท่านั่งพัก (3 วิ): นั่งหอบ เงยหน้านิดๆ ถอนหายใจเป็นควัน
function RestScene({ effects }: { effects: boolean }) {
  return (
    <g style={{ "--jmp-slow": "2.4s" } as CSSProperties}>
      <SeatedBase
        effects={effects}
        head={
          <>
            {effects && <PantSweat dy={9} />}
            <g transform="translate(0 9) rotate(-4 240 135)">
              <Head c={HEAD_PANT} />
            </g>
          </>
        }
      />
      {/* ควันถอนหายใจ "เฮ้อ" ออกจากปาก */}
      {effects && (
        <g fill="#FFFFFF">
          <circle className="jmp-once jmp-fb jmp-sigh" style={{ animationDelay: ".2s" }} cx="262" cy="186" r="4" />
          <circle className="jmp-once jmp-fb jmp-sigh" style={{ animationDelay: ".45s" }} cx="266" cy="190" r="6" />
          <circle className="jmp-once jmp-fb jmp-sigh" style={{ animationDelay: ".7s" }} cx="270" cy="194" r="8" />
        </g>
      )}
    </g>
  );
}

// ท่าหลับ (5.2 วิ): พยักหน้างีบ หลับตา ฟองน้ำมูกพองยุบ ตัว Z ลอยขึ้น
function SleepScene({ effects }: { effects: boolean }) {
  return (
    <g style={{ "--jmp-slow": "3.6s" } as CSSProperties}>
      <SeatedBase
        effects={false}
        head={
          <g transform="translate(0 9)">
            <Pivot cx={240} cy={135} cls="jmp-once jmp-nod">
              <Head c={HEAD_SLEEP} arcs="in" snore />
            </Pivot>
          </g>
        }
      />
      {effects && <Shadow rx={74} />}

      {/* ตัว Z ใหญ่ขึ้น แต่ละตัวมีช่องของตัวเอง เรียงเฉียงขึ้นไปทางขวาบน (พ้นผมที่เอียง) ไม่ซ้อนกัน */}
      <g
        fill={TANK}
        fontWeight="800"
        fontFamily="ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif"
        stroke="#1B2A21"
        strokeWidth="1.5"
        paintOrder="stroke"
      >
        <text className="jmp-zzz jmp-z1" x="342" y="100" fontSize="30">Z</text>
        <text className="jmp-zzz jmp-z2" x="352" y="58" fontSize="40">Z</text>
        <text className="jmp-zzz jmp-z3" x="352" y="10" fontSize="52">Z</text>
      </g>
    </g>
  );
}

// ท่าตื่น + ลุกขึ้น (2 วิ): สะดุ้ง มี ! -> ย่อตัวแล้วดีดขึ้น -> หิ้วเชือกขึ้นจากพื้น
// -> แกว่งเชือกขึ้นหลังตัว -> ท่าสุดท้ายตรงกับจังหวะแรกของท่ากระโดดพอดี (ตัว หัว ผม มือ เชือก เงา)
function WakeScene({ effects, speed }: { effects: boolean; speed: number }) {
  const T = 2;
  // ความยาวช่วงละจังหวะของเชือกตอนโดดจริง (สัดส่วนของ T) ให้ความเร็วตรงกัน
  const s = Math.min(speed / 8 / T, 0.08);
  // 0 นั่ง | .14 นั่งค้าง(สะดุ้ง) | .34 แขนห้อย | .46 หิ้วเชือกขึ้นมา | 3 จังหวะสุดท้าย = เชือกขึ้นหลังตัวเข้าท่าโดด
  const kt = [0, 0.14, 0.34, 0.46, 1 - 3 * s, 1 - 2 * s, 1 - s, 1];
  // ช่วงท้ายใช้ linear เพื่อไม่ให้สะดุดตามจังหวะ เหมือนท่ากระโดดจริง
  const ease = [
    ".4 0 .2 1",
    ".4 0 .2 1",
    ".4 0 .2 1",
    ".5 0 1 1",
    "0 0 1 1",
    "0 0 1 1",
    "0 0 1 1",
  ];
  const UP = [5, 6, 7, 8]; // จังหวะที่เชือกขึ้นหลังตัว

  const armsL = [REST_ARM_L, REST_ARM_L, TIRED_ARM_L, TIRED_ARM_L, ...UP.map((i) => ARM_L_VALUES[i])];
  const armsR = [REST_ARM_R, REST_ARM_R, TIRED_ARM_R, TIRED_ARM_R, ...UP.map((i) => ARM_R_VALUES[i])];
  const handsL: P[] = [REST_HAND_L, REST_HAND_L, TIRED_HAND_L, TIRED_HAND_L, ...UP.map(jumpHandL)];
  const handsR: P[] = [REST_HAND_R, REST_HAND_R, TIRED_HAND_R, TIRED_HAND_R, ...UP.map(jumpHandR)];
  const handlesL = [FLOOR_HANDLE_L, FLOOR_HANDLE_L, FLOOR_HANDLE_L, HANG_HANDLE_L, ...UP.map(jumpHandleL)];
  const handlesR = [FLOOR_HANDLE_R, FLOOR_HANDLE_R, FLOOR_HANDLE_R, HANG_HANDLE_R, ...UP.map(jumpHandleR)];
  const ropes = [FLOOR_ROPE, FLOOR_ROPE, FLOOR_ROPE, HANG_ROPE, ...UP.map((i) => ROPE_VALUES[i])];

  // เชือกอยู่หน้าตัวตอนกองพื้น แล้วสลับไปอยู่หลังตัวตอนเริ่มแกว่งขึ้น (เหมือนท่ากระโดดช่วงขึ้น)
  const swapAt = kt[3];

  return (
    <g>
      {/* เงาค่อยๆ หดตามตัวที่ลุกและตรงกับเงาท่ากระโดดตอนจบ */}
      {effects && (
        <ellipse
          className="jmp-once jmp-fb jmp-wake-shadow"
          cx="240"
          cy="296"
          rx="52"
          ry="7"
          fill="#000"
        />
      )}

      {/* เชือกช่วงหลังตัว (โผล่หลังหิ้วขึ้นมา) */}
      <g opacity="0">
        <animate
          attributeName="opacity"
          values="0;1"
          keyTimes={`0;${swapAt}`}
          calcMode="discrete"
          dur={`${T}s`}
          fill="freeze"
        />
        <Rope paths={ropes} dur={T} kt={kt} ease={ease} />
      </g>

      {/* แขนยกจากพื้น -> ห้อย -> แกว่งกลับไปจับเชือก (อยู่หลังลำตัว) */}
      <Arm paths={armsL} dur={T} kt={kt} ease={ease} />
      <Arm paths={armsR} dur={T} kt={kt} ease={ease} />

      {/* ขากางออกมาตอนลุก */}
      <Pivot cx={240} cy={FEET_Y} cls="jmp-once jmp-legs-unfold">
        <Legs l="" r="" />
      </Pivot>

      {/* ลำตัวย่อแล้วดีดขึ้น จบด้วยท่าย่อเตรียมโดด (ตรงกับจังหวะแรกของท่ากระโดด) */}
      <Pivot cx={240} cy={FEET_Y} cls="jmp-once jmp-standup">
        <Shorts />
        <g transform="translate(0 5)">
          <Belly cls="" />
        </g>
        <Pivot cx={240} cy={135} cls="jmp-once jmp-wake-head">
          <Head c={HEAD_WAKE} arcs="out" />
        </Pivot>
      </Pivot>

      {/* เชือกช่วงหน้าตัว (ตอนกองพื้น/เพิ่งหิ้วขึ้น) หายไปเมื่อสลับไปอยู่หลังตัว */}
      <g>
        <animate
          attributeName="opacity"
          values="1;0"
          keyTimes={`0;${swapAt}`}
          calcMode="discrete"
          dur={`${T}s`}
          fill="freeze"
        />
        <Rope paths={ropes} dur={T} kt={kt} ease={ease} />
        <Handle frames={handlesL} dur={T} kt={kt} ease={ease} />
        <Handle frames={handlesR} dur={T} kt={kt} ease={ease} />
      </g>

      {/* รองเท้าวงกลมหายไปตอนขากางออก */}
      <FrontShoe cx={195} cy={300} cls="jmp-once jmp-shoe-out" />
      <FrontShoe cx={285} cy={300} cls="jmp-once jmp-shoe-out" />

      {/* เครื่องหมาย ! ตอนสะดุ้งตื่น */}
      <text
        className="jmp-once jmp-bang"
        x="296"
        y="66"
        fontSize="40"
        fontWeight="900"
        fill="#FF6B9D"
        stroke="#FFFFFF"
        strokeWidth="2"
        paintOrder="stroke"
        fontFamily="ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif"
      >
        !
      </text>

      {/* ด้ามเชือกช่วงหลังตัว + มือ (วาดทับหน้าเหมือนท่ากระโดด) */}
      <g opacity="0">
        <animate
          attributeName="opacity"
          values="0;1"
          keyTimes={`0;${swapAt}`}
          calcMode="discrete"
          dur={`${T}s`}
          fill="freeze"
        />
        <Handle frames={handlesL} dur={T} kt={kt} ease={ease} />
        <Handle frames={handlesR} dur={T} kt={kt} ease={ease} />
      </g>
      <Hand pts={handsL} dur={T} kt={kt} ease={ease} />
      <Hand pts={handsR} dur={T} kt={kt} ease={ease} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* ตัวหลัก                                                               */
/* ------------------------------------------------------------------ */

export default function Jumper({
  size = 220,
  speed = 0.8,
  paused = false,
  effects = true,
  cycle = true,
  phase: forced,
  className,
  label = "ตัวการ์ตูนกำลังกระโดดเชือก",
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [auto, setAuto] = useState<Phase>("jump");
  const [reduced, setReduced] = useState(false);
  const cur: Phase = forced ?? auto;

  // ผู้ใช้ตั้งค่าลดการเคลื่อนไหว: ไม่สลับท่า
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // วนท่า jump -> wind -> tired -> sitdown -> rest -> sleep -> wake -> jump
  useEffect(() => {
    if (forced || !cycle || paused || reduced) return;
    const t = setTimeout(() => {
      setAuto(ORDER[(ORDER.indexOf(auto) + 1) % ORDER.length]);
    }, phaseMs(auto, speed));
    return () => clearTimeout(t);
  }, [auto, forced, cycle, paused, reduced, speed]);

  // หยุด/เล่นแอนิเมชัน SMIL (เชือก แขน มือ) ตาม prop และตามค่า reduced-motion
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    if (paused || reduced) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [paused, reduced, cur]);

  // ท่า wind โดดช้าลงและเตี้ยลง
  const dur = cur === "wind" ? speed * SLOW : speed;
  const cssVars = {
    "--jmp-dur": `${dur}s`,
    "--jmp-amp": cur === "wind" ? WIND_AMP : 1,
    "--jmp-state": paused ? "paused" : "running",
  } as CSSProperties;

  // ค่าร่วมของ SMIL ในท่ากระโดด ให้จังหวะตรงกับเชือก
  const smil: SmilCommon = {
    keyTimes: KEY_TIMES,
    dur: `${dur}s`,
    repeatCount: "indefinite",
  };

  return (
    // key = cur: สลับท่าแล้วสร้าง svg ใหม่ เพื่อให้เวลาของ SMIL เริ่มพร้อม CSS animation
    <svg
      key={cur}
      ref={ref}
      role="img"
      aria-label={label}
      viewBox="90 -24 300 344"
      width={size}
      height={(size * 344) / 300}
      className={className}
      style={{ ...cssVars, overflow: "visible", background: "transparent" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{CSS}</style>

      {(cur === "jump" || cur === "wind") && (
        <JumpScene speed={dur} effects={effects} smil={smil} />
      )}
      {cur === "tired" && <TiredScene effects={effects} />}
      {cur === "sitdown" && <SitDownScene effects={effects} />}
      {cur === "rest" && <RestScene effects={effects} />}
      {cur === "sleep" && <SleepScene effects={effects} />}
      {cur === "wake" && <WakeScene effects={effects} speed={speed} />}
    </svg>
  );
}