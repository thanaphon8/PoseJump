// เป้ากระโดดรายวัน (ครั้ง/วัน) ตามช่วงวันที่ เวลาไทย
// แก้ตารางด้านล่างที่เดียว ฝั่งผู้ใช้ เซิร์ฟเวอร์ และแอดมินจะใช้เป้าเดียวกันเอง
// ไฟล์นี้ต้องไม่มี "use client" และไม่ import อะไร เพื่อให้ทั้ง client กับ server เรียกได้

/* ------------------------------------------------------------------ */
/* ตัวช่วยกลาง: "วันเกม" เริ่มรีเซ็ตตอน 06:00 น. เวลาไทย                    */
/* ------------------------------------------------------------------ */

// เปลี่ยนเวลารีเซ็ตที่นี่ที่เดียว (ชั่วโมงเวลาไทย 0-23)
export const RESET_HOUR = 6;
export const TH_MS = 7 * 3600e3; // ไทย UTC+7 ไม่มี DST
export const RESET_MS = RESET_HOUR * 3600e3;
const DAY_MS = 864e5;

// เวลาเริ่มต้นของ "วันเกม" (epoch ms) ที่เวลา t
// เช่น t = 22 ต.ค. 05:59 น. ไทย → คืน 21 ต.ค. 06:00 น. ไทย
export const gameDayStart = (t: number) =>
  Math.floor((t + TH_MS - RESET_MS) / DAY_MS) * DAY_MS - TH_MS + RESET_MS;

// YYYY-MM-DD ของวันเกมที่เวลา t (ใช้เป็น key ของ goal_hits / bans / snapshot)
export const gameDayKey = (t: number) =>
  new Date(gameDayStart(t) + TH_MS).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* ตารางเป้า                                                            */
/* ------------------------------------------------------------------ */

// เป้าของวันที่อยู่นอกตารางทุกวัน
export const DEFAULT_DAILY_GOAL = 100;

// [จากวันที่, ถึงวันที่ (รวมวันนี้), เป้าต่อวัน] รูปแบบ YYYY-MM-DD
// พ.ย. 2569: week1 = 1-7, week2 = 8-14, week3 = 15-21, week4 = 22-30
// วันที่ในตารางหมายถึงวันเกม (เริ่ม 06:00 น. ของวันนั้น ถึง 05:59 น. ของวันถัดไป)
const GOAL_SCHEDULE: readonly (readonly [string, string, number])[] = [
  ["2026-11-01", "2026-11-07", 100],
  ["2026-11-08", "2026-11-14", 200],
  ["2026-11-15", "2026-11-21", 300],
  ["2026-11-22", "2026-11-30", 500],
];

// รายการสัปดาห์สำหรับแสดงผล (ใช้ในหน้าหลัก) week เริ่มที่ 1
export const GOAL_WEEKS = GOAL_SCHEDULE.map(([from, to, goal], i) => ({
  week: i + 1,
  from,
  to,
  goal,
}));

// เป้าของวัน YYYY-MM-DD (วันเกม เวลาไทย)
export function goalOfDate(ymd: string): number {
  for (const [from, to, goal] of GOAL_SCHEDULE) {
    if (ymd >= from && ymd <= to) return goal;
  }
  return DEFAULT_DAILY_GOAL;
}

// เป้าของวันเกมที่ตรงกับเวลา t (epoch ms)
export const goalOfTime = (t: number) => goalOfDate(gameDayKey(t));

// ช่วงวันที่ของเป้าที่วันนั้นอยู่ คืน null ถ้าอยู่นอกตาราง
export function goalRangeOfDate(
  ymd: string
): { from: string; to: string; goal: number } | null {
  for (const [from, to, goal] of GOAL_SCHEDULE) {
    if (ymd >= from && ymd <= to) return { from, to, goal };
  }
  return null;
}

// ช่วงวันที่ของเป้าที่ตรงกับวันเกมของเวลา t (epoch ms)
export const goalRangeOfTime = (t: number) =>
  goalRangeOfDate(gameDayKey(t));

const TH_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

// "1 – 7 พ.ย." หรือ "28 พ.ย. – 4 ธ.ค." ถ้าข้ามเดือน
export function fmtGoalRange(from: string, to: string): string {
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  return fm === tm
    ? `${fd} – ${td} ${TH_MONTHS[tm - 1]}`
    : `${fd} ${TH_MONTHS[fm - 1]} – ${td} ${TH_MONTHS[tm - 1]}`;
}