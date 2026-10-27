import { NextResponse, connection } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";
import { getUserPoints } from "../../../lib/points";
import { purgeOrphansThrottled } from "../../../lib/purge-orphans";
// แปลง companyId / departmentId / branchId เป็นชื่อ (ตัวเดียวกับที่หน้าตั้งค่าใช้)
// ถ้า path ไม่ตรงโครงสร้างโปรเจกต์ ให้แก้บรรทัดนี้ให้ชี้ไปที่ branches.ts
import { orgOf, getBranch, branchLabel } from "../../components/branches";
import { getDepartment } from "../../components/departments";
import { goalOfDate } from "../../components/goal";
import { voidedUsersOfDay } from "../../../lib/bans";

// "วันนี้" นับตามเวลาไทย (UTC+7) อันดับจึงรีเซ็ตตอนเที่ยงคืนของไทย
const TZ_OFFSET = 7 * 3_600_000;
const DAY = 864e5;
const TOP = 100;

const toId = (v: ObjectId | string) =>
  typeof v === "string" && ObjectId.isValid(v) ? new ObjectId(v) : v;

type Row = { _id: ObjectId | string; total: number; rounds: number };
type UserDoc = {
  _id: ObjectId | string;
  nickname?: string;
  avatarUrl?: string | null;
  companyId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
};

type Org = { company: string | null; department: string | null };

// บริษัท + แผนก ของผู้ใช้ (คนหน้าร้านไม่มีแผนก ใช้ชื่อสาขาแทน)
// แปลง id ที่อาจเก็บเป็น string ใน DB ให้เป็นตัวเลข (ว่าง = null)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function orgInfo(u: UserDoc): Org {
  try {
    const departmentId = num(u.departmentId);
    const branchId = num(u.branchId);
    const branch = getBranch(branchId);
    // ไม่มี companyId ใน user → หาบริษัทจากแผนกหรือสาขาแทน (ทั้งคู่ผูกกับบริษัทอยู่แล้ว)
    const companyId =
      num(u.companyId) ??
      getDepartment(departmentId)?.companyId ??
      branch?.companyId ??
      null;
    const org = orgOf({ companyId, departmentId, branchId });
    return {
      company: org.company || null,
      department: org.department || (branch ? branchLabel(branch) : null),
    };
  } catch {
    return { company: null, department: null };
  }
}

export async function GET() {
  await connection();
  try {
    const now = Date.now();
    const start = Math.floor((now + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;
    // ต้องตรงกับ key ที่ /api/sessions ใช้บันทึก goal_hits (YYYY-MM-DD เวลาไทย)
    const dayStr = new Date(start + TZ_OFFSET).toISOString().slice(0, 10);

    const user = await currentUser();
    const myId = user ? String(user.id) : null;

    const db = await getDb();

    // ลบข้อมูลของบัญชีที่ไม่มีอยู่แล้วออกจากฐานข้อมูลจริง (รันไม่เกิน 1 ครั้ง/นาที)
    await purgeOrphansThrottled(db);

    const rawRows = (await db
      .collection("jumps")
      .aggregate([
        { $match: { ts: { $gte: start, $lt: start + DAY } } },
        {
          $group: {
            _id: "$userId",
            total: { $sum: "$total" },
            rounds: { $sum: 1 },
            first: { $min: "$ts" },
          },
        },
        // แต้มเท่ากัน ใครถึงก่อนได้อันดับก่อน
        { $sort: { total: -1, first: 1 } },
      ])
      .toArray()) as Row[];

    // กันไว้อีกชั้น: ตัดบัญชีที่ไม่มีใน users ออกจากอันดับ
    // (กรณีรอบ purge ยังไม่ถึงเวลา)
    const existing = await db
      .collection<UserDoc>("users")
      .find({ _id: { $in: rawRows.map((r) => toId(r._id)) } })
      .project({
        _id: 1,
        nickname: 1,
        avatarUrl: 1,
        companyId: 1,
        departmentId: 1,
        branchId: 1,
      })
      .toArray();
    const names = new Map(
      existing.map((u) => [String(u._id), u.nickname as string])
    );
    // รูปโปรไฟล์ของแต่ละคน (ไม่มี = null แล้วฝั่งหน้าเว็บแสดงตัวอักษรแรกแทน)
    const avatars = new Map(
      existing.map((u) => [
        String(u._id),
        (u.avatarUrl as string | null | undefined) ?? null,
      ])
    );
    // บริษัท / แผนก ของแต่ละคน (แสดงใต้ชื่อในหน้าอันดับ)
    const orgs = new Map(
      existing.map((u) => [String(u._id), orgInfo(u as UserDoc)])
    );
    // คนที่ถูกแบนในวันนี้ถูกตัดคะแนนทั้งวัน ซ่อนจากอันดับเหมือนไม่ได้เล่น
    const voided = await voidedUsersOfDay(db, dayStr);
    const rows = rawRows.filter(
      (r) => names.has(String(r._id)) && !voided.has(String(r._id))
    );

    const top = rows.slice(0, TOP);

    // ลำดับที่ทำเป้าหมายรายวันสำเร็จของแต่ละคนในวันนี้ (1 = คนแรก)
    // userId ใน goal_hits ชนิดเดียวกับใน jumps (ใช้ user.id ตรงๆ เหมือนกัน)
    const allHits = await db
      .collection("goal_hits")
      .find({ day: dayStr })
      .project({ userId: 1, seq: 1 })
      .sort({ seq: 1 })
      .toArray();
    const seqOf = new Map<string, number>();
    let hitN = 0;
    for (const h of allHits) {
      if (voided.has(String(h.userId))) continue;
      hitN += 1;
      seqOf.set(String(h.userId), hitN);
    }

    // เป้าหมายรายวัน (เท่ากันทุกคน เปลี่ยนตามสัปดาห์ ดู app/components/goal.ts)
    // ใช้วาดหลอดความคืบหน้า ต้องตรงกับเป้าที่ /api/sessions ใช้ตัดสิน point
    const goal = goalOfDate(dayStr);

    const entries = top.map((r, i) => {
      const org = orgs.get(String(r._id));
      return {
        rank: i + 1,
        name: names.get(String(r._id)) ?? "ไม่ระบุชื่อ",
        avatarUrl: avatars.get(String(r._id)) ?? null,
        company: org?.company ?? null,
        department: org?.department ?? null,
        total: r.total,
        rounds: r.rounds,
        me: String(r._id) === myId,
        goalRank: seqOf.get(String(r._id)) ?? null,
        goal,
      };
    });

    // point รวมของผู้ใช้ที่ล็อกอิน (เก็บใน users.points)
    const myPoints = user ? await getUserPoints(user.id) : 0;

    const idx = myId ? rows.findIndex((r) => String(r._id) === myId) : -1;
    const me =
      idx >= 0
        ? {
            rank: idx + 1,
            total: rows[idx].total,
            // ต้องโดดอีกกี่ครั้งถึงจะแซงคนอันดับถัดขึ้นไป
            gap: idx > 0 ? rows[idx - 1].total - rows[idx].total + 1 : 0,
            points: myPoints,
          }
        : null;

    return NextResponse.json(
      { entries, me, count: rows.length, resetAt: start + DAY },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("leaderboard GET failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}