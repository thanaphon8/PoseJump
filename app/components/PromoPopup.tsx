"use client";

import { useEffect, useState } from "react";
import { ICONS, Icon, POINT_QUOTA, POINT_REWARD } from "./auth-shared";

// ป๊อปอัพเชิญชวนตอนเข้าหน้าแรก: รูปเต็มการ์ด ข้อความอยู่ในรูป พื้นไล่สีเขียวเข้ม→อ่อน
// ปิดด้วยการแตะพื้นหลัง/Esc/ปุ่มเริ่มเลย และมีช่อง "ไม่ต้องแสดงอีก"
export default function PromoPopup({
  onClose,
  onStart,
}: {
  onClose: (hide: boolean) => void;
  onStart: (hide: boolean) => void;
}) {
  const [hide, setHide] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(hide);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="รับ point"
      className="pj-in fixed inset-0 z-40 flex items-center justify-center bg-[#1B2A21]/70 p-5 backdrop-blur-sm"
      onClick={() => onClose(hide)}
    >
      <div
        className="pj-pop relative w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="relative flex min-h-[640px] w-full flex-col justify-end overflow-hidden rounded-[32px] bg-gradient-to-t from-[#1B2A21] to-[#8FB54A] text-white shadow-2xl">
        {/* รูปเต็มการ์ด */}
        {imgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/img/jump.PNG"
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* ไล่สีเขียว: เข้มล่าง (ที่ข้อความ) → จางบน (เห็นรูป) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A21] via-[#1B2A21]/85 via-45% to-[#3F5E1F]/10" />

        {/* ข้อความอยู่ในรูป */}
        <div className="relative px-6 pb-5 pt-56 text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#C9F25B] px-3 py-1 text-[12px] font-semibold text-[#1B2A21]">
            <Icon d={ICONS.star} size={12} fill />
            รับ point ทุกวัน
          </span>
          <h2 className="mt-3 text-[30px] font-bold leading-tight tracking-tight drop-shadow-sm">
            โดดปั๊บ รับ{" "}
            <span className="inline-flex items-center gap-1.5 align-middle text-[#C9F25B]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C9F25B] text-[#1B2A21]">
                <Icon d={ICONS.star} size={18} fill />
              </span>
              {POINT_REWARD} point!
            </span>
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-white/85">
            {POINT_QUOTA} คนแรกที่โดดถึงเป้าหมายรายวัน รับ {POINT_REWARD} point
            เซ็ตใหม่ทุกเที่ยงคืนเวลาไทย
          </p>

          <button
            onClick={() => onStart(hide)}
            className="pj-glow mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#C9F25B] text-[17px] font-semibold text-[#1B2A21] transition-all active:scale-[0.98] active:bg-[#B8E348]"
          >
            เริ่มเลย
          </button>

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-[14px] text-white/80">
            <input
              type="checkbox"
              checked={hide}
              onChange={(e) => setHide(e.target.checked)}
              className="h-5 w-5 accent-[#C9F25B]"
            />
            ไม่ต้องแสดงอีก
          </label>
        </div>
      </div>
      </div>
    </div>
  );
}