// เป้ากระโดดรายวัน (ครั้ง/วัน) ตามช่วงวันที่ เวลาไทย
// แก้ตารางด้านล่างที่เดียว ฝั่งผู้ใช้ เซิร์ฟเวอร์ และแอดมินจะใช้เป้าเดียวกันเอง
// ไฟล์นี้ต้องไม่มี "use client" และไม่ import อะไร เพื่อให้ทั้ง client กับ server เรียกได้

// เป้าของวันที่อยู่นอกตารางทุกวัน
export const DEFAULT_DAILY_GOAL = 100;

// [จากวันที่, ถึงวันที่ (รวมวันนี้), เป้าต่อวัน] รูปแบบ YYYY-MM-DD
// พ.ย. 2569: week1 = 1-7, week2 = 8-14, week3 = 15-21, week4 = 22-30
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

// เป้าของวัน YYYY-MM-DD (เวลาไทย)
export function goalOfDate(ymd: string): number {
  for (const [from, to, goal] of GOAL_SCHEDULE) {
    if (ymd >= from && ymd <= to) return goal;
  }
  return DEFAULT_DAILY_GOAL;
}

// เป้าของวันที่ตรงกับเวลา t (epoch ms) ตามเวลาไทย UTC+7
export const goalOfTime = (t: number) =>
  goalOfDate(new Date(t + 7 * 3600e3).toISOString().slice(0, 10));

// ช่วงวันที่ของเป้าที่วันนั้นอยู่ คืน null ถ้าอยู่นอกตาราง
export function goalRangeOfDate(
  ymd: string
): { from: string; to: string; goal: number } | null {
  for (const [from, to, goal] of GOAL_SCHEDULE) {
    if (ymd >= from && ymd <= to) return { from, to, goal };
  }
  return null;
}

// ช่วงวันที่ของเป้าที่ตรงกับเวลา t (epoch ms) ตามเวลาไทย UTC+7
export const goalRangeOfTime = (t: number) =>
  goalRangeOfDate(new Date(t + 7 * 3600e3).toISOString().slice(0, 10));

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