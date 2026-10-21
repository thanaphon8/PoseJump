"use client";

import { useCallback, useEffect, useState } from "react";
import { ICONS, Icon } from "./auth-shared";

const fmtNum = (n: number) => n.toLocaleString("en-US");

type DeptEntry = {
  rank: number;
  id: number;
  name: string;
  en: string;
  total: number;
  active: number;
  me: boolean;
};

type DeptBoard = {
  entries: DeptEntry[];
  me: { rank: number; total: number; gap: number } | null;
  count: number;
  resetAt: number;
};

const badge = (rank: number) =>
  rank === 1
    ? "bg-[#C9F25B] text-[#1B2A21]"
    : rank === 2
      ? "bg-[#1B2A21] text-[#C9F25B]"
      : rank === 3
        ? "bg-[#3F5E1F] text-white"
        : "bg-[#EEF2E4] text-[#6B7A6E]";

export default function DepartmentRank({
  hasDepartment,
}: {
  hasDepartment: boolean;
}) {
  const [board, setBoard] = useState<DeptBoard | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/leaderboard/departments", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("load failed");
      setBoard((await r.json()) as DeptBoard);
      setErr(false);
    } catch {
      setErr(true);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const leftMs = Math.max(0, (board?.resetAt ?? 0) - now);
  const d = Math.floor(leftMs / 86400000);
  const h = Math.floor((leftMs % 86400000) / 3600000);
  const m = Math.floor((leftMs % 3600000) / 60000);
  const resetText = `${d} วัน ${h} ชม. ${m} นาที`;

  if (!board && !err) {
    return (
      <p className="rounded-3xl bg-white px-4 py-6 text-center text-[14px] text-[#6B7A6E]">
        กำลังโหลดอันดับแผนก
      </p>
    );
  }
  if (!board) {
    return (
      <div className="rounded-3xl bg-white px-4 py-6 text-center">
        <p className="text-[14px] text-[#D92D20]">โหลดอันดับแผนกไม่สำเร็จ</p>
        <button
          onClick={load}
          className="mt-3 h-10 rounded-full bg-[#C9F25B] px-6 text-[14px] font-semibold text-[#1B2A21] transition-transform active:scale-95"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const top = board.entries[0];
  const max = Math.max(1, top?.total ?? 1);

  return (
    <div className="space-y-4">
      <p className="px-1 text-[13px] text-[#6B7A6E]">
        รีเซ็ตคะแนนแผนกใน {resetText} (ทุกวันจันทร์ 00:00 น.)
      </p>

      <div className="pj-stagger space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <section className="rounded-3xl bg-[#1B2A21] p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[15px] font-semibold">แผนกอันดับ 1 สัปดาห์นี้</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-[#C9F25B]">
              {board.count} แผนกลงสนาม
            </span>
          </div>
          {top ? (
            <div className="mt-4 flex items-center gap-4">
              <span className="pj-float flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                <Icon d={ICONS.trophy} size={32} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[20px] font-semibold">{top.name}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[40px] font-semibold leading-none tabular-nums tracking-tight text-[#C9F25B]">
                    {fmtNum(top.total)}
                  </span>
                  <span className="text-[14px] text-white/60">ครั้งรวม</span>
                </div>
                <p className="mt-1.5 text-[13px] text-white/70">
                  {top.active} คนช่วยกันโดด
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[16px] text-white/80">
              ยังไม่มีแผนกไหนทำคะแนน ชวนเพื่อนในแผนกมาโดดเลย
            </p>
          )}
        </section>

        <section className="rounded-3xl bg-[#E8F5C1] p-5">
          <h2 className="text-[16px] font-semibold">แผนกของคุณ</h2>
          {!hasDepartment ? (
            <p className="mt-2 text-[14px] text-[#4B5E3A]">
              บัญชีนี้ยังไม่ได้เลือกแผนก
            </p>
          ) : board.me && board.me.rank > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-[56px] font-semibold leading-none tabular-nums tracking-tight">
                  #{board.me.rank}
                </div>
                <div className="mt-2 text-[14px] text-[#4B5E3A]">
                  {fmtNum(board.me.total)} ครั้งรวมสัปดาห์นี้
                </div>
              </div>
              <div className="max-w-[160px] text-right text-[13px] font-medium text-[#3F5E1F]">
                {board.me.rank === 1
                  ? "แผนกคุณนำอยู่!"
                  : `อีก ${fmtNum(board.me.gap)} ครั้งจะแซงอันดับ ${board.me.rank - 1}`}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[14px] text-[#4B5E3A]">
              แผนกคุณยังไม่มีคะแนนสัปดาห์นี้ โดดเลยเพื่อพาแผนกติดอันดับ
            </p>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-2 px-1 text-[16px] font-semibold">ตารางอันดับแผนก</h2>
        {board.entries.length === 0 ? (
          <p className="rounded-3xl bg-white px-4 py-6 text-center text-[14px] text-[#6B7A6E]">
            ยังไม่มีอันดับ
          </p>
        ) : (
          <ul className="space-y-2">
            {board.entries.map((e) => (
              <li
                key={e.id}
                className={`flex items-center gap-3 rounded-3xl px-4 py-3 ${
                  e.me ? "bg-[#E8F5C1]" : "bg-white"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${badge(
                    e.rank
                  )}`}
                >
                  {e.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">
                      {e.name}
                    </span>
                    {e.me && (
                      <span className="shrink-0 rounded-full bg-[#1B2A21] px-2 py-0.5 text-[11px] font-semibold text-[#C9F25B]">
                        แผนกคุณ
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#6B7A6E]">
                    {e.active} คนร่วมโดด
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EEF2E4]">
                    <div
                      className="h-full rounded-full bg-[#3F5E1F] transition-[width] duration-500"
                      style={{ width: `${(e.total / max) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-semibold tabular-nums">
                    {fmtNum(e.total)}
                  </div>
                  <div className="text-[11px] text-[#6B7A6E]">ครั้ง</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 px-1 text-[12px] text-[#6B7A6E]">
          คะแนนแผนก = ผลรวมครั้งกระโดดของทุกคนในแผนก นับเฉพาะสัปดาห์นี้ (จันทร์–อาทิตย์ เวลาไทย) แสดง 20 อันดับแรก
        </p>
      </section>
    </div>
  );
}