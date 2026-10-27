"use client";

import { useEffect } from "react";
import { ICONS, Icon } from "./auth-shared";
import type { UserBan } from "./auth-shared";

// หน้าต่างแจ้งว่าบัญชีถูกแบน: บอกเหตุผลและเวลาหมดแบน ปิดได้
// ผู้ถูกแบนยังดูอันดับและหน้าอื่นได้ปกติ แต่กดเล่นหรือทำคะแนนไม่ได้
const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function BanNotice({
  ban,
  onClose,
}: {
  ban: UserBan;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="บัญชีถูกแบน"
      className="pj-in fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A21]/70 p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[32px] bg-[#F3F6EC] p-6 text-center text-[#1B2A21] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FDE8E6] text-[#D92D20]">
          <Icon d={ICONS.close} size={32} />
        </span>
        <h2 className="mt-4 text-[24px] font-bold leading-tight">
          บัญชีของคุณถูกแบน
        </h2>
        <p className="mt-1 text-[14px] text-[#6B7A6E]">
          ตอนนี้เล่นและทำคะแนนไม่ได้ คะแนนของวันที่ถูกแบนไม่ถูกนับ
        </p>

        <div className="mt-4 rounded-2xl bg-white p-4 text-left">
          <div className="text-[12px] text-[#6B7A6E]">เหตุผล</div>
          <p className="mt-1 break-words text-[15px] font-semibold">
            {ban.reason}
          </p>
          <div className="mt-3 text-[12px] text-[#6B7A6E]">หมดแบนเมื่อ</div>
          <p className="mt-1 text-[15px] font-semibold tabular-nums">
            {fmtDateTime(ban.expiresAt)}
          </p>
        </div>

        <p className="mt-4 text-[13px] text-[#4B5E3A]">
          ยังดูอันดับและหน้าอื่นได้ตามปกติ
          หากคิดว่าเกิดข้อผิดพลาด ติดต่อผู้ดูแลระบบ
        </p>
        <button
          onClick={onClose}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-full bg-[#1B2A21] text-[17px] font-semibold text-[#C9F25B] transition-all active:scale-[0.98]"
        >
          รับทราบ
        </button>
      </div>
    </div>
  );
}