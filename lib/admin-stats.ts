import { ObjectId, type Db } from "mongodb";
import { purgeOrphansThrottled } from "./purge-orphans";
// branches.ts / departments.ts อยู่ที่ app/components/ (lib/ อยู่ราก โปรเจกต์)
import {
  branchCode,
  branchLabel,
  branchProvince,
  branchRegion,
  getBranch,
} from "../app/components/branches";
import { getCompany, getDepartment } from "../app/components/departments";
import { DEFAULT_DAILY_GOAL, goalOfDate } from "../app/components/goal";
import {
  bansOfDay,
  idVariants,
  publicBan,
  voidedUsersByDay,
  voidedUsersOfDay,
  type PublicBan,
} from "./bans";

// ชื่อ collection ที่เก็บรอบกระโดด ดูจาก app/api/sessions/route.ts
// ห้ามใช้ "sessions" เพราะ lib/auth.ts ใช้เก็บเซสชันล็อกอิน
const JUMPS_COLLECTION = "jumps";

// เวลาไทย UTC+7 ไม่มี DST
export const DAY_MS = 864e5;
const TZ_MS = 7 * 3600e3;

// กติกา: 100 คนแรกที่ถึงเป้ารายวัน ได้ 50 point
export const POINT_QUOTA = 100;
export const POINT_REWARD = 50;
// เป้ารายวันเปลี่ยนตามสัปดาห์ ดู app/components/goal.ts (goalOfDate)
// DAILY_GOAL คงไว้เป็นค่าเริ่มต้นเพื่อไม่ให้ไฟล์อื่นที่ import อยู่พัง
export const DAILY_GOAL = DEFAULT_DAILY_GOAL;

export const ymdOf = (t: number) =>
  new Date(t + TZ_MS).toISOString().slice(0, 10);

// เที่ยงคืนเวลาไทยของวัน YYYY-MM-DD เป็น epoch ms
export const dayStartOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - TZ_MS;
};

// วันจันทร์ของสัปดาห์ที่มีวันนั้น (เวลาไทย)
export const mondayOf = (ymd: string) => {
  const s = dayStartOf(ymd);
  const dow = new Date(s + TZ_MS).getUTCDay(); // 0 = อาทิตย์
  return s - ((dow + 6) % 7) * DAY_MS;
};

export const validYmd = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(dayStartOf(v));

// YYYY-MM ที่ถูกต้อง (เดือน 01-12)
export const validMonth = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

// เที่ยงคืนเวลาไทยของวันที่ 1 ของเดือน YYYY-MM และของเดือนถัดไป
export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: dayStartOf(`${y}-${pad(m)}-01`),
    end: dayStartOf(`${ny}-${pad(nm)}-01`),
  };
};

// สังกัดของผู้เล่น (ใช้ในหน้า admin: กรอง / จัดกลุ่ม / ส่งออก)
// สำนักงานใหญ่ = มีแผนก / หน้าร้าน = มีแต่สาขา (ตรงกับฝั่งผู้ใช้)
export type OrgInfo = {
  company: string | null;
  workplace: "สำนักงานใหญ่" | "หน้าร้าน" | null;
  department: string | null;
  branch: string | null; // ชื่อสาขาไม่รวมรหัส
  branchCode: string | null; // เช่น "115"
  province: string | null;
  region: string | null;
  groupKey: string | null; // "d:<id>" แผนก / "b:<id>" สาขา
  groupName: string | null;
};

export type DayEntry = {
  userId: string;
  name: string;
  username: string;
  employeeId: string | null; // รหัสพนักงาน (ผู้ใช้เก่าที่สมัครก่อนมีฟิลด์นี้เป็น null)
  total: number;
  rounds: number;
  goal: number;
  goalRank: number | null;
  points: number;
  avatarUrl: string | null;
  org: OrgInfo;
};

// ผู้เล่นที่ถูกแบนในวันนั้น (คะแนนของวันนั้นถูกตัด ไม่อยู่ในอันดับ)
// total / rounds = ยอดที่เคยโดดในวันนั้น (ไว้ให้ admin ดูเท่านั้น ไม่นับเข้ารวม)
export type BannedEntry = {
  userId: string;
  name: string;
  username: string;
  employeeId: string | null;
  avatarUrl: string | null;
  org: OrgInfo;
  total: number;
  rounds: number;
  ban: PublicBan;
};

type Row = Record<string, unknown>;

const idOf = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function orgFromUser(u?: Row): OrgInfo {
  const company = getCompany(idOf(u?.companyId));
  const dept = getDepartment(idOf(u?.departmentId));
  const branch = getBranch(idOf(u?.branchId));
  return {
    company: company?.name ?? null,
    workplace: dept ? "สำนักงานใหญ่" : branch ? "หน้าร้าน" : null,
    department: dept?.name ?? null,
    branch: branch ? branchLabel(branch) : null,
    branchCode: branch ? branchCode(branch) : null,
    province: branch ? branchProvince(branch) : null,
    region: branch ? branchRegion(branch) : null,
    groupKey: dept ? `d:${dept.id}` : branch ? `b:${branch.id}` : null,
    groupName: dept ? dept.name : branch ? branchLabel(branch) : null,
  };
}

// รูปโปรไฟล์ของผู้เล่น ถ้า field ใน users ไม่ใช่ avatarUrl แก้ที่นี่ที่เดียว
export function avatarOf(u?: Row): string | null {
  const v = u?.avatarUrl;
  return typeof v === "string" && v ? v : null;
}

// รหัสพนักงานของผู้เล่น (field employeeId ใน users)
// ผู้ใช้เก่าที่สมัครก่อนมีฟิลด์นี้จะได้ null
export function employeeIdOf(u?: Row): string | null {
  const v = u?.employeeId;
  return typeof v === "string" && v ? v : null;
}

// userId อาจเก็บเป็น ObjectId หรือ string รองรับทั้งสองแบบ
const toId = (v: unknown) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

async function loadUserMap(db: Db, rows: Row[]) {
  const ids = [
    ...new Map(rows.map((r) => [String(r.userId), r.userId])).values(),
  ];
  const users = await db
    .collection("users")
    .find({ _id: { $in: ids.map(toId) as ObjectId[] } })
    .toArray();
  return new Map(users.map((u) => [String(u._id), u as Row]));
}

// ตัดรอบกระโดดของบัญชีที่ถูกลบไปแล้วออก (ไม่มี doc ใน users)
// เป็นด่านสำรอง เผื่อรอบ purge ยังไม่ถึงเวลา
const aliveOnly = (rows: Row[], userMap: Map<string, Row>) =>
  rows.filter((r) => userMap.has(String(r.userId)));

// รอบกระโดดของหนึ่งวัน (เรียงเวลาแล้ว) -> ผลของทุกคน เรียงตามยอดรวมมากไปน้อย
// goalRank = ลำดับเวลาที่ยอดสะสมของวันนั้นถึงเป้า (1 = ถึงก่อน)
function buildDay(rows: Row[], userMap: Map<string, Row>): DayEntry[] {
  if (rows.length === 0) return [];

  // เป้าของวันนี้ (ทุกแถวใน rows อยู่วันไทยเดียวกัน)
  const goal = goalOfDate(ymdOf(Number(rows[0].ts)));

  const acc = new Map<
    string,
    { total: number; rounds: number; goalAt: number | null }
  >();
  for (const r of rows) {
    const k = String(r.userId);
    const a = acc.get(k) ?? { total: 0, rounds: 0, goalAt: null };
    a.total += Number(r.total) || 0;
    a.rounds += 1;
    if (a.goalAt === null && a.total >= goal) {
      a.goalAt = Number(r.ts);
    }
    acc.set(k, a);
  }

  const order = [...acc.entries()]
    .filter(([, a]) => a.goalAt !== null)
    .sort((a, b) => (a[1].goalAt as number) - (b[1].goalAt as number))
    .map(([k]) => k);
  const rankOf = new Map(order.map((k, i) => [k, i + 1]));

  return [...acc.entries()]
    .map(([k, a]) => {
      const u = userMap.get(k);
      const goalRank = rankOf.get(k) ?? null;
      return {
        userId: k,
        name: String(u?.nickname ?? u?.display ?? "?"),
        username: String(u?.username ?? ""),
        employeeId: employeeIdOf(u),
        total: a.total,
        rounds: a.rounds,
        goal,
        goalRank,
        points: goalRank !== null && goalRank <= POINT_QUOTA ? POINT_REWARD : 0,
        avatarUrl: avatarOf(u),
        org: orgFromUser(u),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// เติมสังกัด (org) รูปโปรไฟล์ และรหัสพนักงาน ให้แถวที่มี userId
// ใช้กับ route สัปดาห์/เดือนที่สร้างแถวเอง
export async function withOrg<T extends { userId: string }>(
  db: Db,
  rows: T[]
): Promise<
  (T & { org: OrgInfo; avatarUrl: string | null; employeeId: string | null })[]
> {
  if (rows.length === 0) return [];
  const userMap = await loadUserMap(db, rows as unknown as Row[]);
  return rows.map((r) => {
    const u = userMap.get(r.userId);
    return {
      ...r,
      org: orgFromUser(u),
      avatarUrl: avatarOf(u),
      employeeId: employeeIdOf(u),
    };
  });
}

// ผลของทุกคนในหนึ่งวัน
// ผู้เล่นที่ถูกแบนในวันนั้นถูกตัดออกก่อนคำนวณ เหมือนไม่ได้เล่น
// ลำดับถึงเป้าและ point ของคนที่เหลือจึงเลื่อนขึ้นเอง (คนที่ 101 ขึ้นมาแทน)
export async function computeDay(db: Db, start: number): Promise<DayEntry[]> {
  // ลบข้อมูลของบัญชีที่ไม่มีอยู่แล้วออกจากฐานข้อมูลจริง (ไม่เกิน 1 ครั้ง/นาที)
  await purgeOrphansThrottled(db);

  const voided = await voidedUsersOfDay(db, ymdOf(start));

  const rows = (await db
    .collection(JUMPS_COLLECTION)
    .find({ ts: { $gte: start, $lt: start + DAY_MS } })
    .sort({ ts: 1 })
    .toArray()) as Row[];
  if (rows.length === 0) return [];
  const userMap = await loadUserMap(db, rows);
  const kept = aliveOnly(rows, userMap).filter(
    (r) => !voided.has(String(r.userId))
  );
  return buildDay(kept, userMap);
}

// ผู้เล่นที่ถูกแบนในวันนั้น (ไว้ให้หน้า admin แสดงและปลดแบน)
export async function computeDayBanned(
  db: Db,
  start: number
): Promise<BannedEntry[]> {
  const bans = await bansOfDay(db, ymdOf(start));
  if (bans.length === 0) return [];

  const userMap = await loadUserMap(
    db,
    bans.map((b) => ({ userId: b.userId }))
  );
  const rows = (await db
    .collection(JUMPS_COLLECTION)
    .find({
      ts: { $gte: start, $lt: start + DAY_MS },
      userId: { $in: bans.flatMap((b) => idVariants(b.userId)) },
    })
    .toArray()) as Row[];

  const sums = new Map<string, { total: number; rounds: number }>();
  for (const r of rows) {
    const k = String(r.userId);
    const a = sums.get(k) ?? { total: 0, rounds: 0 };
    a.total += Number(r.total) || 0;
    a.rounds += 1;
    sums.set(k, a);
  }

  const now = Date.now();
  const out: BannedEntry[] = [];
  for (const b of bans) {
    const k = String(b.userId);
    const u = userMap.get(k);
    if (!u) continue; // บัญชีถูกลบแล้ว
    const s = sums.get(k) ?? { total: 0, rounds: 0 };
    out.push({
      userId: k,
      name: String(u.nickname ?? u.display ?? "?"),
      username: String(u.username ?? ""),
      employeeId: employeeIdOf(u),
      avatarUrl: avatarOf(u),
      org: orgFromUser(u),
      total: s.total,
      rounds: s.rounds,
      ban: publicBan(b, now),
    });
  }
  return out.sort((a, b) => b.ban.bannedAt - a.ban.bannedAt);
}

// ผลหลายวันในครั้งเดียว (ดึงฐานข้อมูลรอบเดียว) start ต้องเป็นเที่ยงคืนเวลาไทย
// คืนอาร์เรย์ยาว (end - start) / 1 วัน แต่ละช่อง = ผลของวันนั้น
// วันที่ผู้เล่นถูกแบนถูกตัดออก (ยอดโดด ลำดับ point) เหมือนไม่ได้เล่นวันนั้น
export async function computeRange(
  db: Db,
  start: number,
  end: number
): Promise<DayEntry[][]> {
  // ลบข้อมูลของบัญชีที่ไม่มีอยู่แล้วออกจากฐานข้อมูลจริง (ไม่เกิน 1 ครั้ง/นาที)
  await purgeOrphansThrottled(db);

  const n = Math.max(0, Math.round((end - start) / DAY_MS));
  const out: DayEntry[][] = Array.from({ length: n }, () => []);
  if (n === 0) return out;

  const rows = (await db
    .collection(JUMPS_COLLECTION)
    .find({ ts: { $gte: start, $lt: end } })
    .sort({ ts: 1 })
    .toArray()) as Row[];
  if (rows.length === 0) return out;

  const voidedByDay = await voidedUsersByDay(db, ymdOf(start), ymdOf(end - 1));

  const userMap = await loadUserMap(db, rows);
  const buckets: Row[][] = Array.from({ length: n }, () => []);
  for (const r of aliveOnly(rows, userMap)) {
    const i = Math.floor((Number(r.ts) - start) / DAY_MS);
    if (i >= 0 && i < n) {
      if (voidedByDay.get(ymdOf(start + i * DAY_MS))?.has(String(r.userId)))
        continue;
      buckets[i].push(r);
    }
  }
  buckets.forEach((b, i) => {
    out[i] = buildDay(b, userMap);
  });
  return out;
}

// เวลาของรอบกระโดดแรกสุด (เริ่มกิจกรรม) null = ยังไม่มีข้อมูล
// นับเฉพาะรอบของบัญชีที่ยังอยู่ (บัญชีที่ลบแล้วไม่ทำให้วันเริ่มกิจกรรมเพี้ยน)
export async function firstJumpTs(db: Db): Promise<number | null> {
  const users = await db
    .collection("users")
    .find({}, { projection: { _id: 1 } })
    .toArray();
  if (users.length === 0) return null;

  const ids: unknown[] = users.flatMap((u) => [u._id, String(u._id)]);
  const row = await db
    .collection(JUMPS_COLLECTION)
    .find({ userId: { $in: ids } })
    .sort({ ts: 1 })
    .limit(1)
    .next();
  const t = Number(row?.ts);
  return Number.isFinite(t) ? t : null;
}
