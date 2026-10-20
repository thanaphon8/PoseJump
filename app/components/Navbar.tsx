"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./auth-shared";

/* ------------------------------------------------------------------ */
/* แถบเมนูล่าง (appbar ด้านล่าง) เฉพาะมือถือ                              */
/* แยกมาจาก Shell ใน app/page.tsx (เดสก์ท็อปใช้ sidebar ซ้ายแทน)          */
/* สไตล์ iOS 26: แถบลอยกระจกเบลอ แถบเลือกเลื่อนตามนิ้ว/สปริงตอนปล่อย         */
/* เลื่อนหน้าลง = ย่อแถบ (ซ่อนป้ายชื่อ) เลื่อนขึ้น = ขยายกลับ              */
/* ------------------------------------------------------------------ */

// แท็บของแอป (app/page.tsx นำเข้าชนิดนี้ไปใช้ต่อ)
export type Tab = "home" | "today" | "history" | "settings";

// [แท็บ, ป้ายชื่อ, path ของไอคอน]
export type NavItem = [Tab, string, string];

export default function Navbar({
  tab,
  onTab,
  items,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  items: NavItem[];
}) {
  const n = items.length;
  const index = Math.max(
    0,
    items.findIndex(([t]) => t === tab)
  );
  const gridRef = useRef<HTMLDivElement>(null);
  // ตำแหน่งนิ้วขณะลาก หน่วยเป็นช่องแท็บ (ทศนิยมได้) null = ไม่ได้ลาก
  const [drag, setDrag] = useState<number | null>(null);
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const startX = useRef<number | null>(null); // จุดที่นิ้วแตะลง null = ไม่ได้กด

  // ฟังการเลื่อนของทุก element (ตัวที่เลื่อนจริงอาจเป็น div ใน Shell ไม่ใช่ window)
  useEffect(() => {
    const onScroll = (e: Event) => {
      const t = e.target;
      const y = t instanceof HTMLElement ? t.scrollTop : window.scrollY;
      const d = y - lastY.current;
      if (Math.abs(d) < 6) return;
      lastY.current = y;
      setCompact(y >= 24 && d > 0);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  const posAt = (clientX: number) => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return index;
    const p = ((clientX - r.left) / r.width) * n - 0.5;
    return Math.max(0, Math.min(n - 1, p));
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX; // ยังไม่ setDrag: แตะเฉยๆ ให้แถบสปริงเอง
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    if (drag === null && Math.abs(e.clientX - startX.current) < 6) return;
    setDrag(posAt(e.clientX));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    startX.current = null;
    const i = Math.round(posAt(e.clientX));
    setDrag(null);
    if (i !== index) onTab(items[i][0]);
  };
  const onCancel = () => {
    startX.current = null;
    setDrag(null);
  };

  const dragging = drag !== null;
  const pos = drag ?? index;
  const activeIdx = Math.round(pos);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      aria-hidden={false}
    >
      <nav
        aria-label="เมนูหลัก"
        className="pointer-events-auto relative w-full max-w-md rounded-full border border-white/70 bg-white/55 p-1 shadow-[0_8px_32px_rgba(27,42,33,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl backdrop-saturate-[1.8]"
      >
        <div
          ref={gridRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          className="relative grid touch-none select-none"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {/* แถบเลือก: เลื่อนตามนิ้ว ปล่อยแล้วสปริงเข้าช่อง */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 transition-transform motion-reduce:transition-none ${
              dragging
                ? "duration-100 ease-out"
                : "duration-[450ms] ease-[cubic-bezier(0.22,1.25,0.36,1)]"
            }`}
            style={{
              width: `${100 / n}%`,
              transform: `translateX(${pos * 100}%)`,
            }}
          >
            <span
              className={`block h-full w-full rounded-full bg-[#C9F25B] transition-[transform,box-shadow] duration-[450ms] ease-[cubic-bezier(0.22,1.25,0.36,1)] motion-reduce:transition-none ${
                dragging
                  ? "scale-[1.12] shadow-[0_6px_18px_rgba(63,94,31,0.35)]"
                  : "scale-100 shadow-[0_2px_8px_rgba(63,94,31,0.2)]"
              }`}
            />
          </div>

          {items.map(([t, label, d], i) => {
            const active = i === activeIdx;
            return (
              <button
                key={t}
                // ใช้ pointer events จัดการแตะ/ลากแล้ว onClick รับเฉพาะคีย์บอร์ด (detail 0)
                onClick={(e) => {
                  if (e.detail === 0) onTab(t);
                }}
                aria-label={label}
                aria-current={tab === t ? "page" : undefined}
                className={`relative z-10 flex flex-col items-center justify-center py-1.5 text-[11px] font-semibold transition-colors duration-200 ${
                  active ? "text-[#1B2A21]" : "text-[#6B7A6E]"}`}
              >
                <span
                  className={`flex h-7 items-center justify-center transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1.25,0.36,1)] motion-reduce:transition-none ${
                    active && dragging ? "scale-110" : "scale-100"
                  }`}
                >
                  <Icon d={d} size={22} />
                </span>
                <span
                  className={`overflow-hidden whitespace-nowrap leading-none transition-all duration-300 motion-reduce:transition-none ${
                    compact
                      ? "mt-0 max-h-0 opacity-0"
                      : "mt-0.5 max-h-4 opacity-100"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}