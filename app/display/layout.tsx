import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Prompt } from "next/font/google";

export const metadata: Metadata = {
  title: "Daily Jump Challenge – อันดับ",
};

// ฟอนต์เดียวกับ app/page.tsx (Prompt: ไทย + อังกฤษ)
const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const FONT = `${prompt.style.fontFamily}, -apple-system, BlinkMacSystemFont, "Noto Sans Thai", Sarabun, sans-serif`;

export default function DisplayLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT }} className="antialiased">
      {children}
    </div>
  );
}