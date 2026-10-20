"use client";

import { Segmented } from "../auth-shared";

/* ------------------------------------------------------------------ */
/* หน้าตั้งค่า (แท็บ "ตั้งค่า")                                          */
/* แยกมาจาก app/page.tsx รวม Switch ไว้ในไฟล์นี้เลย                       */
/* ------------------------------------------------------------------ */

const card = "rounded-3xl bg-white pj-lift";

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-[#3F5E1F]" : "bg-[#D5DCC8]"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all duration-200 ${
          on ? "left-[22px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export default function Setting({
  facing,
  onFacing,
  sound,
  onSound,
  onClearHistory,
}: {
  facing: "user" | "environment";
  onFacing: (v: "user" | "environment") => void;
  sound: boolean;
  onSound: (v: boolean) => void;
  onClearHistory: () => void;
}) {
  return (
    <>
      <h1 className="text-[30px] font-bold tracking-tight lg:text-[36px]">
        ตั้งค่า
      </h1>
      <div className="mt-5 space-y-4 lg:max-w-md">
        <div className="space-y-4">
          <ul className={`${card} divide-y divide-[#EEF2E4]`}>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[16px]">กล้อง</span>
              <div className="w-40">
                <Segmented<"user" | "environment">
                  small
                  value={facing}
                  onChange={onFacing}
                  options={
                    [
                      ["user", "หน้า"],
                      ["environment", "หลัง"],
                    ] as const
                  }
                />
              </div>
            </li>
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[16px]">เสียงนับและเตือน</span>
              <Switch on={sound} onChange={onSound} label="เสียงนับและเตือน" />
            </li>
          </ul>

          <button
            onClick={() => {
              if (window.confirm("ลบประวัติการกระโดดทั้งหมด?")) onClearHistory();
            }}
            className="h-12 w-full rounded-full bg-white text-[15px] font-semibold text-[#D92D20] transition-transform active:scale-[0.98]"
          >
            ล้างประวัติ
          </button>
        </div>
      </div>
    </>
  );
}