import { ObjectId, type Db } from "mongodb";
import { addUserPoints } from "./points";

// ระบบแบนผู้เล่น (collection "bans")
// - แบนครั้งละ 24 ชม. นับจากเวลาที่กดแบน
// - ผู้เล่นที่ถูกแบนจะเล่น/บันทึกรอบไม่ได้ (ดู app/api/sessions/route.ts)
// - คะแนนของ "วันไทยที่ถูกแบน" ถูกตัดออกทั้งหมด เหมือนไม่ได้เล่นวันนั้น
//   (ยอดโดด ลำดับถึงเป้า point ยอดสะสมแผนก) โดยไม่ลบข้อมูลจริง กรองออกตอนอ่าน
//   ปลดแบนแล้วทุกอย่างกลับมา
// - แบนข้ามเที่ยงคืน: ตัดเฉพาะวันที่กดแบน วันถัดไปแค่เล่นไม่ได้จนกว่าจะหมดเวลา

export const BANS_COLLECTION = "bans";
export const BAN_MS = 24 * 3600e3;

// ต้องตรงกับ POINT_QUOTA / POINT_REWARD ใน lib/admin-stats.ts
// (ไม่ import มาเพื่อกัน import วนกัน)
const POINT_QUOTA = 100;
const POINT_REWARD = 50;

const TZ_MS = 7 * 3600e3; // ไทย UTC+7 ไม่มี DST
const DAY_MS = 864e5;

export type BanDoc = {
  _id: ObjectId;
  userId: ObjectId | string;
  reason: string;
  bannedAt: number;
  expiresAt: number;
  day: string; // วันไทย YYYY-MM-DD ที่กดแบน (วันที่ถูกตัดคะแนน)
  bannedBy: string;
  revokedAt: number | null;
  revokedBy: string | null;
};

export type PublicBan = {
  id: string;
  reason: string;
  bannedAt: number;
  expiresAt: number;
  day: string;
  active: boolean;
};

export const thaiYmd = (t: number) =>
  new Date(t + TZ_MS).toISOString().slice(0, 10);

const dayStartOfYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - TZ_MS;
};

const toId = (v: unknown) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

// userId อาจเก็บเป็น ObjectId หรือ string รองรับทั้งสองแบบ
export const idVariants = (v: unknown): unknown[] => {
  const s = String(v);
  return ObjectId.isValid(s) ? [new ObjectId(s), s] : [s];
};

export const publicBan = (b: BanDoc, now = Date.now()): PublicBan => ({
  id: String(b._id),
  reason: b.reason,
  bannedAt: b.bannedAt,
  expiresAt: b.expiresAt,
  day: b.day,
  active: b.revokedAt === null && b.expiresAt > now,
});

let indexReady: Promise<unknown> | null = null;
function ensureBanIndexes(db: Db) {
  if (!indexReady) {
    indexReady = Promise.all([
      db
        .collection(BANS_COLLECTION)
        .createIndex({ userId: 1, revokedAt: 1, expiresAt: 1 }),
      db.collection(BANS_COLLECTION).createIndex({ day: 1, revokedAt: 1 }),
    ]).catch((e) => {
      indexReady = null;
      console.error("ensureBanIndexes failed", e);
    });
  }
  return indexReady;
}

// แบนที่ยังมีผลอยู่ของผู้ใช้ (ยังไม่ถูกปลด และยังไม่หมดเวลา) null = ไม่ถูกแบน
export async function activeBanOf(
  db: Db,
  userId: unknown,
  now = Date.now()
): Promise<BanDoc | null> {
  const b = await db.collection(BANS_COLLECTION).findOne(
    {
      userId: { $in: idVariants(userId) },
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { sort: { expiresAt: -1 } }
  );
  return (b as unknown as BanDoc | null) ?? null;
}

// แบนที่ไม่ถูกปลดของวันนั้น (รวมที่หมดเวลาแล้ว เพราะยังตัดคะแนนวันนั้นอยู่)
export async function bansOfDay(db: Db, day: string): Promise<BanDoc[]> {
  const rows = await db
    .collection(BANS_COLLECTION)
    .find({ day, revokedAt: null })
    .toArray();
  return rows as unknown as BanDoc[];
}

export async function hasBanForDay(db: Db, day: string): Promise<boolean> {
  const n = await db
    .collection(BANS_COLLECTION)
    .countDocuments({ day, revokedAt: null }, { limit: 1 });
  return n > 0;
}

// userId (string) ที่ถูกตัดคะแนนของวันนั้น
export async function voidedUsersOfDay(
  db: Db,
  day: string
): Promise<Set<string>> {
  const bans = await bansOfDay(db, day);
  return new Set(bans.map((b) => String(b.userId)));
}

// หลายวันในครั้งเดียว fromDay / toDay เป็น YYYY-MM-DD รวมทั้งสองวัน
export async function voidedUsersByDay(
  db: Db,
  fromDay: string,
  toDay: string
): Promise<Map<string, Set<string>>> {
  const rows = (await db
    .collection(BANS_COLLECTION)
    .find(
      { day: { $gte: fromDay, $lte: toDay }, revokedAt: null },
      { projection: { userId: 1, day: 1 } }
    )
    .toArray()) as unknown as Pick<BanDoc, "userId" | "day">[];
  const out = new Map<string, Set<string>>();
  for (const b of rows) {
    const s = out.get(b.day) ?? new Set<string>();
    s.add(String(b.userId));
    out.set(b.day, s);
  }
  return out;
}

// เงื่อนไข $match สำหรับ dept_jumps / jumps: ตัดแถวของคนที่ถูกแบนในวันที่ถูกแบน
// null = ไม่มีแบนเลย ไม่ต้องกรอง
export async function voidedDeptFilter(
  db: Db
): Promise<Record<string, unknown> | null> {
  const bans = (await db
    .collection(BANS_COLLECTION)
    .find({ revokedAt: null }, { projection: { userId: 1, day: 1 } })
    .toArray()) as unknown as Pick<BanDoc, "userId" | "day">[];
  if (bans.length === 0) return null;
  return {
    $nor: bans.map((b) => {
      const s = dayStartOfYmd(b.day);
      return {
        userId: { $in: idVariants(b.userId) },
        ts: { $gte: s, $lt: s + DAY_MS },
      };
    }),
  };
}

// คำนวณ point ของวันนั้นใหม่จาก goal_hits (เรียงตาม seq = ลำดับเวลาถึงเป้า)
// ข้ามคนที่ถูกตัดคะแนน แล้วให้ POINT_REWARD กับ POINT_QUOTA คนแรกที่เหลือ
// เทียบกับ award เดิม แล้วปรับ users.points ตามส่วนต่าง
// เรียกซ้ำกี่ครั้งก็ได้ผลเท่าเดิม (อัปเดต award แบบมีเงื่อนไข กันบวกซ้ำ)
export async function recomputeDayPoints(db: Db, day: string) {
  const voided = await voidedUsersOfDay(db, day);
  const hits = await db
    .collection("goal_hits")
    .find({ day })
    .sort({ seq: 1 })
    .toArray();

  let n = 0;
  for (const h of hits) {
    let want = 0;
    if (!voided.has(String(h.userId))) {
      n += 1;
      want = n <= POINT_QUOTA ? POINT_REWARD : 0;
    }
    const old = typeof h.award === "number" ? h.award : 0;
    if (want === old) continue;
    const r = await db
      .collection("goal_hits")
      .updateOne({ _id: h._id, award: h.award }, { $set: { award: want } });
    if (r.modifiedCount === 1) await addUserPoints(h.userId, want - old);
  }
}

export type BanResult =
  | { ok: true; ban: BanDoc }
  | { ok: false; error: "notfound" | "active" | "exists" };

// แบนผู้ใช้ 24 ชม. นับจากตอนนี้ แล้วตัดคะแนนของวันนี้ (วันไทย)
export async function banUser(
  db: Db,
  userId: string,
  reason: string,
  now = Date.now()
): Promise<BanResult> {
  await ensureBanIndexes(db);

  const user = await db
    .collection("users")
    .findOne({ _id: toId(userId) as ObjectId }, { projection: { _id: 1 } });
  if (!user) return { ok: false, error: "notfound" };

  if (await activeBanOf(db, user._id, now)) return { ok: false, error: "active" };

  const day = thaiYmd(now);
  const dup = await db.collection(BANS_COLLECTION).findOne({
    userId: { $in: idVariants(user._id) },
    day,
    revokedAt: null,
  });
  if (dup) return { ok: false, error: "exists" };

  const doc = {
    userId: user._id,
    reason,
    bannedAt: now,
    expiresAt: now + BAN_MS,
    day,
    bannedBy: "admin",
    revokedAt: null,
    revokedBy: null,
  };
  const r = await db.collection(BANS_COLLECTION).insertOne(doc);

  // ถ้าปรับ point พลาด แบนยังมีผล และรอบถัดไปที่คำนวณจะแก้ให้ถูกเอง
  try {
    await recomputeDayPoints(db, day);
  } catch (e) {
    console.error("recomputeDayPoints after ban failed", e);
  }
  return { ok: true, ban: { _id: r.insertedId, ...doc } as BanDoc };
}

export type UnbanResult =
  | { ok: true; ban: BanDoc }
  | { ok: false; error: "notfound" | "revoked" };

// ปลดแบน (ใช้กรณี admin ตรวจผิด) คะแนนและ point ของวันนั้นกลับมา
export async function unbanUser(
  db: Db,
  banId: string,
  now = Date.now()
): Promise<UnbanResult> {
  if (!ObjectId.isValid(banId)) return { ok: false, error: "notfound" };
  const _id = new ObjectId(banId);
  const b = (await db
    .collection(BANS_COLLECTION)
    .findOne({ _id })) as unknown as BanDoc | null;
  if (!b) return { ok: false, error: "notfound" };
  if (b.revokedAt !== null) return { ok: false, error: "revoked" };

  const r = await db
    .collection(BANS_COLLECTION)
    .updateOne(
      { _id, revokedAt: null },
      { $set: { revokedAt: now, revokedBy: "admin" } }
    );
  if (r.modifiedCount !== 1) return { ok: false, error: "revoked" };

  try {
    await recomputeDayPoints(db, b.day);
  } catch (e) {
    console.error("recomputeDayPoints after unban failed", e);
  }
  return { ok: true, ban: { ...b, revokedAt: now, revokedBy: "admin" } };
}
