"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCompany, getDepartment } from "./departments";
import { branchCode, branchLabel, branchProvince, getBranch } from "./branches";
import { ICONS, Icon } from "./auth-shared";

type Member = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  isMe?: boolean;
};

type Data = {
  members: Member[];
  // คะแนนกลุ่มสัปดาห์นี้ = ครั้งกระโดดรวมของทุกคนในกลุ่ม (แผนก หรือ สาขา)
  weekTotal: number;
};

const fmtNum = (n: number) => n.toLocaleString("en-US");
const STACK_MAX = 6;

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
}: {
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
  myUsername?: string;
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!hasGroup) return null;

  const members = data?.members ?? [];
  const shown = members.slice(0, STACK_MAX);
  const more = members.length - shown.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pj-lift block w-full rounded-3xl bg-white p-4 text-left transition-transform active:scale-[0.99] lg:p-5"
        aria-haspopup="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-[#6B7A6E]">{kind}ของคุณ</div>
            <h2 className="truncate text-[17px] font-bold">{title}</h2>
            {sub && (
              <div className="truncate text-[12px] text-[#6B7A6E]">{sub}</div>
            )}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
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
                คะแนนรวม{kind}สัปดาห์นี้
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[#C9F25B]">
                  {data ? fmtNum(data.weekTotal) : "-"}
                </span>
                <span className="text-[13px] text-white/60">ครั้ง</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          {failed ? (
            <span className="text-[13px] text-[#6B7A6E]">
              โหลดรายชื่อไม่สำเร็จ
            </span>
          ) : !data ? (
            <span className="pj-pulse text-[13px] text-[#6B7A6E]">
              กำลังโหลด...
            </span>
          ) : members.length === 0 ? (
            <span className="text-[13px] text-[#6B7A6E]">ยังไม่มีสมาชิก</span>
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
            className="pj-in fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/70 p-0 sm:items-center sm:p-5"
            onClick={() => setOpen(false)}
          >
            <style>{`
              @keyframes dc-drop {
                0% { transform: translateY(-60px) scale(.8,1.15); opacity: 0; }
                55% { transform: translateY(0) scale(1.12,.88); opacity: 1; }
                75% { transform: translateY(-8px) scale(.97,1.04); }
                100% { transform: translateY(0) scale(1); opacity: 1; }
              }
              @keyframes dc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
              @media (prefers-reduced-motion: reduce) {
                .dc-anim { animation: none !important; opacity: 1 !important; }
              }
            `}</style>

            <div
              className="relative flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-gradient-to-b from-[#EFF8CF] via-[#E1F2B4] to-[#CFEA85] text-[#1B2A21] shadow-2xl sm:rounded-[32px]"
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
                  <div className="text-[13px] font-semibold text-[#3F5E1F]">
                    เพื่อนร่วม{kind}
                  </div>
                  <h3 className="break-words text-[26px] font-bold leading-tight tracking-tight">
                    {title}
                  </h3>
                  {!dept && branchMeta && (
                    <div className="mt-0.5 truncate text-[13px] font-semibold text-[#3F5E1F]">
                      {branchMeta}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm transition-transform active:scale-90"
                >
                  <Icon d={ICONS.close} size={18} />
                </button>
              </div>

              <div className="relative flex flex-wrap gap-2 px-5 pb-3">
                <span className="inline-flex rounded-full bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-[#3F5E1F]">
                  {members.length} คน
                </span>
                {showTotal && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A21] px-3.5 py-1.5 text-[13px] font-semibold text-[#C9F25B]">
                    <Icon d={ICONS.bolt} size={14} />
                    <span className="tabular-nums">{fmtNum(data?.weekTotal ?? 0)}</span>{" "}
                    ครั้งสัปดาห์นี้
                  </span>
                )}
              </div>

              <ul className="relative grid grid-cols-3 gap-x-2 gap-y-5 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-4">
                {members.map((m, i) => {
                  const me = m.isMe || m.username === myUsername;
                  // ดีเลย์สูงสุด 12 คนแรก ที่เหลือโผล่พร้อมกัน ไม่ให้รอนาน
                  const delay = Math.min(i, 12) * 0.06;
                  return (
                    <li
                      key={m.username}
                      className="flex min-w-0 flex-col items-center text-center"
                    >
                      <span
                        className="dc-anim block"
                        style={{ animation: `dc-drop .7s ease-out ${delay}s both` }}
                      >
                        <span
                          className={`relative block rounded-full shadow-lg ${
                            me
                              ? "ring-[3px] ring-[#1B2A21]"
                              : "ring-[3px] ring-white"
                          }`}
                        >
                          <Avatar name={m.name} src={m.avatarUrl} size={64} />
                          {me && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1B2A21] px-2 py-0.5 text-[10px] font-bold text-[#C9F25B]">
                              คุณ
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className="dc-anim mt-2.5 w-full truncate px-1 text-[13px] font-semibold"
                        style={{ animation: `dc-fade .4s ease-out ${delay + 0.35}s both` }}
                      >
                        {m.name}
                      </span>
                      <span
                        className="dc-anim w-full truncate px-1 text-[11px] text-[#3F5E1F]/80"
                        style={{ animation: `dc-fade .4s ease-out ${delay + 0.4}s both` }}
                      >
                        @{m.username}
                      </span>
                    </li>
                  );
                })}
                {members.length === 0 && (
                  <li className="col-span-full py-8 text-center text-[14px] font-semibold text-[#3F5E1F]">
                    ยังไม่มีสมาชิก
                  </li>
                )}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}