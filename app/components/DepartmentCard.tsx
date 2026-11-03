"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCompany, getDepartment } from "./departments";
import { branchCode, branchLabel, branchProvince, getBranch } from "./branches";
import { ICONS, Icon } from "./auth-shared";
import { prefetchDeptBoard } from "./DepartmentRank";
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

const fmtNum = (n: number) => n.toLocaleString("en-US");
const STACK_MAX = 6;

// server กรองหมดอายุให้แล้ว แต่กรองซ้ำฝั่ง client กันกรณีเปิดหน้าค้างไว้ข้าม 24 ชม.
const activeNote = (m: Member): Note | null =>
  m.note && Date.parse(m.note.expiresAt) > Date.now() ? m.note : null;

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
            {/* CSS ของกรอบ/อารมณ์/เอฟเฟกต์โน๊ต อยู่ใน NoteShared.tsx */}
            <NoteStyles />
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

              /* ปุ่ม/ช่องกรอกใน popup ใช้ font เดียวกับทั้งแอป */
              .dc-font, .dc-font button, .dc-font textarea { font-family: inherit; }
              /* กัน iOS Safari ซูมหน้าจอตอนโฟกัสช่องพิมพ์: ต้องใช้ font-size >= 16px */
              .dc-font textarea { font-size: 16px; }
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