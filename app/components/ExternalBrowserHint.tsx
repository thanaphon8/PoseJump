"use client";

import { useEffect, useState } from "react";

// แบนเนอร์ชวนเปิดนอก LINE: แสดงเฉพาะตอนเปิดอยู่ใน LINE in-app browser (userAgent มี "Line/")
// เปิดนอก LINE (Safari / Chrome ฯลฯ) ไม่แสดงอะไร ตามที่ต้องการ
// ปุ่มเปิดลิงก์เดิม + openExternalBrowser=1 (path และ query อื่นคงเดิม)
// ถ้ากดแล้วยังอยู่ใน LINE ให้ใช้ปุ่มคัดลอกลิงก์ หรือเมนู ⋯ ของ LINE แทน

type Info = { href: string; ios: boolean };

export default function ExternalBrowserHint() {
  const [info, setInfo] = useState<Info | null>(null);
  const [closed, setClosed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    if (!/\bLine\//i.test(ua)) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("openExternalBrowser", "1");
      setInfo({ href: u.toString(), ios: /iPhone|iPad|iPod/i.test(ua) });
    } catch {}
  }, []);

  if (!info || closed) return null;

  const copy = async () => {
    try {
      const u = new URL(info.href);
      u.searchParams.delete("openExternalBrowser");
      await navigator.clipboard.writeText(u.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] bg-[#1B2A21] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-lg"
    >
      <div className="mx-auto flex max-w-xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug">
            เปิดในเบราว์เซอร์ของเครื่อง จะใช้กล้องและนับได้เสถียรกว่า
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-white/65">
            ถ้ากดแล้วไม่เปิด ให้แตะเมนู ⋯ มุมขวา แล้วเลือก{" "}
            {info.ios ? "เปิดใน Safari" : "เปิดในเบราว์เซอร์อื่น"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={info.href}
              className="inline-flex h-9 items-center rounded-full bg-[#C9F25B] px-4 text-[14px] font-semibold text-[#1B2A21] active:scale-95"
            >
              {info.ios ? "เปิดใน Safari" : "เปิดใน Chrome"}
            </a>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-9 items-center rounded-full bg-white/10 px-4 text-[13px] font-medium text-white active:scale-95"
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="ปิด"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[18px] leading-none active:scale-90"
        >
          ×
        </button>
      </div>
    </div>
  );
}