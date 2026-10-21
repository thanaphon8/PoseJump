"use client";

import { useEffect, useState } from "react";
import { getDepartment } from "./departments";
import { ICONS, Icon } from "./auth-shared";

type Member = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  points?: number;
  isMe?: boolean;
};

function MiniAvatar({ name, src }: { name: string; src?: string | null }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setErr(true)}
        className="h-10 w-10 shrink-0 rounded-full bg-[#1B2A21] object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1B2A21] text-[16px] font-semibold text-[#C9F25B]">
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
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!dept) return;
    let alive = true;
    fetch("/api/departments/members")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { members?: Member[] }) => {
        if (alive) setMembers(d.members ?? []);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [dept]);

  if (!dept) return null;

  return (
    <section className="rounded-3xl bg-white p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-[#6B7A6E]">แผนกของคุณ</div>
          <h2 className="truncate text-[17px] font-bold">{dept.th}</h2>
          {dept.en !== dept.th && (
            <div className="truncate text-[12px] text-[#6B7A6E]">{dept.en}</div>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#E8F5C1] px-3 py-1 text-[12px] font-semibold text-[#3F5E1F]">
          <Icon d={ICONS.user} size={14} />
          {members ? members.length : "-"} คน
        </span>
      </div>

      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {failed && (
          <p className="py-4 text-center text-[13px] text-[#6B7A6E]">
            โหลดรายชื่อไม่สำเร็จ
          </p>
        )}
        {!failed && !members && (
          <p className="pj-pulse py-4 text-center text-[13px] text-[#6B7A6E]">
            กำลังโหลด...
          </p>
        )}
        {members?.map((m) => {
          const me = m.isMe || m.username === myUsername;
          return (
            <div
              key={m.username}
              className={`flex items-center gap-3 rounded-2xl px-2 py-2 ${
                me ? "bg-[#F3F6EC]" : ""
              }`}
            >
              <MiniAvatar name={m.name} src={m.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">
                  {m.name}
                  {me && <span className="ml-1 text-[#3F5E1F]">(คุณ)</span>}
                </div>
                <div className="truncate text-[12px] text-[#6B7A6E]">
                  @{m.username}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums text-[#3F5E1F]">
                <Icon d={ICONS.star} size={12} fill />
                {(m.points ?? 0).toLocaleString("en-US")}
              </span>
            </div>
          );
        })}
        {members && members.length === 0 && (
          <p className="py-4 text-center text-[13px] text-[#6B7A6E]">
            ยังไม่มีสมาชิก
          </p>
        )}
      </div>
    </section>
  );
}