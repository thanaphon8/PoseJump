"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCompany, getDepartment } from "./departments";
import { branchCode, branchLabel, branchProvince, getBranch } from "./branches";
import { ICONS, Icon } from "./auth-shared";
import { prefetchDeptBoard } from "./DepartmentRank";

// กรอบโน๊ต: none = ธรรมดา, fire = ติดไฟ, ice = น้ำแข็ง, gold = ถ้วยรางวัล, neon = นีออน
type FrameId = "none" | "fire" | "ice" | "gold" | "neon";
// อารมณ์: วาดเป็น SVG เอง ให้หน้าตาเหมือนกันทุกเครื่อง (ไม่พึ่ง emoji ของ OS)
type MoodId = "happy" | "laugh" | "love" | "sad" | "angry" | "surprised";
// เก็บใน field เดิม (style) ตัวเดียว: เลือกได้กรอบหรืออารมณ์อย่างใดอย่างหนึ่ง
type NoteStyle = FrameId | MoodId;

type Note = {
  text: string;
  style?: NoteStyle | null; // ข้อมูลเก่าที่ไม่มี style = none
  expiresAt: string; // ISO timestamp, หมดอายุ 24 ชม. หลังโพสต์
};

type Member = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  isMe?: boolean;
  note?: Note | null;
};

type Data = {
  members: Member[];
  // คะแนนกลุ่มตั้งแต่วันแรก = ครั้งกระโดดรวมของทุกคนในกลุ่ม (แผนก หรือ สาขา)
  allTotal: number;
  // ยอดสัปดาห์นี้ (API ยังส่งมา แต่ตอนนี้ไม่ได้แสดง)
  weekTotal: number;
};

// โน๊ตที่กำลังลอยจากช่องตัวอย่างไปหาโปรไฟล์ (พิกัดเป็น viewport)
type Flight = {
  note: Note;
  left: number;
  top: number;
  width: number;
  height: number;
};

// tail = สีหางกรอบคำพูด ให้เข้ากับกรอบ, swatch = สีวงกลมเล็กในตัวเลือก
const FRAMES: Record<
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
const FRAME_IDS = Object.keys(FRAMES) as FrameId[];

// สีพื้นวงหน้า: พาสเทลเรียบ 2 มิติ (ใช้ c1 เป็นหลัก)
const MOODS: Record<MoodId, { label: string; c1: string; c2: string }> = {
  happy: { label: "ยิ้ม", c1: "#FFD25A", c2: "#FFD25A" },
  laugh: { label: "หัวเราะ", c1: "#FFD25A", c2: "#FFD25A" },
  love: { label: "หลงรัก", c1: "#FFD25A", c2: "#FFD25A" },
  sad: { label: "เศร้า", c1: "#FFD25A", c2: "#FFD25A" },
  angry: { label: "โกรธ", c1: "#FFD25A", c2: "#FFD25A" },
  surprised: { label: "ตกใจ", c1: "#FFD25A", c2: "#FFD25A" },
};
const MOOD_IDS = Object.keys(MOODS) as MoodId[];

// กันค่าแปลกจาก server: ถ้าไม่รู้จักให้ใช้กรอบธรรมดา
const styleOf = (
  s?: string | null
): { id: NoteStyle; frame: FrameId; mood: MoodId | null; tail: string } => {
  if (s && (MOOD_IDS as string[]).includes(s)) {
    return { id: s as MoodId, frame: "none", mood: s as MoodId, tail: "#FFFFFF" };
  }
  const f = (FRAME_IDS as string[]).includes(s ?? "") ? (s as FrameId) : "none";
  return { id: f, frame: f, mood: null, tail: FRAMES[f].tail };
};

const fmtNum = (n: number) => n.toLocaleString("en-US");
const STACK_MAX = 6;
const NOTE_MAX = 60;
// ช่องกรอกหุบ/ขยาย (ms) ต้องตรงกับ transition ด้านล่าง
const EDITOR_MS = 340;
const FLIGHT_MS = 650;

// server กรองหมดอายุให้แล้ว แต่กรองซ้ำฝั่ง client กันกรณีเปิดหน้าค้างไว้ข้าม 24 ชม.
const activeNote = (m: Member): Note | null =>
  m.note && Date.parse(m.note.expiresAt) > Date.now() ? m.note : null;

/* ---------- ไอคอนเส้นเล็กๆ (ใช้ currentColor) ---------- */
function Svg({
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
const PencilIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </Svg>
);
const TrashIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);
const BanIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Svg>
);
const XIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

/* ---------- หน้าอารมณ์ SVG: 2 มิติแบน ไล้ขอบเส้นบาง มินิมอลน่ารัก กะพริบตา + ขยับหัว ---------- */
function Face({
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
function NoteBox({
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

function Avatar({
  name,
  src,
  size,
  ring,
}: {
  name: string;
  src?: string | null;
  size: number;
  ring?: boolean;
}) {
  const [err, setErr] = useState(false);
  const base = `shrink-0 rounded-full ${ring ? "ring-2 ring-white" : ""}`;
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setErr(true)}
        className={`${base} bg-[#1B2A21] object-cover`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`${base} flex items-center justify-center bg-[#1B2A21] font-semibold text-[#C9F25B]`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {(Array.from(name.trim())[0] ?? "?").toUpperCase()}
    </span>
  );
}

export default function DepartmentCard({
  companyId,
  departmentId,
  branchId,
  myUsername,
  onOpenRank,
}: {
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
  myUsername?: string;
  // กดปุ่ม "อันดับ" ใน popup: ให้หน้าแม่สลับไปแท็บอันดับ (เปิดที่มุมมองแผนก)
  onOpenRank?: () => void;
}) {
  const company = getCompany(companyId);
  const dept = getDepartment(departmentId);
  const branch = getBranch(branchId);

  // กลุ่ม = แผนก ถ้ามี ไม่งั้นใช้สาขา (ตรงกับ /api/departments/members)
  // หน้าร้าน 1 สาขา = 1 กลุ่ม เหมือนแผนกของสำนักงานใหญ่
  const kind = dept ? "แผนก" : "สาขา";
  const title = dept ? dept.name : branch ? branchLabel(branch) : "";
  // หน้าร้าน: แสดงรหัสสาขา (ID) และจังหวัด ดึงจากข้อมูลสาขาอัตโนมัติ
  const branchMeta = branch
    ? [branchCode(branch) ? `ID ${branchCode(branch)}` : null, branchProvince(branch)]
        .filter(Boolean)
        .join(" · ")
    : "";
  const sub = dept
    ? [company?.name, branch ? branchLabel(branch) : null]
        .filter(Boolean)
        .join(" · ")
    : [branchMeta, company?.name].filter(Boolean).join(" · ");
  const hasGroup = !!(dept || branch);
  // ทั้งแผนกและสาขามียอดรวมรายสัปดาห์ (dept_jumps เก็บทั้ง departmentId และ branchId)
  const showTotal = hasGroup;

  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // closing = กำลังเล่นแอนิเมชันเลื่อนลง ก่อนถอด popup ออกจริง
  const [closing, setClosing] = useState(false);

  // โน๊ตสั้น (แบบ instagram note): เขียนเอง เพื่อนในกลุ่มเห็น หายใน 24 ชม.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftStyle, setDraftStyle] = useState<NoteStyle>("none");
  const [saving, setSaving] = useState(false);

  // เอฟเฟกต์ตอนแชร์: flight = โน๊ตกำลังลอยไปหาโปรไฟล์, pulse = วงแหวนที่รูปตอนถึง
  const [flight, setFlight] = useState<Flight | null>(null);
  const [pulse, setPulse] = useState(false);
  const previewRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!hasGroup) return;
    let alive = true;
    const load = () =>
      fetch("/api/departments/members", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: Partial<Data>) => {
          if (!alive) return;
          setData({
            members: d.members ?? [],
            allTotal: d.allTotal ?? 0,
            weekTotal: d.weekTotal ?? 0,
          });
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hasGroup, departmentId, branchId]);

  // เปิด popup แล้วโหลดอันดับแผนกล่วงหน้า กดปุ่มอันดับแล้วแท็บอันดับมีข้อมูลทันที
  useEffect(() => {
    if (open) prefetchDeptBoard();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setEditing(false);
    }, 260);
    return () => clearTimeout(t);
  }, [closing]);

  // ช่องกรอกเปิดแล้วโฟกัสช่องพิมพ์ (ไม่ให้หน้าเลื่อนตาม)
  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() =>
      taRef.current?.focus({ preventScroll: true })
    );
    return () => cancelAnimationFrame(id);
  }, [editing]);

  // วงแหวนที่รูปโปรไฟล์ตอนโน๊ตมาถึง
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 700);
    return () => clearTimeout(t);
  }, [pulse]);

  // โน๊ตลอยจากช่องตัวอย่างไปหารูปตัวเอง: ถือตำแหน่งเดิมรอช่องกรอกหุบเสร็จ
  // แล้ววัดตำแหน่งรูปใหม่ ค่อยบินเป็นเส้นโค้ง (transform + opacity อย่างเดียว)
  useEffect(() => {
    if (!flight) return;
    let done = false;
    const anims: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      setData(
        (d) =>
          d && {
            ...d,
            members: d.members.map((m) =>
              m.isMe || m.username === myUsername
                ? { ...m, note: flight.note }
                : m
            ),
          }
      );
      setPulse(true);
    };
    timers.push(
      setTimeout(() => {
        const target =
          listRef.current?.querySelector<HTMLElement>("[data-me-avatar]");
        const els = ghostRefs.current.filter(
          (el): el is HTMLDivElement => !!el
        );
        if (!target || els.length === 0) {
          finish();
          setFlight(null);
          return;
        }
        const a = target.getBoundingClientRect();
        const dx = a.left + a.width / 2 - (flight.left + flight.width / 2);
        const dy = a.top - 4 - (flight.top + flight.height / 2);
        els.forEach((el, i) => {
          const anim = el.animate(
            [
              { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
              {
                transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 50}px) scale(1.08)`,
                opacity: 1,
                offset: 0.4,
              },
              {
                transform: `translate(${dx}px, ${dy}px) scale(.35)`,
                opacity: 0,
                offset: 1,
              },
            ],
            {
              duration: FLIGHT_MS,
              delay: i * 70,
              easing: "cubic-bezier(.45,0,.25,1)",
              fill: "both",
            }
          );
          anims.push(anim);
          // ตัวหลัก (i = 0) ถึงก่อน เงาตามมาทีหลัง
          if (i === 0) {
            anim.onfinish = () => {
              finish();
              timers.push(setTimeout(() => setFlight(null), 250));
            };
          }
        });
      }, EDITOR_MS)
    );
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
      // ปิด popup กลางทาง: ยังต้องใส่โน๊ตลง state
      finish();
    };
  }, [flight, myUsername]);

  if (!hasGroup) return null;

  const members = data?.members ?? [];
  const shown = members.slice(0, STACK_MAX);
  const more = members.length - shown.length;
  const mine = members.find((m) => m.isMe || m.username === myUsername);
  const myNote = mine ? activeNote(mine) : null;
  const draftSt = styleOf(draftStyle);

  // อัปเดต note ของตัวเองใน state ทันที ไม่ต้องรอ poll รอบถัดไป
  const patchMe = (note: Note | null) =>
    setData(
      (d) =>
        d && {
          ...d,
          members: d.members.map((m) =>
            m.isMe || m.username === myUsername ? { ...m, note } : m
          ),
        }
    );

  const openEditor = (text: string, style?: string | null) => {
    setDraft(text);
    setDraftStyle(styleOf(style).id);
    setEditing(true);
  };

  async function saveNote() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/departments/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, style: draftStyle }),
      });
      if (!r.ok) throw new Error();
      const { note } = (await r.json()) as { note: Note };
      // วัดตำแหน่งช่องตัวอย่างก่อนช่องกรอกหุบ
      const el = previewRef.current;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (el && !reduce) {
        const b = el.getBoundingClientRect();
        setFlight({
          note,
          left: b.left,
          top: b.top,
          width: b.width,
          height: b.height,
        });
      } else {
        patchMe(note);
      }
      setEditing(false);
    } catch {
      alert("บันทึกโน๊ตไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote() {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/departments/note", { method: "DELETE" });
      if (!r.ok) throw new Error();
      patchMe(null);
      setEditing(false);
    } catch {
      alert("ลบโน๊ตไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  // ปุ่มไอคอนกลมในช่องกรอก (ยกเลิก / ลบ)
  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#3F5E1F] transition-transform active:scale-90 disabled:opacity-40";
  // ตัวเลือกกรอบ/อารมณ์: ไอคอนล้วน ไม่มีตัวหนังสือ
  const pickBtn = (on: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90 ${
      on
        ? "bg-white text-[#1B2A21] ring-2 ring-[#1B2A21]"
        : "bg-white/70 text-[#3F5E1F]"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pj-lift block w-full rounded-3xl bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] p-4 text-left font-[inherit] transition-transform active:scale-[0.99] lg:p-5"
        aria-haspopup="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-[#3F5E1F]">{kind}ของคุณ</div>
            <h2 className="truncate text-[17px] font-bold">{title}</h2>
            {sub && (
              <div className="truncate text-[12px] text-[#3F5E1F]">{sub}</div>
            )}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#3F5E1F]">
            <Icon d={ICONS.right} size={18} />
          </span>
        </div>

        {showTotal && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#1B2A21] px-4 py-3 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
              <Icon d={ICONS.bolt} size={20} />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] text-white/60">
                คะแนนรวม{kind}ตั้งแต่วันแรก
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[#C9F25B]">
                  {data ? fmtNum(data.allTotal) : "-"}
                </span>
                <span className="text-[13px] text-white/60">ครั้ง</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          {failed ? (
            <span className="text-[13px] text-[#3F5E1F]">
              โหลดรายชื่อไม่สำเร็จ
            </span>
          ) : !data ? (
            <span className="pj-pulse text-[13px] text-[#3F5E1F]">
              กำลังโหลด...
            </span>
          ) : members.length === 0 ? (
            <span className="text-[13px] text-[#3F5E1F]">ยังไม่มีสมาชิก</span>
          ) : (
            <div className="flex items-center">
              <div className="flex -space-x-3">
                {shown.map((m) => (
                  <Avatar
                    key={m.username}
                    name={m.name}
                    src={m.avatarUrl}
                    size={40}
                    ring
                  />
                ))}
                {more > 0 && (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[13px] font-semibold text-[#1B2A21] ring-2 ring-white">
                    +{more}
                  </span>
                )}
              </div>
            </div>
          )}
          <span className="shrink-0 text-[12px] font-medium text-[#3F5E1F]">
            {data ? `${members.length} คน · ` : ""}ดูทั้งหมด
          </span>
        </div>
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`สมาชิก${kind} ${title}`}
            className="dc-anim fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/70 p-0 font-[inherit] sm:items-center sm:p-5"
            style={{
              animation: closing
                ? "dc-back-out .26s ease-in both"
                : "dc-back-in .3s ease-out both",
            }}
            onClick={() => setClosing(true)}
          >
            <style>{`
              @keyframes dc-drop {
                0% { transform: translateY(-60px) scale(.8,1.15); opacity: 0; }
                55% { transform: translateY(0) scale(1.12,.88); opacity: 1; }
                75% { transform: translateY(-8px) scale(.97,1.04); }
                100% { transform: translateY(0) scale(1); opacity: 1; }
              }
              @keyframes dc-back-in { from { opacity: 0; } to { opacity: 1; } }
              @keyframes dc-back-out { from { opacity: 1; } to { opacity: 0; } }
              @keyframes dc-sheet-in {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
              @keyframes dc-sheet-out {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(100%); opacity: 0; }
              }
              @keyframes dc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
              @keyframes dc-ring {
                from { transform: scale(1); opacity: .8; }
                to { transform: scale(1.55); opacity: 0; }
              }

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

              /* ปุ่ม/ช่องกรอกใน popup ใช้ font เดียวกับทั้งแอป */
              .dc-font, .dc-font button, .dc-font textarea { font-family: inherit; }
              /* กัน iOS Safari ซูมหน้าจอตอนโฟกัสช่องพิมพ์: ต้องใช้ font-size >= 16px */
              .dc-font textarea { font-size: 16px; }
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

            <div
              className="dc-anim dc-font relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] text-[#1B2A21] shadow-2xl sm:max-w-2xl sm:rounded-[32px] lg:max-w-4xl"
              style={{
                animation: closing
                  ? "dc-sheet-out .26s ease-in both"
                  : "dc-sheet-in .38s cubic-bezier(.22,1,.36,1) both",
              }}
              onClick={(e) => e.stopPropagation()}
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

              <div className="relative flex items-start justify-between gap-3 px-5 pb-2 pt-5">
                <div className="min-w-0">
                  <div className="text-[12px] text-[#3F5E1F]">
                    เพื่อนร่วม{kind}
                  </div>
                  <h3 className="break-words text-[22px] font-bold leading-tight tracking-tight">
                    {title}
                  </h3>
                  {!dept && branchMeta && (
                    <div className="mt-0.5 truncate text-[12px] text-[#3F5E1F]">
                      {branchMeta}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setClosing(true)}
                  aria-label="ปิด"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform active:scale-90"
                >
                  <Icon d={ICONS.close} size={18} />
                </button>
              </div>

              {/* แถวชิป: จำนวนคน + คะแนนรวม / ปุ่ม "อันดับ" ชิดขวาสุดบรรทัดเดียวกัน */}
              <div className="relative flex flex-wrap items-center gap-2 px-5 pb-3">
                <span className="inline-flex rounded-full bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-[#3F5E1F]">
                  {members.length} คน
                </span>
                {showTotal && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A21] px-3.5 py-1.5 text-[13px] font-medium text-[#C9F25B]">
                    <Icon d={ICONS.bolt} size={14} />
                    <span className="font-semibold tabular-nums">
                      {fmtNum(data?.allTotal ?? 0)}
                    </span>{" "}
                    ครั้งตั้งแต่วันแรก
                  </span>
                )}
                {/* กดแล้วสลับไปแท็บ "อันดับ" ของ navbar (เปิดที่มุมมองแผนก)
                    หน้าหลักถูกถอด popup นี้หายไปเองตอนสลับแท็บ */}
                <button
                  type="button"
                  onClick={() => onOpenRank?.()}
                  aria-label="ดูอันดับ"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#3F5E1F] shadow-sm transition-transform active:scale-95"
                >
                  <Icon d={ICONS.trophy} size={14} />
                  อันดับ
                </button>
              </div>

              {/* ช่องเขียนโน๊ต (เฉพาะของตัวเอง)
                  อยู่ใน DOM ตลอด ขยาย/หุบด้วย grid-template-rows 0fr ↔ 1fr
                  ปิดอยู่ = visibility hidden กันโฟกัสด้วยคีย์บอร์ด */}
              {mine && (
                <div
                  className="relative grid"
                  aria-hidden={!editing}
                  style={{
                    gridTemplateRows: editing ? "1fr" : "0fr",
                    opacity: editing ? 1 : 0,
                    visibility: editing ? "visible" : "hidden",
                    transitionProperty: "grid-template-rows, opacity, visibility",
                    transitionDuration: `${EDITOR_MS}ms, 250ms, 0s`,
                    transitionDelay: editing ? "0s" : `0s, 0s, ${EDITOR_MS}ms`,
                    transitionTimingFunction: "cubic-bezier(.22,1,.36,1)",
                  }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className="px-5 pb-3"
                      style={{
                        transform: editing ? "none" : "translateY(-10px)",
                        transition: `transform ${EDITOR_MS}ms cubic-bezier(.22,1,.36,1)`,
                      }}
                    >
                      <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                        <textarea
                          ref={taRef}
                          value={draft}
                          maxLength={NOTE_MAX}
                          rows={2}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="เขียนโน๊ตสั้นๆ ให้เพื่อนร่วมทีมเห็น..."
                          className="w-full resize-none bg-transparent text-[16px] outline-none"
                        />

                        {/* ตัวอย่างกรอบ ตามที่เลือก */}
                        <div className="mt-2 flex justify-center pb-3 pt-7">
                          <div className="relative max-w-[80%]">
                            <NoteBox
                              text={draft.trim() || "ตัวอย่างโน๊ตของคุณ"}
                              frame={draftSt.frame}
                              boxRef={previewRef}
                            />
                            <span
                              aria-hidden
                              className="absolute left-1/2 top-[calc(100%-1px)] h-2 w-3.5 -translate-x-1/2 [clip-path:polygon(0_0,100%_0,50%_100%)]"
                              style={{ background: draftSt.tail }}
                            />
                            {draftSt.mood && (
                              <span
                                aria-hidden
                                className="absolute -right-4 -top-5"
                              >
                                <Face kind={draftSt.mood} size={30} />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* เลือกกรอบ + อารมณ์ (ไอคอนล้วน) */}
                        <div
                          role="radiogroup"
                          aria-label="เลือกกรอบหรืออารมณ์ของโน๊ต"
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          {FRAME_IDS.map((id) => (
                            <button
                              key={id}
                              type="button"
                              role="radio"
                              aria-checked={draftStyle === id}
                              aria-label={FRAMES[id].label}
                              title={FRAMES[id].label}
                              onClick={() => setDraftStyle(id)}
                              className={pickBtn(draftStyle === id)}
                            >
                              {id === "none" ? (
                                <BanIcon size={20} />
                              ) : (
                                <span
                                  aria-hidden
                                  className="block h-5 w-5 rounded-full"
                                  style={{ background: FRAMES[id].swatch }}
                                />
                              )}
                            </button>
                          ))}
                          <span
                            aria-hidden
                            className="mx-0.5 h-5 w-px bg-[#3F5E1F]/25"
                          />
                          {MOOD_IDS.map((id) => (
                            <button
                              key={id}
                              type="button"
                              role="radio"
                              aria-checked={draftStyle === id}
                              aria-label={MOODS[id].label}
                              title={MOODS[id].label}
                              onClick={() => setDraftStyle(id)}
                              className={pickBtn(draftStyle === id)}
                            >
                              <Face kind={id} size={26} animate={draftStyle === id} />
                            </button>
                          ))}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[12px] tabular-nums text-[#3F5E1F]">
                            {draft.length}/{NOTE_MAX} · หายไปใน 24 ชม.
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditing(false)}
                              disabled={saving}
                              aria-label="ยกเลิก"
                              title="ยกเลิก"
                              className={iconBtn}
                            >
                              <XIcon size={18} />
                            </button>
                            {myNote && (
                              <button
                                type="button"
                                onClick={deleteNote}
                                disabled={saving}
                                aria-label="ลบโน๊ต"
                                title="ลบโน๊ต"
                                className={iconBtn}
                              >
                                <TrashIcon size={18} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={saveNote}
                              disabled={saving || !draft.trim()}
                              className="h-9 rounded-full bg-[#1B2A21] px-4 text-[13px] font-semibold text-[#C9F25B] transition-transform active:scale-95 disabled:opacity-40"
                            >
                              {saving ? "กำลังบันทึก..." : "แชร์"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <ul
                ref={listRef}
                className="relative grid grid-cols-3 gap-x-2 gap-y-7 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 sm:grid-cols-4 lg:grid-cols-6"
              >
                {members.map((m, i) => {
                  const me = m.isMe || m.username === myUsername;
                  const note = activeNote(m);
                  const ns = styleOf(note?.style);
                  // ดีเลย์สูงสุด 12 คนแรก ที่เหลือโผล่พร้อมกัน ไม่ให้รอนาน
                  const delay = Math.min(i, 12) * 0.06;
                  return (
                    <li
                      key={m.username}
                      className="flex min-w-0 flex-col items-center justify-end text-center"
                    >
                      {/* bubble โน๊ต เหนือ avatar (ช่องว่างคงที่ ให้ avatar เรียงตรงกัน) */}
                      {note ? (
                        <div
                          className="dc-anim relative mb-3 max-w-full text-center drop-shadow-md"
                          style={{ animation: `dc-fade .4s ease-out ${delay}s both` }}
                        >
                          {/* กรอบ = พื้นหลังไล่สีเคลื่อนไหว ข้างในเป็นกล่องข้อความ (สีตามกรอบ) */}
                          <NoteBox text={note.text} frame={ns.frame} clamp />
                          {/* หางกรอบคำพูด ชี้ลงหา avatar สีตามกรอบ */}
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
                              <Face kind={ns.mood} size={28} />
                            </span>
                          )}
                          {/* ดินสอ = แก้ไข (เฉพาะโน๊ตตัวเอง) */}
                          {me && (
                            <button
                              type="button"
                              onClick={() => openEditor(note.text, note.style)}
                              aria-label="แก้ไขโน๊ต"
                              title="แก้ไขโน๊ต"
                              className="absolute -left-2 -top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#1B2A21] text-[#C9F25B] shadow transition-transform active:scale-90"
                            >
                              <PencilIcon size={12} />
                            </button>
                          )}
                        </div>
                      ) : me ? (
                        <button
                          type="button"
                          onClick={() => openEditor("")}
                          aria-label="เขียนโน๊ต"
                          title="เขียนโน๊ต"
                          className="mb-3 flex h-7 w-9 items-center justify-center rounded-2xl border border-dashed border-[#3F5E1F]/50 text-[#3F5E1F] transition-transform active:scale-95"
                        >
                          <PencilIcon size={14} />
                        </button>
                      ) : (
                        <span aria-hidden className="mb-3 block min-h-[28px]" />
                      )}
                      <span
                        className="dc-anim block"
                        style={{ animation: `dc-drop .7s ease-out ${delay}s both` }}
                      >
                        <span
                          data-me-avatar={me ? "" : undefined}
                          className={`relative block rounded-full shadow-lg ${
                            me
                              ? "ring-[3px] ring-[#1B2A21]"
                              : "ring-[3px] ring-white"
                          }`}
                        >
                          <Avatar name={m.name} src={m.avatarUrl} size={80} />
                          {me && pulse && (
                            <span
                              aria-hidden
                              className="dc-anim pointer-events-none absolute inset-0 rounded-full ring-[3px] ring-[#C9F25B]"
                              style={{ animation: "dc-ring .6s ease-out both" }}
                            />
                          )}
                          {me && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                              คุณ
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className="dc-anim mt-2.5 w-full truncate px-1 text-[14px] font-semibold"
                        style={{ animation: `dc-fade .4s ease-out ${delay + 0.35}s both` }}
                      >
                        {m.name}
                      </span>
                    </li>
                  );
                })}
                {members.length === 0 && (
                  <li className="col-span-full py-8 text-center text-[14px] font-medium text-[#3F5E1F]">
                    ยังไม่มีสมาชิก
                  </li>
                )}
              </ul>
            </div>

            {/* โน๊ตที่กำลังลอยไปหาโปรไฟล์ + เงาตามหลัง 2 ชั้น
                วางนอก sheet เพราะ sheet มี transform ที่ทำให้ fixed อิงพิกัด sheet แทน viewport */}
            {flight &&
              [2, 1, 0].map((i) => (
                <div
                  key={i}
                  ref={(el) => {
                    ghostRefs.current[i] = el;
                  }}
                  aria-hidden
                  className="pointer-events-none fixed z-[60]"
                  style={{
                    left: flight.left,
                    top: flight.top,
                    width: flight.width,
                    height: flight.height,
                    fontFamily: "inherit",
                    willChange: "transform, opacity",
                  }}
                >
                  <NoteBox
                    text={flight.note.text}
                    frame={styleOf(flight.note.style).frame}
                    opacity={[1, 0.45, 0.2][i]}
                  />
                </div>
              ))}
          </div>,
          document.body
        )}
    </>
  );
}