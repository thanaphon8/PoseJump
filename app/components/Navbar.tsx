"use client";

import { Icon } from "./auth-shared";

/* ------------------------------------------------------------------ */
/* แถบเมนูล่าง (appbar ด้านล่าง) เฉพาะมือถือ                              */
/* แยกมาจาก Shell ใน app/page.tsx (เดสก์ท็อปใช้ sidebar ซ้ายแทน)          */
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
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-[#E3EAD6] bg-white/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
      {items.map(([t, label, d]) => (
        <button
          key={t}
          onClick={() => onTab(t)}
          className="flex flex-col items-center gap-0.5 text-[11px] font-semibold"
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
              tab === t ? "bg-[#C9F25B]" : "text-[#6B7A6E]"
            }`}
          >
            <Icon d={d} size={20} />
          </span>
          <span className={tab === t ? "" : "text-[#6B7A6E]"}>{label}</span>
        </button>
      ))}
    </nav>
  );
}