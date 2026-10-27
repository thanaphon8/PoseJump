"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

/**
 * ตัวการ์ตูนกระโดดเชือก เล่นวนไม่รู้จบ พื้นหลังโปร่งใส (SVG ล้วน ไม่ใช้รูป)
 *
 * ใช้งาน:
 *   <Jumper />                      // ขนาดเริ่มต้น 220px
 *   <Jumper size={140} />
 *   <Jumper size={96} paused />     // หยุดเล่น
 *   <Jumper speed={0.6} />          // วินาทีต่อ 1 รอบ (ยิ่งน้อยยิ่งเร็ว)
 *   <Jumper effects={false} />      // ปิดเงา ฝุ่น และเหงื่อ
 *
 * ท่าทางในแต่ละรอบ:
 *   - ย่อรับแรงตอนลงพื้น แล้วยืดตัวตอนกระโดด (squash & stretch)
 *   - แขนและข้อมือหมุนตามเชือก เชือกหมุนครบรอบ
 *   - เท้าสองข้างยกไม่พร้อมกัน
 *   - ผม พุง หนวด ผ้าคาดหัว เด้งตามหลังตัวเล็กน้อย
 *   - ศีรษะเอียงสลับ ตาเบิกกว้างตอนลอย กะพริบตา อ้าปากหอบ
 *   - ฝุ่นฟุ้งตอนลงพื้น เหงื่อกระเด็น
 */

type Props = {
  size?: number;
  speed?: number;
  paused?: boolean;
  effects?: boolean;
  className?: string;
  label?: string;
};

// สีตัวการ์ตูน
const HAIR = "#F2B632";
const SKIN = "#FF6B9D";
const NOSE = "#EE3F78";
const TANK = "#C9F25B";
const SHORTS = "#0B76C4";
const BAND = "#2D7DD2";
const SHOE = "#FFFFFF";

const FEET_Y = 282; // จุดหมุนของการยืด/ย่อตัว (ระดับพื้น)

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

const CSS = `
@keyframes jmp-jump {
  0%   { transform: translateY(3px) scale(1.09, .88); }
  16%  { transform: translateY(-7px) scale(.93, 1.09); }
  50%  { transform: translateY(-30px) scale(.98, 1.03); }
  84%  { transform: translateY(-7px) scale(.96, 1.05); }
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

.jmp-anim {
  animation-duration: var(--jmp-dur);
  animation-iteration-count: infinite;
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

@media (prefers-reduced-motion: reduce) { .jmp-anim { animation: none; } }
`;

export default function Jumper({
  size = 220,
  speed = 0.8,
  paused = false,
  effects = true,
  className,
  label = "ตัวการ์ตูนกำลังกระโดดเชือก",
}: Props) {
  const ref = useRef<SVGSVGElement>(null);

  // หยุด/เล่นแอนิเมชัน SMIL (เชือก แขน มือ) ตาม prop และตามค่า reduced-motion
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (paused || reduce.matches) svg.pauseAnimations();
      else svg.unpauseAnimations();
    };
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, [paused]);

  const cssVars = {
    "--jmp-dur": `${speed}s`,
    "--jmp-state": paused ? "paused" : "running",
  } as CSSProperties;

  // ค่าร่วมของ SMIL ทุกตัว ให้จังหวะตรงกับเชือก
  const smil = {
    keyTimes: KEY_TIMES,
    dur: `${speed}s`,
    repeatCount: "indefinite" as const,
  };

  return (
    <svg
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

            {/* ขา + รองเท้า (ซ้ายยกสูงกว่า ขวายกช้ากว่านิดหน่อย) */}
            <g className="jmp-anim jmp-foot-l">
              <rect x="204" y="254" width="12" height="16" rx="5" fill={SKIN} />
              <path
                d="M190 276 Q190 266 208 266 L226 268 Q232 276 224 280 L196 282 Q190 281 190 276Z"
                fill={SHOE}
              />
            </g>
            <g className="jmp-anim jmp-foot-r">
              <rect x="264" y="252" width="12" height="16" rx="5" fill={SKIN} />
              <path
                d="M290 274 Q290 264 272 264 L254 266 Q248 274 256 278 L284 280 Q290 279 290 274Z"
                fill={SHOE}
              />
            </g>

            {/* กางเกง */}
            <path
              d="M188 204 Q240 218 292 204 L298 240 Q292 260 272 260 L252 244 Q240 238 228 244 L208 260 Q188 260 182 240 Z"
              fill={SHORTS}
            />

            {/* พุง + ผ้ากล้าม (เด้งตามหลังตัว) */}
            <g className="jmp-anim jmp-belly">
              <ellipse cx="240" cy="198" rx="56" ry="15" fill={SKIN} />
              <circle cx="240" cy="197" r="2.4" fill={NOSE} />
              <path
                d="M198 116 Q240 142 282 116 L300 160 Q312 190 296 193 Q240 202 184 193 Q168 190 180 160 Z"
                fill={TANK}
              />
            </g>

            {/* เหงื่อกระเด็น */}
            {effects && (
              <>
                <path
                  className="jmp-anim jmp-fb jmp-sweat-a"
                  d="M196 66 Q202 74 196 80 Q190 74 196 66Z"
                  fill="#8FD3FF"
                />
                <path
                  className="jmp-anim jmp-fb jmp-sweat-b"
                  d="M286 62 Q292 70 286 76 Q280 70 286 62Z"
                  fill="#8FD3FF"
                />
              </>
            )}

            {/* หัว: เอียงและเด้งรอบคอ */}
            <g transform="translate(240 135)">
              <g className="jmp-anim jmp-head">
                <g transform="translate(-240 -135)">
                  {/* ผมแอฟโฟร (เด้งช้ากว่าหน้า) */}
                  <g className="jmp-anim jmp-afro">
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
                    <g className="jmp-anim jmp-tail">
                      <g transform="translate(-274 -87)">
                        <path d="M272 82 Q290 76 302 90 L291 94 Q285 88 272 90Z" fill="#FFFFFF" />
                        <path d="M272 86 Q287 82 298 91" fill="none" stroke={BAND} strokeWidth="2" />
                        <path d="M272 91 Q286 99 296 110 L287 112 Q282 102 272 96Z" fill="#FFFFFF" />
                      </g>
                    </g>
                  </g>

                  {/* จมูก ตา (เบิกกว้างตอนลอย + กะพริบ) */}
                  <circle cx="224" cy="110" r="11" fill={NOSE} />
                  <g className="jmp-anim jmp-fb jmp-eyes">
                    <ellipse className="jmp-anim jmp-fb jmp-blink" cx="231" cy="101" rx="2.6" ry="4.2" fill="#1A1A1A" />
                    <ellipse className="jmp-anim jmp-fb jmp-blink" cx="251" cy="101" rx="2.6" ry="4.2" fill="#1A1A1A" />
                  </g>

                  {/* ปากอ้าหอบ (อยู่หลังหนวด) */}
                  <ellipse
                    className="jmp-anim jmp-fb jmp-mouth"
                    cx="241"
                    cy="128"
                    rx="6.5"
                    ry="4.5"
                    fill="#7A1F3D"
                  />

                  {/* หนวด */}
                  <g className="jmp-anim jmp-stache">
                    <path
                      d="M221 121 Q232 112 241 118 Q250 111 262 118 Q250 126 241 121 Q232 126 221 121Z"
                      fill="#3B2410"
                    />
                  </g>
                </g>
              </g>
            </g>

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
    </svg>
  );
}