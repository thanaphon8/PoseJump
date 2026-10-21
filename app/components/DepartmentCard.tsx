"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getDepartment } from "./departments";
import { ICONS, Icon } from "./auth-shared";

type Member = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  isMe?: boolean;
};

type Data = {
  members: Member[];
  // คะแนนแผนกสัปดาห์นี้ = ครั้งกระโดดรวมของทุกคนในแผนก
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
  departmentId,
  myUsername,
}: {
  departmentId?: number | null;
  myUsername?: string;
}) {
  const dept = getDepartment(departmentId);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!dept) return;
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
  }, [dept]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!dept) return null;

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
            <div className="text-[12px] text-[#6B7A6E]">แผนกของคุณ</div>
            <h2 className="truncate text-[17px] font-bold">{dept.th}</h2>
            {dept.en !== dept.th && (
              <div className="truncate text-[12px] text-[#6B7A6E]">
                {dept.en}
              </div>
            )}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F5C1] text-[#3F5E1F]">
            <Icon d={ICONS.right} size={18} />
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#1B2A21] px-4 py-3 text-white">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
            <Icon d={ICONS.bolt} size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] text-white/60">
              คะแนนรวมแผนกสัปดาห์นี้
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[#C9F25B]">
                {data ? fmtNum(data.weekTotal) : "-"}
              </span>
              <span className="text-[13px] text-white/60">ครั้ง</span>
            </div>
          </div>
        </div>

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
            aria-label={`สมาชิกแผนก ${dept.th}`}
            className="pj-in fixed inset-0 z-50 flex items-end justify-center bg-[#1B2A21]/70 p-0 sm:items-center sm:p-5"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[32px] bg-[#F3F6EC] text-[#1B2A21] shadow-2xl sm:rounded-[32px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
                <div className="min-w-0">
                  <div className="text-[12px] text-[#6B7A6E]">สมาชิกแผนก</div>
                  <h3 className="truncate text-[20px] font-bold leading-tight">
                    {dept.th}
                  </h3>
                  <div className="mt-1 text-[13px] text-[#3F5E1F]">
                    {members.length} คน · รวม{" "}
                    <span className="font-semibold tabular-nums">
                      {fmtNum(data?.weekTotal ?? 0)}
                    </span>{" "}
                    ครั้งสัปดาห์นี้
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white transition-transform active:scale-90"
                >
                  <Icon d={ICONS.close} size={18} />
                </button>
              </div>

              <ul className="space-y-2 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {members.map((m) => {
                  const me = m.isMe || m.username === myUsername;
                  return (
                    <li
                      key={m.username}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                        me ? "bg-[#E8F5C1]" : "bg-white"
                      }`}
                    >
                      <Avatar name={m.name} src={m.avatarUrl} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold">
                            {m.name}
                          </span>
                          {me && (
                            <span className="shrink-0 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                              คุณ
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[12px] text-[#6B7A6E]">
                          @{m.username}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {members.length === 0 && (
                  <li className="py-6 text-center text-[14px] text-[#6B7A6E]">
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