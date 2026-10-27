"use client";

import { useEffect, useState } from "react";
import Jumper from "./Jumper";

// เวลาเฟดจางหายตอนข้อมูลมาแล้ว (ms)
const FADE_MS = 300;

type Phase = "show" | "fade" | "gone";

// หน้าโหลดอันดับ: ตัวการ์ตูน Jumper กระโดดเชือก + ข้อความใต้ตัว
// loading = true  -> แสดงตามปกติ (อยู่ในโฟลว์ ดันความสูงให้กล่อง)
// loading = false -> เฟดจางหาย 300ms โดยลอยทับเนื้อหาจริง (ไม่ดันเลย์เอาต์) แล้วถอดออกจาก DOM
// ตอนเมานต์ครั้งแรกที่ loading = false (มีแคชอยู่แล้ว) จะไม่แสดงเลย
export default function RankLoader({
  loading,
  size = 220,
  text = "กำลังโหลดอันดับ",
}: {
  loading: boolean;
  size?: number;
  text?: string;
}) {
  const [phase, setPhase] = useState<Phase>(loading ? "show" : "gone");

  useEffect(() => {
    if (loading) {
      setPhase("show");
      return;
    }
    setPhase((p) => (p === "show" ? "fade" : p));
    const t = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(t);
  }, [loading]);

  // ใช้ค่าที่คำนวณทันทีตอน loading เปลี่ยน กันเฟรมที่ตัวโหลดกับเนื้อหาซ้อนกันในโฟลว์
  const cur: Phase = loading ? "show" : phase === "show" ? "fade" : phase;
  if (cur === "gone") return null;

  return (
    <div
      role="status"
      aria-label={text}
      className={`flex min-h-[420px] w-full flex-col items-center justify-center px-4 py-8 transition-opacity ${
        cur === "show"
          ? "relative opacity-100"
          : "pointer-events-none absolute inset-x-0 top-0 z-10 opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <Jumper size={size} cycle={false} />
      <p className="mt-4 text-[15px] font-semibold text-[#3F5E1F]">{text}</p>
    </div>
  );
}