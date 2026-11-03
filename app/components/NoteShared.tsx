"use client";

/* ------------------------------------------------------------------ */
/* ของใช้ร่วมของโน๊ต (ใช้ใน DepartmentCard.tsx และ Rank.tsx)              */
/* ------------------------------------------------------------------ */

// กรอบโน๊ต: none = ธรรมดา, fire = ติดไฟ, ice = น้ำแข็ง, gold = ถ้วยรางวัล, neon = นีออน
export type FrameId = "none" | "fire" | "ice" | "gold" | "neon";
// อารมณ์: วาดเป็น SVG เอง ให้หน้าตาเหมือนกันทุกเครื่อง (ไม่พึ่ง emoji ของ OS)
export type MoodId =
  | "happy"
  | "laugh"
  | "love"
  | "sad"
  | "angry"
  | "surprised";
// เก็บใน field เดิม (style) ตัวเดียว: เลือกได้กรอบหรืออารมณ์อย่างใดอย่างหนึ่ง
export type NoteStyle = FrameId | MoodId;

export type Note = {
  text: string;
  style?: NoteStyle | null; // ข้อมูลเก่าที่ไม่มี style = none
  expiresAt: string; // ISO timestamp
};

// โน๊ตที่กำลังลอยจากช่องตัวอย่างไปหาโปรไฟล์ (พิกัดเป็น viewport)
export type Flight = {
  note: Note;
  left: number;
  top: number;
  width: number;
  height: number;
};

// tail = สีหางกรอบคำพูด ให้เข้ากับกรอบ, swatch = สีวงกลมเล็กในตัวเลือก
export const FRAMES: Record<
  FrameId,
  { label: string; tail: string; swatch: string }
> = {
  none: { label: "ธรรมดา", tail: "#FFFFFF", swatch: "" },
  fire: {
    label: "ติดไฟ",
    tail: "#FF9A1F",
    swatch: "linear-gradient(135deg,#ff4d2e,#ff9a1f,#ffe066)",
  },
  ice: {
    label: "น้ำแข็ง",
    tail: "#6CC7F5",
    swatch: "linear-gradient(135deg,#d9f6ff,#6cc7f5)",
  },
  gold: {
    label: "ถ้วยรางวัล",
    tail: "#F5B800",
    swatch: "linear-gradient(135deg,#fff1a8,#d99a00)",
  },
  neon: {
    label: "นีออน",
    tail: "#8A5CFF",
    swatch: "linear-gradient(135deg,#ff4fd8,#00e0ff)",
  },
};
export const FRAME_IDS = Object.keys(FRAMES) as FrameId[];

// สีพื้นวงหน้า: พาสเทลเรียบ 2 มิติ (ใช้ c1 เป็นหลัก)
export const MOODS: Record<MoodId, { label: string; c1: string; c2: string }> =
  {
    happy: { label: "ยิ้ม", c1: "#FFD25A", c2: "#FFD25A" },
    laugh: { label: "หัวเราะ", c1: "#FFD25A", c2: "#FFD25A" },
    love: { label: "หลงรัก", c1: "#FFD25A", c2: "#FFD25A" },
    sad: { label: "เศร้า", c1: "#FFD25A", c2: "#FFD25A" },
    angry: { label: "โกรธ", c1: "#FFD25A", c2: "#FFD25A" },
    surprised: { label: "ตกใจ", c1: "#FFD25A", c2: "#FFD25A" },
  };
export const MOOD_IDS = Object.keys(MOODS) as MoodId[];

// กันค่าแปลกจาก server: ถ้าไม่รู้จักให้ใช้กรอบธรรมดา
export const styleOf = (
  s?: string | null
): { id: NoteStyle; frame: FrameId; mood: MoodId | null; tail: string } => {
  if (s && (MOOD_IDS as string[]).includes(s)) {
    return { id: s as MoodId, frame: "none", mood: s as MoodId, tail: "#FFFFFF" };
  }
  const f = (FRAME_IDS as string[]).includes(s ?? "") ? (s as FrameId) : "none";
  return { id: f, frame: f, mood: null, tail: FRAMES[f].tail };
};

export const NOTE_MAX = 60;
// ช่องกรอกหุบ/ขยาย (ms) ต้องตรงกับ transition ในที่ใช้งาน
export const EDITOR_MS = 340;
export const FLIGHT_MS = 650;

/* ---------- ไอคอนเส้นเล็กๆ (ใช้ currentColor) ---------- */
export function Svg({
  size = 16,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
export const PencilIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </Svg>
);
export const TrashIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);
export const BanIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Svg>
);
export const XIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

/* ---------- หน้าอารมณ์ SVG: 2 มิติแบน ไล้ขอบเส้นบาง มินิมอลน่ารัก กะพริบตา + ขยับหัว ---------- */
export function Face({
  kind,
  size,
  animate = true,
}: {
  kind: MoodId;
  size: number;
  animate?: boolean;
}) {
  const m = MOODS[kind];
  const ink = "#2B1B10";
  const pink = "#FF6B8E";
  const dark = "#4A1F14";
  const line = {
    stroke: ink,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  // ตาจุดกลมแบน กะพริบเฉพาะตอน animate
  const eyes = (y = 22) => (
    <g className="dc-blink">
      <circle cx="16.5" cy={y} r="2.2" fill={ink} />
      <circle cx="31.5" cy={y} r="2.2" fill={ink} />
    </g>
  );
  const heart = (cx: number, cy: number) => (
    <path
      d={`M${cx} ${cy + 5} C${cx - 7} ${cy + 1} ${cx - 5} ${cy - 5} ${cx - 2.5} ${cy - 4.5} C${cx - 1} ${cy - 4.2} ${cx} ${cy - 3} ${cx} ${cy - 2} C${cx} ${cy - 3} ${cx + 1} ${cy - 4.2} ${cx + 2.5} ${cy - 4.5} C${cx + 5} ${cy - 5} ${cx + 7} ${cy + 1} ${cx} ${cy + 5}Z`}
      fill="#FF5C7A"
    />
  );

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`dc-face ${animate ? "dc-live" : ""}`}
      aria-hidden
    >
      {/* วงหน้าเหลืองแบน ไม่มีขอบ ไม่มีเงา (หัวนิ่ง) */}
      <circle cx="24" cy="24" r="22" fill={m.c1} />

      {kind === "happy" && (
        <>
          {eyes(21)}
          <g className="dc-mouth">
            <path d="M16.5 28.5 Q23 34 30 28.5" {...line} />
            <path
              d="M25.5 31.6 Q26 37.5 30.2 35.6 Q31.6 33.2 29.6 30.6Z"
              fill={pink}
              stroke={ink}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </g>
        </>
      )}

      {kind === "laugh" && (
        <>
          <path d="M12.5 15.5 Q15 14 18 15" {...line} strokeWidth={1.7} />
          <path d="M30 15 Q33 14 35.5 15.5" {...line} strokeWidth={1.7} />
          {eyes(21)}
          <g className="dc-mouth">
            <path
              d="M17 29.5 Q24 31.5 31 29.5 Q29.5 37.5 24 37.5 Q18.5 37.5 17 29.5Z"
              fill={dark}
            />
            <ellipse cx="24" cy="35.4" rx="3.6" ry="1.7" fill={pink} />
          </g>
        </>
      )}

      {kind === "love" && (
        <>
          <g className="dc-heart">
            {heart(14.5, 22)}
            {heart(33.5, 22)}
          </g>
          <g className="dc-mouth">
            <path d="M20.5 29.5 Q24 34 27.5 29.5" {...line} />
          </g>
        </>
      )}

      {kind === "sad" && (
        <>
          <path d="M12 17.5 L19 15" {...line} strokeWidth={1.7} />
          <path d="M36 17.5 L29 15" {...line} strokeWidth={1.7} />
          {eyes(22)}
          <g className="dc-mouth">
            <path d="M19 34 Q24 30 29 34" {...line} />
          </g>
          <path
            d="M36.5 27 Q39.2 30.5 36.5 33 Q33.8 30.5 36.5 27Z"
            fill="#7CC8FF"
          />
        </>
      )}

      {kind === "angry" && (
        <>
          <circle cx="10.5" cy="29" r="3" fill="#FF7A59" opacity=".4" />
          <circle cx="37.5" cy="29" r="3" fill="#FF7A59" opacity=".4" />
          <path d="M12 14.5 L19.5 18" {...line} strokeWidth={2.3} />
          <path d="M36 14.5 L28.5 18" {...line} strokeWidth={2.3} />
          {eyes(22.5)}
          <g className="dc-mouth">
            <path d="M19.5 33.5 Q24 30 28.5 33.5" {...line} />
          </g>
        </>
      )}

      {kind === "surprised" && (
        <>
          <path d="M11.5 21.5 L19 19.5" {...line} />
          <path d="M36.5 21.5 L29 19.5" {...line} />
          <g className="dc-mouth">
            <ellipse cx="24" cy="31" rx="3.7" ry="4.6" fill={dark} />
            <ellipse cx="24" cy="33.4" rx="2.3" ry="1.6" fill={pink} />
          </g>
        </>
      )}
    </svg>
  );
}

/* ---------- เอฟเฟกต์ประกอบกรอบโน๊ต (SVG/CSS ล้วน ไม่ใช้ emoji) ---------- */
function Flame({ h }: { h: number }) {
  return (
    <svg
      viewBox="0 0 14 20"
      width={14}
      height={h}
      preserveAspectRatio="none"
      aria-hidden
      className="block"
    >
      <path
        d="M7 0 C8 5 13 8 13 14 C13 18 10 20 7 20 C4 20 1 18 1 14 C1 10 4 9 5 5 C6 7 6.5 4 7 0Z"
        fill="#FF4D2E"
      />
      <path
        d="M7 8 C8 11 10.5 12 10.5 15.5 C10.5 18 9 19.5 7 19.5 C5 19.5 3.5 18 3.5 15.5 C3.5 12.5 6 11.5 7 8Z"
        fill="#FFE066"
      />
    </svg>
  );
}

function Sparkle({
  size,
  color,
  className,
  style,
}: {
  size: number;
  color: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 10 10"
      width={size}
      height={size}
      aria-hidden
      className={className}
      style={style}
    >
      <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4Z" fill={color} />
    </svg>
  );
}

function Trophy({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="dc-trophy-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF3B0" />
          <stop offset=".55" stopColor="#F5B800" />
          <stop offset="1" stopColor="#D99A00" />
        </linearGradient>
      </defs>
      {/* ไม่มีเส้นกรอบดำ: ใช้สีทองล้วน */}
      <path d="M7 3h10v5.5a5 5 0 01-10 0V3z" fill="url(#dc-trophy-g)" />
      <path
        d="M7 5H4v2a3 3 0 003 3M17 5h3v2a3 3 0 01-3 3"
        fill="none"
        stroke="#F0B000"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.8 13h2.4v4h-2.4z" fill="#E8A800" />
      <path d="M8.5 17h7a.5.5 0 01.5.5V21H8v-3.5a.5.5 0 01.5-.5z" fill="url(#dc-trophy-g)" />
      <path
        d="M9.2 4.8v3.6"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity=".7"
      />
    </svg>
  );
}

function Fx({ frame }: { frame: FrameId }) {
  const base = "pointer-events-none absolute";

  if (frame === "fire") {
    const flames = [17, 12, 20, 13, 18];
    const embers = [
      { l: "16%", d: "0s", s: 3 },
      { l: "38%", d: ".55s", s: 2.5 },
      { l: "62%", d: "1.05s", s: 3 },
      { l: "84%", d: ".3s", s: 2.5 },
    ];
    return (
      <>
        <span
          aria-hidden
          className={`${base} inset-x-1.5 bottom-[calc(100%-5px)] flex items-end justify-between`}
        >
          {flames.map((h, i) => (
            <span
              key={i}
              className="dc-anim dc-flame block"
              style={{
                animationDelay: `${i * 0.18}s`,
                animationDuration: `${0.9 + (i % 3) * 0.2}s`,
              }}
            >
              <Flame h={h} />
            </span>
          ))}
        </span>
        {embers.map((e, i) => (
          <span
            key={i}
            aria-hidden
            className={`${base} dc-anim dc-ember rounded-full bg-[#FFB02E]`}
            style={{
              left: e.l,
              bottom: "calc(100% + 6px)",
              width: e.s,
              height: e.s,
              animationDelay: e.d,
            }}
          />
        ))}
      </>
    );
  }

  if (frame === "ice") {
    return (
      <>
        {[
          { cls: "left-2", hs: [6, 9, 5] },
          { cls: "right-2", hs: [5, 9, 6] },
        ].map((g, gi) => (
          <span
            key={gi}
            aria-hidden
            className={`${base} ${g.cls} top-[calc(100%-3px)] flex items-start gap-px`}
          >
            {g.hs.map((h, i) => (
              <svg
                key={i}
                viewBox="0 0 5 9"
                width={5}
                height={h}
                preserveAspectRatio="none"
                aria-hidden
              >
                <polygon points="0,0 5,0 2.5,9" fill="#D9F6FF" />
              </svg>
            ))}
          </span>
        ))}
        <Sparkle
          size={11}
          color="#FFFFFF"
          className={`${base} dc-anim dc-twinkle -left-2 -top-2.5`}
        />
        <Sparkle
          size={9}
          color="#BFEBFF"
          className={`${base} dc-anim dc-twinkle -right-1.5 -top-3`}
          style={{ animationDelay: ".7s" }}
        />
        <Sparkle
          size={8}
          color="#FFFFFF"
          className={`${base} dc-anim dc-twinkle -right-2 top-1/2`}
          style={{ animationDelay: "1.3s" }}
        />
      </>
    );
  }

  if (frame === "gold") {
    return (
      <>
        {/* ถ้วยอยู่มุมบนขวา เหมือนตำแหน่งอิโมจิ */}
        <span
          aria-hidden
          className={`${base} dc-anim dc-bobr -right-3 -top-4`}
        >
          <span className="block drop-shadow-[0_0_4px_rgba(255,200,40,.9)]">
            <Trophy size={22} />
          </span>
        </span>
        <Sparkle
          size={11}
          color="#FFE27A"
          className={`${base} dc-anim dc-twinkle -left-2.5 top-0`}
        />
        <Sparkle
          size={9}
          color="#FFF6C8"
          className={`${base} dc-anim dc-twinkle left-1/3 -top-2.5`}
          style={{ animationDelay: ".6s" }}
        />
        <Sparkle
          size={8}
          color="#FFE27A"
          className={`${base} dc-anim dc-twinkle -bottom-1.5 right-3`}
          style={{ animationDelay: "1.2s" }}
        />
      </>
    );
  }

  if (frame === "neon") {
    return (
      <>
        <span
          aria-hidden
          className={`${base} dc-anim dc-twinkle -left-1.5 -top-1.5 h-2 w-2 rounded-full bg-[#FF4FD8] shadow-[0_0_8px_3px_rgba(255,79,216,.8)]`}
        />
        <span
          aria-hidden
          className={`${base} dc-anim dc-twinkle -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-[#00E0FF] shadow-[0_0_8px_3px_rgba(0,224,255,.8)]`}
          style={{ animationDelay: ".5s" }}
        />
        <span
          aria-hidden
          className={`${base} dc-anim dc-twinkle -bottom-1 right-4 h-1.5 w-1.5 rounded-full bg-[#8A5CFF] shadow-[0_0_8px_3px_rgba(138,92,255,.9)]`}
          style={{ animationDelay: "1s" }}
        />
      </>
    );
  }

  return null;
}

/* ---------- กล่องโน๊ต: กรอบเคลื่อนไหว + พื้นสี/สีตัวอักษรตามกรอบ + เอฟเฟกต์ ---------- */
export function NoteBox({
  text,
  frame,
  clamp,
  boxRef,
  opacity,
}: {
  text: string;
  frame: FrameId;
  clamp?: boolean;
  boxRef?: React.Ref<HTMLSpanElement>;
  opacity?: number;
}) {
  const label = clamp ? (
    <span className="line-clamp-2 break-words">{text}</span>
  ) : (
    <span className="break-words">{text}</span>
  );

  return (
    <span
      className="relative block"
      style={opacity !== undefined ? { opacity } : undefined}
    >
      <Fx frame={frame} />
      <span
        ref={boxRef}
        className={`dc-anim dc-f-${frame} relative block rounded-2xl p-[2.5px]`}
      >
        <span
          className={`dc-in dc-in-${frame} relative block overflow-hidden rounded-[14px] px-3 py-1.5 text-center font-[inherit] text-[12px] font-semibold leading-snug`}
        >
          {frame === "fire" ? (
            <>
              {/* ชั้นแสงเรืองสีส้มด้านหลัง เต้นเป็นจังหวะ */}
              <span
                aria-hidden
                className="dc-anim dc-fire-glow absolute inset-0 block px-3 py-1.5"
              >
                {label}
              </span>
              {/* ตัวอักษรไล่สีแดง-ส้ม-เหลือง เหมือนไฟลุก */}
              <span className="dc-fire-text relative block">{label}</span>
            </>
          ) : (
            label
          )}
        </span>
      </span>
    </span>
  );
}

/* ---------- CSS ของกรอบ/อารมณ์/เอฟเฟกต์ ---------- */
// วาง <NoteStyles /> หนึ่งตัวในที่ที่ใช้ NoteBox / Face (วางซ้ำได้ ไม่เสียหาย)
export function NoteStyles() {
  return (
    <style>{`
      /* ---------- กรอบโน๊ต ---------- */
      @keyframes dc-shift {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      @keyframes dc-flicker {
        0% { box-shadow: 0 0 6px 1px rgba(255,77,46,.5), 0 -3px 10px 1px rgba(255,154,31,.45); }
        30% { box-shadow: 0 0 11px 3px rgba(255,77,46,.7), 0 -6px 14px 2px rgba(255,224,102,.55); }
        60% { box-shadow: 0 0 7px 1px rgba(255,100,30,.55), 0 -4px 9px 1px rgba(255,154,31,.4); }
        100% { box-shadow: 0 0 12px 3px rgba(255,77,46,.75), 0 -7px 15px 2px rgba(255,224,102,.55); }
      }
      @keyframes dc-frost {
        0%, 100% { box-shadow: 0 0 6px 1px rgba(108,199,245,.5), 0 0 14px 2px rgba(200,240,255,.35); }
        50% { box-shadow: 0 0 10px 2px rgba(108,199,245,.75), 0 0 20px 4px rgba(200,240,255,.55); }
      }
      @keyframes dc-shine {
        0%, 100% { box-shadow: 0 0 6px 1px rgba(245,184,0,.55); }
        50% { box-shadow: 0 0 13px 3px rgba(255,214,60,.85); }
      }
      @keyframes dc-glowneon {
        0%, 100% { box-shadow: 0 0 6px 1px rgba(138,92,255,.6), 0 0 14px 2px rgba(0,224,255,.35); }
        50% { box-shadow: 0 0 11px 3px rgba(255,79,216,.7), 0 0 20px 4px rgba(0,224,255,.5); }
      }
      .dc-f-none { background: #fff; }
      .dc-f-fire {
        background: linear-gradient(90deg,#ff4d2e,#ff9a1f,#ffe066,#ff9a1f,#ff4d2e);
        background-size: 200% 100%;
        animation: dc-shift 1.6s linear infinite, dc-flicker .9s ease-in-out infinite alternate;
      }
      .dc-f-ice {
        background: linear-gradient(90deg,#d9f6ff,#6cc7f5,#f2fdff,#6cc7f5,#d9f6ff);
        background-size: 200% 100%;
        animation: dc-shift 3.2s linear infinite, dc-frost 2.4s ease-in-out infinite;
      }
      .dc-f-gold {
        background: linear-gradient(90deg,#fff1a8,#f5b800,#fff7cf,#d99a00,#fff1a8);
        background-size: 200% 100%;
        animation: dc-shift 2.6s linear infinite, dc-shine 2s ease-in-out infinite;
      }
      .dc-f-neon {
        background: linear-gradient(90deg,#ff4fd8,#6a5cff,#00e0ff,#6a5cff,#ff4fd8);
        background-size: 200% 100%;
        animation: dc-shift 2.2s linear infinite, dc-glowneon 2s ease-in-out infinite;
      }

      /* ---------- พื้นในกล่องข้อความ + สีตัวอักษร ตามกรอบ ---------- */
      @keyframes dc-textneon {
        0%, 18%, 22%, 62%, 66%, 100% {
          text-shadow: 0 0 3px #fff, 0 0 7px #00e0ff, 0 0 14px #ff4fd8;
          opacity: 1;
        }
        20%, 64% { text-shadow: none; opacity: .75; }
      }
      @keyframes dc-textice {
        0%, 100% { text-shadow: 0 0 5px rgba(190,240,255,.9), 0 0 10px rgba(108,199,245,.6); }
        50% { text-shadow: 0 0 8px rgba(255,255,255,1), 0 0 16px rgba(150,220,255,.9); }
      }
      @keyframes dc-textgold {
        0%, 100% { text-shadow: 0 0 5px rgba(255,200,40,.8), 0 1px 0 rgba(60,30,0,.9); }
        50% { text-shadow: 0 0 10px rgba(255,225,90,1), 0 1px 0 rgba(60,30,0,.9); }
      }
      @keyframes dc-sweep {
        0%, 35% { transform: translateX(-130%); }
        75%, 100% { transform: translateX(130%); }
      }
      .dc-in-none { background: #fff; color: #1B2A21; }

      /* ไฟ: พื้นมืดให้ไฟเด่น ตัวอักษรไล่สี + แสงเรืองสีส้มเต้นอยู่ด้านหลัง */
      @keyframes dc-glowpulse {
        0% { opacity: .65; transform: scale(1); }
        100% { opacity: 1; transform: scale(1.06); }
      }
      .dc-in-fire {
        background:
          radial-gradient(120% 80% at 50% 130%, rgba(255,77,46,.5), transparent 60%),
          linear-gradient(180deg,#2A0B14 0%,#190C28 100%);
        color: #FF9A1F;
        box-shadow: inset 0 -6px 10px rgba(255,90,0,.3), inset 0 0 8px rgba(0,0,0,.5);
      }
      /* ใช้ฟอนต์เดียวกับหน้าตั้งค่า (ฟอนต์แอป ตัวตรง semibold) */
      .dc-fire-text {
        font-family: inherit;
        font-weight: 600;
        background-image: linear-gradient(to top, #FF4D2E, #FF9A1F, #FFE066);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      }
      .dc-fire-glow {
        font-family: inherit;
        font-weight: 600;
        color: #FF7A1A;
        filter: blur(5px);
        animation: dc-glowpulse .5s ease-in-out infinite alternate;
      }

      .dc-in-ice {
        background:
          radial-gradient(100% 70% at 50% -10%, rgba(255,255,255,.35), transparent 65%),
          linear-gradient(180deg,#3A93D6 0%,#144E80 100%);
        color: #EAFBFF;
        box-shadow: inset 0 0 10px rgba(220,248,255,.55);
        animation: dc-textice 2.4s ease-in-out infinite;
      }
      .dc-in-gold {
        background:
          radial-gradient(100% 70% at 50% -10%, rgba(255,215,80,.35), transparent 65%),
          linear-gradient(180deg,#7C4D00 0%,#3C2300 100%);
        color: #FFE27A;
        box-shadow: inset 0 0 9px rgba(255,200,40,.45);
        animation: dc-textgold 2s ease-in-out infinite;
      }
      .dc-in-gold::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.5) 50%, transparent 65%);
        animation: dc-sweep 2.8s ease-in-out infinite;
      }
      .dc-in-neon {
        background: linear-gradient(180deg,#14102E 0%,#07071A 100%);
        color: #8FF9FF;
        box-shadow: inset 0 0 10px rgba(138,92,255,.7);
        animation: dc-textneon 3.2s linear infinite;
      }

      /* ---------- เอฟเฟกต์ประกอบ: เปลวไฟ / ประกายไฟ / ประกายดาว / ถ้วย ---------- */
      /* เปลวไฟลอยขึ้นแล้วจางหาย วนซ้ำ */
      @keyframes dc-flame {
        0% { transform: translateY(8px) scale(.6); opacity: 0; }
        30% { opacity: 1; }
        100% { transform: translateY(-12px) scale(1.1); opacity: 0; }
      }
      @keyframes dc-ember {
        0% { transform: translate(0,0) scale(1); opacity: 0; }
        15% { opacity: 1; }
        100% { transform: translate(6px,-22px) scale(.3); opacity: 0; }
      }
      @keyframes dc-twinkle {
        0%, 100% { transform: scale(.4) rotate(0deg); opacity: .25; }
        50% { transform: scale(1.15) rotate(35deg); opacity: 1; }
      }
      @keyframes dc-bob {
        0%, 100% { transform: translate(-50%, 0) rotate(-6deg); }
        50% { transform: translate(-50%, -3px) rotate(6deg); }
      }
      @keyframes dc-bobr {
        0%, 100% { transform: translateY(0) rotate(-6deg); }
        50% { transform: translateY(-3px) rotate(6deg); }
      }
      .dc-flame {
        transform-origin: 50% 100%;
        animation-name: dc-flame;
        animation-iteration-count: infinite;
        animation-timing-function: ease-out;
      }

      /* ---------- หน้าอารมณ์: หัวนิ่ง ไม่โยกซ้ายขวา / ขยับเบาๆ (กะพริบตา ปากขยุกขยิก หัวใจเต้น) เฉพาะตัวที่เลือก/โพสต์แล้ว ---------- */
      @keyframes dc-blink {
        0%, 90%, 100% { transform: scaleY(1); }
        94% { transform: scaleY(.1); }
      }
      @keyframes dc-mouthmove {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      @keyframes dc-heart {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.12); }
      }
      .dc-face { display: block; overflow: visible; }
      .dc-mouth, .dc-blink, .dc-heart {
        transform-box: fill-box;
        transform-origin: center;
      }
      .dc-live .dc-blink { animation: dc-blink 3.6s infinite; }
      .dc-live .dc-mouth { animation: dc-mouthmove 1.8s ease-in-out infinite; }
      .dc-live .dc-heart { animation: dc-heart 1.1s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .dc-anim { animation: none !important; opacity: 1 !important; }
        .dc-f-fire, .dc-f-ice, .dc-f-gold, .dc-f-neon,
        .dc-fire-glow,
        .dc-in-ice, .dc-in-gold, .dc-in-neon,
        .dc-in-gold::after,
        .dc-flame, .dc-ember, .dc-twinkle, .dc-bob, .dc-bobr,
        .dc-live .dc-mouth, .dc-live .dc-blink, .dc-live .dc-heart { animation: none !important; }
        .dc-ember { opacity: 0 !important; }
      }
    `}</style>
  );
}