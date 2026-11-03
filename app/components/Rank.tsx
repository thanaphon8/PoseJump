"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ICONS,
  Icon,
  POINT_QUOTA,
  POINT_REWARD,
  Segmented,
} from "./auth-shared";
import DepartmentRank, { prefetchDeptBoard } from "./DepartmentRank";
import RankLoader from "./RankLoader";
import {
  BanIcon,
  EDITOR_MS,
  FLIGHT_MS,
  FRAME_IDS,
  FRAMES,
  Face,
  MOOD_IDS,
  MOODS,
  NOTE_MAX,
  NoteBox,
  NoteStyles,
  PencilIcon,
  TrashIcon,
  XIcon,
  styleOf,
  type Flight,
  type Note,
  type NoteStyle,
} from "./NoteShared";

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
  // บริษัท / แผนก ของคนนั้น (แสดงใต้ชื่อ ถ้าไม่มีจะไม่แสดง)
  company?: string | null;
  department?: string | null;
  total: number;
  rounds: number;
  me: boolean;
  // ลำดับที่ทำเป้าหมายรายวันสำเร็จ (1 = คนแรก) null = ยังไม่ถึงเป้า
  goalRank: number | null;
  // เป้าหมายรายวันของคนนั้น ใช้วาดหลอดความคืบหน้า
  goal: number;
  // โน๊ตบนแท่นยืน (มีเฉพาะอันดับ 1-3 ที่เขียนไว้และยังไม่หมดอายุ)
  note?: Note | null;
};

type Board = {
  entries: BoardEntry[];
  me: { rank: number; total: number; gap: number; points: number } | null;
  count: number;
  // เวลารีเซ็ตรอบถัดไป (epoch ms) = 06:00 น. เวลาไทย คำนวณจากเซิร์ฟเวอร์
  resetAt: number;
};

type RankProps = {
  // ใช้โหลดอันดับใหม่เมื่อเปลี่ยนบัญชี
  username: string | null;
  // ผู้ใช้เลือกแผนกไว้แล้วหรือยัง (ใช้ในแท็บอันดับแผนก)
  hasDepartment: boolean;
  // แตะปุ่มเริ่มกระโดด
  onStart: () => void;
  // เปิดหน้าสรุป "ผลวันนี้"
  onOpenResult: () => void;
  // วันนี้มีรอบที่โดดไว้ไหม ถ้าไม่มีปุ่มผลวันนี้จะกดไม่ได้
  hasToday: boolean;
  // ซิงก์ point ล่าสุดของตัวเองกลับไปที่ user ใน app/page.tsx
  onPoints: (points: number) => void;
  // บัญชีถูกแบน: ปิดปุ่มเริ่มกระโดด และไม่แสดงแบนเนอร์ชวนโดด
  banned?: boolean;
  // มุมมองเริ่มต้น (เปิดจากปุ่มอันดับในการ์ดแผนก = "dept") ไม่ส่ง = "person"
  initialView?: "person" | "dept";
};

/* ------------------------------------------------------------------ */
/* ส่วนประกอบ UI                                                         */
/* ------------------------------------------------------------------ */

const card = "rounded-3xl bg-white pj-lift";
// กรอบเนื้อหา: มือถือเต็มความกว้าง / แท็บเล็ตจำกัดและอยู่กลาง / คอมกว้างพอวาง 2 คอลัมน์
const wrap = "mx-auto w-full max-w-xl lg:mx-0 lg:max-w-5xl";
const limeBtn =
  "flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all duration-150 active:scale-[0.98] active:bg-[#B8E348]";

const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toUpperCase();

// server กรองหมดอายุให้แล้ว แต่กรองซ้ำฝั่ง client กันกรณีเปิดหน้าค้างไว้ข้ามรอบรีเซ็ต
const activeNote = (n?: Note | null): Note | null =>
  n && Date.parse(n.expiresAt) > Date.now() ? n : null;

// size = px ตายตัว / fill = เต็มกล่องแม่ (ให้ขนาดเปลี่ยนตามหน้าจอด้วย class)
function Avatar({
  name,
  src,
  size = 40,
  fill = false,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  fill?: boolean;
  className?: string;
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
        className={`shrink-0 rounded-full object-cover bg-[#1B2A21] ${className}`}
        style={fill ? undefined : { width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#1B2A21] font-semibold text-[#C9F25B] ${className}`}
      style={
        fill ? undefined : { width: size, height: size, fontSize: size * 0.42 }
      }
      aria-hidden
    >
      {initialOf(name)}
    </span>
  );
}

// บรรทัดบริษัท · แผนก ใต้ชื่อ (ไม่มีข้อมูลเลยจะไม่แสดง)
function OrgLine({
  company,
  department,
  center = false,
}: {
  company?: string | null;
  department?: string | null;
  center?: boolean;
}) {
  const text = [company, department].filter(Boolean).join(" · ");
  if (!text) return null;
  return (
    <div
      className={`w-full truncate text-[11px] leading-4 text-[#6B7A6E] ${
        center ? "text-center" : ""
      }`}
    >
      {text}
    </div>
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
// onEditNote: ส่งมาเมื่อผู้ใช้เขียนโน๊ตได้ (ไม่โดนแบน) ถ้าตัวเองอยู่บนแท่นจะมีปุ่มดินสอเหนือ avatar
// pulse: วงแหวนที่รูปตัวเองตอนโน๊ตลอยมาถึง
function Podium({
  entries,
  onEditNote,
  pulse = false,
}: {
  entries: BoardEntry[];
  onEditNote?: (note: Note | null) => void;
  pulse?: boolean;
}) {
  const slots: { place: 1 | 2 | 3; e?: BoardEntry }[] = [
    { place: 2, e: entries[1] },
    { place: 1, e: entries[0] },
    { place: 3, e: entries[2] },
  ];
  const look = {
    1: {
      h: 128,
      step: "bg-[#C9F25B] text-[#1B2A21]",
      // มือถือ 76px / sm ขึ้นไป 104px
      av: "h-[76px] w-[76px] text-[32px] sm:h-[104px] sm:w-[104px] sm:text-[44px]",
      delay: "0s",
      // อันดับ 1: ตัวใหญ่สุด และเลื่อนลงมาจากเลขอันดับ
      co: "mt-3 line-clamp-2 text-[14px] leading-[17px]",
    },
    2: {
      h: 96,
      step: "bg-[#1B2A21] text-[#C9F25B]",
      // มือถือ 64px / sm ขึ้นไป 84px
      av: "h-16 w-16 text-[27px] sm:h-[84px] sm:w-[84px] sm:text-[35px]",
      delay: ".12s",
      co: "line-clamp-2 text-[13px] leading-[15px]",
    },
    3: {
      h: 72,
      step: "bg-[#3F5E1F] text-white",
      av: "h-16 w-16 text-[27px] sm:h-[84px] sm:w-[84px] sm:text-[35px]",
      delay: ".24s",
      // แท่นเตี้ยสุด แสดงบรรทัดเดียวเพื่อไม่ล้นแท่น
      co: "line-clamp-1 text-[12px] leading-[14px]",
    },
  } as const;

  // เว้นที่ด้านบนการ์ดให้โน๊ต (และเปลวไฟของกรอบ) เมื่อมีโน๊ตหรือมีปุ่มเขียนโน๊ต
  const hasTop =
    entries.some((e) => !!activeNote(e.note)) ||
    (!!onEditNote && entries.some((e) => e.me));

  return (
    <section aria-label="3 อันดับแรก" className="relative">
      <div
        className={`overflow-hidden rounded-3xl bg-white px-3 sm:px-6 ${
          hasTop ? "pt-10 sm:pt-12" : "pt-5 sm:pt-6"
        }`}
      >
      <div className="flex items-end gap-2 sm:gap-4">
        {slots.map(({ place, e }) => {
          const L = look[place];
          const reached = !!e && (e.goalRank != null || e.total >= e.goal);
          const note = e ? activeNote(e.note) : null;
          const ns = styleOf(note?.style);
          const canEdit = !!e && e.me && !!onEditNote;
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
                  {/* bubble โน๊ต เหนือ avatar (อันดับ 1: อยู่ระหว่างถ้วยกับ avatar) */}
                  {note ? (
                    <div className="relative mb-3 max-w-full text-center drop-shadow-md">
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
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onEditNote?.(note)}
                          aria-label="แก้ไขโน๊ต"
                          title="แก้ไขโน๊ต"
                          className="absolute -left-2 -top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#1B2A21] text-[#C9F25B] shadow transition-transform active:scale-90"
                        >
                          <PencilIcon size={12} />
                        </button>
                      )}
                    </div>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => onEditNote?.(null)}
                      aria-label="เขียนโน๊ต"
                      title="เขียนโน๊ต"
                      className="mb-2 flex h-7 w-9 items-center justify-center rounded-2xl border border-dashed border-[#3F5E1F]/50 text-[#3F5E1F] transition-transform active:scale-95"
                    >
                      <PencilIcon size={14} />
                    </button>
                  ) : null}
                  <span
                    data-me-avatar={e.me ? "" : undefined}
                    className={`relative rounded-full ${
                      e.me ? "ring-2 ring-[#3F5E1F] ring-offset-2" : ""
                    }`}
                  >
                    <Avatar
                      name={e.name}
                      src={e.avatarUrl}
                      fill
                      className={L.av}
                    />
                    {e.me && pulse && (
                      <span
                        aria-hidden
                        className="dc-anim pointer-events-none absolute inset-0 rounded-full ring-[3px] ring-[#C9F25B]"
                        style={{ animation: "rk-ring .6s ease-out both" }}
                      />
                    )}
                  </span>
                  <div className="mt-2 w-full truncate text-center text-[14px] font-semibold">
                    {e.name}
                  </div>
                  <OrgLine department={e.department} center />
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
                    className={`flex items-center justify-center rounded-full bg-[#EEF2E4] font-semibold text-[#A9B79A] ${L.av}`}
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
                className={`pj-rise relative flex w-full flex-col items-center justify-start gap-1 overflow-hidden rounded-t-2xl px-1.5 pt-3 ${
                  e ? L.step : "bg-[#EEF2E4] text-[#A9B79A]"
                }`}
                style={{ height: L.h, animationDelay: L.delay }}
              >
                <span className="text-[32px] font-bold leading-none tabular-nums">
                  {place}
                </span>
                {e?.company && (
                  <span
                    className={`w-full break-words text-center font-bold ${L.co}`}
                  >
                    {e.company}
                  </span>
                )}
                {reached && (
                  <span
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/20"
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

// ช่องเขียนโน๊ตบนแท่น (popup): เปิดเฉพาะตอนผู้ใช้อยู่อันดับ 1-3
// onSaved ส่งตำแหน่งช่องตัวอย่าง (rect) กลับไปให้หน้าแม่เล่นแอนิเมชันโน๊ตลอยไปหา avatar
// rect = null เมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหว หน้าแม่จะใส่โน๊ตลง state ทันที
function NoteEditorModal({
  initialText,
  initialStyle,
  hasNote,
  onClose,
  onSaved,
  onDeleted,
}: {
  initialText: string;
  initialStyle: NoteStyle;
  hasNote: boolean;
  onClose: () => void;
  onSaved: (note: Note, rect: DOMRect | null) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState(initialText);
  const [draftStyle, setDraftStyle] = useState<NoteStyle>(initialStyle);
  const [saving, setSaving] = useState(false);
  // closing = กำลังเล่นแอนิเมชันเลื่อนลง ก่อนถอด popup ออกจริง
  const [closing, setClosing] = useState(false);
  const previewRef = useRef<HTMLSpanElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const draftSt = styleOf(draftStyle);

  // เปิดแล้วโฟกัสช่องพิมพ์ (ไม่ให้หน้าเลื่อนตาม)
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      taRef.current?.focus({ preventScroll: true })
    );
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 260);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  async function saveNote() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/leaderboard/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, style: draftStyle }),
      });
      if (r.status === 403) {
        alert("เขียนโน๊ตได้เฉพาะอันดับ 1-3 ของวันนี้");
        setSaving(false);
        return;
      }
      if (!r.ok) throw new Error();
      const { note } = (await r.json()) as { note: Note };
      // วัดตำแหน่งช่องตัวอย่างก่อน popup หุบ
      const el = previewRef.current;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      onSaved(note, el && !reduce ? el.getBoundingClientRect() : null);
      setClosing(true);
    } catch {
      alert("บันทึกโน๊ตไม่สำเร็จ ลองอีกครั้ง");
      setSaving(false);
    }
  }

  async function deleteNote() {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/leaderboard/note", { method: "DELETE" });
      if (!r.ok) throw new Error();
      onDeleted();
      setClosing(true);
    } catch {
      alert("ลบโน๊ตไม่สำเร็จ ลองอีกครั้ง");
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เขียนโน๊ตบนแท่น"
      className="dc-anim fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/70 p-0 font-[inherit] sm:items-center sm:p-5"
      style={{
        animation: closing
          ? "rk-back-out .26s ease-in both"
          : "rk-back-in .3s ease-out both",
      }}
      onClick={() => {
        if (!saving) setClosing(true);
      }}
    >
      <NoteStyles />
      <style>{`
        @keyframes rk-back-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rk-back-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes rk-sheet-in {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes rk-sheet-out {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(100%); opacity: 0; }
        }
        /* ปุ่ม/ช่องกรอกใน popup ใช้ font เดียวกับทั้งแอป */
        .rk-font, .rk-font button, .rk-font textarea { font-family: inherit; }
        /* กัน iOS Safari ซูมหน้าจอตอนโฟกัสช่องพิมพ์: ต้องใช้ font-size >= 16px */
        .rk-font textarea { font-size: 16px; }
      `}</style>

      <div
        className="dc-anim rk-font relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-[32px] bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-[#1B2A21] shadow-2xl sm:rounded-[32px]"
        style={{
          animation: closing
            ? "rk-sheet-out .26s ease-in both"
            : "rk-sheet-in .38s cubic-bezier(.22,1,.36,1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-[#3F5E1F]">อันดับ 1-3 ของวันนี้</div>
            <h3 className="text-[22px] font-bold leading-tight tracking-tight">
              โน๊ตบนแท่น
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setClosing(true)}
            disabled={saving}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform active:scale-90 disabled:opacity-40"
          >
            <Icon d={ICONS.close} size={18} />
          </button>
        </div>

        <div className="mt-3 rounded-2xl bg-white/80 p-3 shadow-sm">
          <textarea
            ref={taRef}
            value={draft}
            maxLength={NOTE_MAX}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="เขียนโน๊ตสั้นๆ ให้ทุกคนที่เปิดหน้าอันดับเห็น..."
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
                <span aria-hidden className="absolute -right-4 -top-5">
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
            <span aria-hidden className="mx-0.5 h-5 w-px bg-[#3F5E1F]/25" />
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
              {draft.length}/{NOTE_MAX} · หายตอน 06:00 น.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setClosing(true)}
                disabled={saving}
                aria-label="ยกเลิก"
                title="ยกเลิก"
                className={iconBtn}
              >
                <XIcon size={18} />
              </button>
              {hasNote && (
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
    </div>,
    document.body
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
              : "ทำเป้าหมายรายวันให้สำเร็จก่อนคนอื่น เซ็ตทุก 06:00 น. เวลาไทย"}
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
  // สลับมุมมอง: อันดับบุคคล (รายวัน) / อันดับแผนก (รายสัปดาห์)
  // เริ่มที่มุมมองตาม initialView (เช่น เปิดจากปุ่มอันดับในการ์ดแผนก)
  const [view, setView] = useState<"person" | "dept">(
    props.initialView ?? "person"
  );

  // โน๊ตบนแท่น: editor = ข้อมูลเริ่มต้นของ popup (null = ปิดอยู่)
  const [editor, setEditor] = useState<{
    text: string;
    style: NoteStyle;
    hasNote: boolean;
  } | null>(null);
  // เอฟเฟกต์ตอนแชร์: flight = โน๊ตกำลังลอยไปหาโปรไฟล์, pulse = วงแหวนที่รูปตอนถึง
  const [flight, setFlight] = useState<Flight | null>(null);
  const [pulse, setPulse] = useState(false);
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  // ถึงเวลารีเซ็ต (06:00 น. เวลาไทย) โหลดอันดับใหม่ทันที ให้ตารางเป็นของวันเกมใหม่เลย
  // ไม่ต้องรอรอบรีเฟรช 30 วินาที (+1 วินาทีกันเซิร์ฟเวอร์ยังนับเป็นวันเดิม)
  const resetAt = board?.resetAt;
  useEffect(() => {
    if (!resetAt) return;
    const ms = Math.min(Math.max(resetAt - Date.now(), 0) + 1000, 2 ** 31 - 1);
    const t = setTimeout(loadBoard, ms);
    return () => clearTimeout(t);
  }, [resetAt, loadBoard]);

  // โหลดอันดับแผนกรอไว้ล่วงหน้า กดสลับไปแท็บ "แผนก" แล้วเห็นข้อมูลทันที ไม่ต้องรอ
  useEffect(() => {
    prefetchDeptBoard();
  }, []);

  // วงแหวนที่รูปโปรไฟล์ตอนโน๊ตมาถึง
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 700);
    return () => clearTimeout(t);
  }, [pulse]);

  // โน๊ตลอยจากช่องตัวอย่างไปหารูปตัวเองบนแท่น: ถือตำแหน่งเดิมรอ popup หุบเสร็จ
  // แล้ววัดตำแหน่งรูปใหม่ ค่อยบินเป็นเส้นโค้ง (transform + opacity อย่างเดียว)
  useEffect(() => {
    if (!flight) return;
    let done = false;
    const anims: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      setBoard(
        (b) =>
          b && {
            ...b,
            entries: b.entries.map((e) =>
              e.me ? { ...e, note: flight.note } : e
            ),
          }
      );
      setPulse(true);
    };
    timers.push(
      setTimeout(() => {
        const target =
          document.querySelector<HTMLElement>("[data-me-avatar]");
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
      // ออกจากหน้ากลางทาง: ยังต้องใส่โน๊ตลง state
      finish();
    };
  }, [flight]);

  // อัปเดต note ของตัวเองใน state ทันที ไม่ต้องรอรอบรีเฟรชถัดไป
  const patchMe = (note: Note | null) =>
    setBoard(
      (b) =>
        b && {
          ...b,
          entries: b.entries.map((e) => (e.me ? { ...e, note } : e)),
        }
    );

  const openEditor = (note: Note | null) =>
    setEditor({
      text: note?.text ?? "",
      style: styleOf(note?.style).id,
      hasNote: !!note,
    });
  const closeEditor = useCallback(() => setEditor(null), []);

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
    // ทัน POINT_QUOTA คนแรกที่ทำเป้าหมายรายวันสำเร็จ = ได้ไอคอนติ๊กเขียว
    const inQuota = e.goalRank != null && e.goalRank <= POINT_QUOTA;
    return (
      <li
        key={e.rank}
        className={`flex items-center gap-3 rounded-full px-5 py-2.5 sm:px-6 ${
          e.me ? "bg-[#E8F5C1]" : "bg-white"
        }`}
      >
        {/* อันดับ 4 ขึ้นไป: เลขเฉยๆ ไม่มีวงกลม */}
        <span
          className={`w-6 shrink-0 text-center text-[14px] font-semibold tabular-nums ${rankBadge(
            e.rank
          )}`}
        >
          {e.rank}
        </span>
        {/* มือถือ 48px / sm ขึ้นไป 56px */}
        <Avatar
          name={e.name}
          src={e.avatarUrl}
          fill
          className="h-12 w-12 text-[20px] sm:h-14 sm:w-14 sm:text-[23px]"
        />
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
            {/* ทัน POINT_QUOTA คนแรก: ไอคอนติ๊กเขียวเล็กๆ (มีคำอธิบายใต้แท่นยืน) */}
            {inQuota && (
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#3F5E1F] text-[#C9F25B]"
                aria-label={`ทัน ${POINT_QUOTA} คนแรก`}
                title={`ถึงเป้าลำดับที่ ${e.goalRank}`}
              >
                <Icon d={ICONS.check} size={10} />
              </span>
            )}
          </div>
          <OrgLine company={e.company} department={e.department} />
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

  // ตัวสลับ บุคคล / แผนก (ตัวเล็ก อยู่ขวามือบรรทัดเดียวกับหัวข้อ "ตารางอันดับ")
  const tabs = (
    <div className="w-32 shrink-0 sm:w-36">
      <Segmented<"person" | "dept">
        small
        value={view}
        onChange={setView}
        options={
          [
            ["person", "บุคคล"],
            ["dept", "แผนก"],
          ] as const
        }
      />
    </div>
  );

  // หัวข้อ "ตารางอันดับ" ซ้าย + ตัวสลับ บุคคล/แผนก ขวา (บรรทัดเดียวกันทั้งมือถือและคอม)
  const tableHead = (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="min-w-0 truncate px-1 text-[16px] font-semibold">
        ตารางอันดับ
      </h2>
      {tabs}
    </div>
  );

  // มุมมองอันดับแผนก
  if (view === "dept") {
    return (
      <div className={wrap}>
        {/* โครงหัวหน้าเดียวกับอันดับบุคคล (บรรทัดเล็ก + ชื่อหน้า) ชื่อหน้าจะไม่กระโดดตอนสลับ */}
        <header className="mb-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="min-h-[18px] text-[13px] text-[#6B7A6E]">
              คะแนนสะสมไม่รีเซ็ต
            </p>
            <h1 className="text-[30px] font-bold leading-tight tracking-tight lg:text-[36px]">
              อันดับแผนก
            </h1>
          </div>
          {/* เท่าปุ่ม "ผลวันนี้" ด้านบุคคล กันความสูงหัวหน้าต่างกัน */}
          <span aria-hidden className="mb-1 h-10 shrink-0" />
        </header>
        {tableHead}
        <DepartmentRank
          hasDepartment={props.hasDepartment}
          onStart={props.onStart}
          banned={props.banned}
        />
      </div>
    );
  }

  return (
    <div className={wrap}>
      {/* CSS ของกรอบ/อารมณ์/เอฟเฟกต์โน๊ต อยู่ใน NoteShared.tsx */}
      <NoteStyles />
      <style>{`
        @keyframes rk-ring {
          from { transform: scale(1); opacity: .8; }
          to { transform: scale(1.55); opacity: 0; }
        }
      `}</style>

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
          className="mb-1 flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#C9F25B] px-5 text-[15px] font-semibold text-[#1B2A21] transition-all duration-150 enabled:hover:bg-[#D6F77F] active:scale-95 active:bg-[#B8E348] disabled:opacity-40"
        >
          <Icon d={ICONS.trophy} size={18} />
          ผลวันนี้
        </button>
      </header>

      {/* ยังไม่มีข้อมูล: แสดงหัวข้อ+ตัวสลับตรงนี้ (พอโหลดเสร็จจะอยู่ในคอลัมน์ตาราง) */}
      {!board && tableHead}

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

      {/* RankLoader = ตัวการ์ตูน Jumper ระหว่างรอข้อมูล พอข้อมูลมาจะเฟดจางทับเนื้อหาที่เฟดเข้า (pj-in) */}
      <div className="relative">
        {board && (
          <div className="pj-in space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] lg:items-start lg:gap-6 lg:space-y-0">
            <section>
              {tableHead}
              {board.entries.length === 0 ? (
                <p className={`${card} px-4 py-6 text-center text-[14px] text-[#6B7A6E]`}>
                  ยังไม่มีอันดับ
                </p>
              ) : (
                <>
                  <Podium
                    entries={board.entries.slice(0, 3)}
                    onEditNote={props.banned ? undefined : openEditor}
                    pulse={pulse}
                  />
                  {board.entries.length > 3 && (
                    <>
                      {/* คำอธิบายไอคอนติ๊กเขียวในแถวด้านล่าง */}
                      <p className="mt-3 flex items-center gap-1.5 px-1 text-[12px] text-[#6B7A6E]">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#3F5E1F] text-[#C9F25B]">
                          <Icon d={ICONS.check} size={10} />
                        </span>
                        ติ๊กถูกสีเขียว = ทัน {POINT_QUOTA} คนแรกที่ทำเป้าหมายรายวันสำเร็จ
                      </p>
                      <ul className="mt-2 space-y-2">
                        {board.entries.slice(3).map(boardRow)}
                      </ul>
                    </>
                  )}
                </>
              )}
              <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
                {POINT_QUOTA} คนแรกที่ทำเป้าหมายรายวันสำเร็จ ได้ {POINT_REWARD} point อันดับ {POINT_QUOTA + 1} ขึ้นไปไม่ได้รับ นับจากรอบที่ผู้ใช้ล็อกอินบันทึกไว้ รีเซ็ตทุก 06:00 น. เวลาไทย อันดับ 1-3 เขียนโน๊ตบนแท่นได้ โน๊ตหายตอนรีเซ็ต
              </p>
            </section>
            <div className="pj-stagger space-y-4">
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
                      {(leader.company || leader.department) && (
                        <div className="truncate text-[12px] text-white/60">
                          {[leader.company, leader.department]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
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
                      {props.banned
                        ? "บัญชีถูกแบน วันนี้ไม่ได้ลงอันดับ"
                        : "วันนี้คุณยังไม่ได้กระโดด โดดเลยเพื่อติดอันดับ"}
                    </p>
                    {!props.banned && (
                      <button onClick={props.onStart} className={`${limeBtn} mt-4`}>
                        <Icon d={ICONS.play} size={20} fill />
                        เริ่มกระโดด
                      </button>
                    )}
                  </>
                )}
              </section>

              {props.banned ? null : (() => {
                const mine = board.entries.find((e) => e.me);
                const reached =
                  !!mine && (mine.goalRank != null || mine.total >= mine.goal);
                return (
                  <PromoBanner
                    status={reached ? "done" : "open"}
                    total={mine?.total ?? 0}
                  />
                );
              })()}
            </div>
          </div>
        )}
        <RankLoader loading={!board && !boardErr} />
      </div>

      {/* popup เขียนโน๊ตบนแท่น */}
      {editor && (
        <NoteEditorModal
          initialText={editor.text}
          initialStyle={editor.style}
          hasNote={editor.hasNote}
          onClose={closeEditor}
          onSaved={(note, rect) => {
            if (rect) {
              setFlight({
                note,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              });
            } else {
              patchMe(note);
            }
          }}
          onDeleted={() => patchMe(null)}
        />
      )}

      {/* โน๊ตที่กำลังลอยไปหาโปรไฟล์ + เงาตามหลัง 2 ชั้น
          วางใน portal แยกจาก popup เพราะ popup ถูกถอดออกระหว่างบิน */}
      {flight &&
        createPortal(
          <>
            {[2, 1, 0].map((i) => (
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
          </>,
          document.body
        )}
    </div>
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