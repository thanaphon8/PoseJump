import { NextResponse, connection } from "next/server";
import { getDb } from "../../../lib/mongodb";
import { currentUser } from "../../../lib/auth";
import { getUserPoints } from "../../../lib/points";
import { purgeOrphansThrottled } from "../../../lib/purge-orphans";
import {
  DAY,
  getDayRanking,
  toId,
  type UserDoc,
} from "../../../lib/leaderboard-top";
// แปลง companyId / departmentId / branchId เป็นชื่อ (ตัวเดียวกับที่หน้าตั้งค่าใช้)
// ถ้า path ไม่ตรงโครงสร้างโปรเจกต์ ให้แก้บรรทัดนี้ให้ชี้ไปที่ branches.ts
import { orgOf, getBranch, branchLabel } from "../../components/branches";
import { getDepartment } from "../../components/departments";
import { goalOfDate } from "../../components/goal";

// "วันนี้" นับเป็นวันเกมตามเวลาไทย (UTC+7) อันดับจึงรีเซ็ตตอน 06:00 น. ของไทย
// (ดูตัวช่วย gameDayStart / gameDayKey และ RESET_HOUR ใน app/components/goal.ts)
// การคำนวณอันดับอยู่ใน lib/leaderboard-top.ts (ใช้ร่วมกับ /api/leaderboard/note)
const TOP = 100;
// โน๊ตบนแท่นยืน: แสดงเฉพาะ 3 อันดับแรก
const PODIUM = 3;

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
    const user = await currentUser();
    const myId = user ? String(user.id) : null;

    const db = await getDb();

    // ลบข้อมูลของบัญชีที่ไม่มีอยู่แล้วออกจากฐานข้อมูลจริง (รันไม่เกิน 1 ครั้ง/นาที)
    await purgeOrphansThrottled(db);

    const { start, dayStr, rows, users, voided } = await getDayRanking(db);

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

    // โน๊ตของ 3 อันดับแรกที่ยังไม่หมดอายุ (เก็บใน rank_notes แยกจากโน๊ตแผนก)
    // (TTL index ลบแถวเก่าให้เอง แต่ monitor ช้าได้ ~60 วินาที จึงกรอง expiresAt ซ้ำที่นี่)
    const podiumIds = top.slice(0, PODIUM).map((r) => toId(r._id));
    const noteDocs =
      podiumIds.length > 0
        ? await db
            .collection("rank_notes")
            .find(
              { userId: { $in: podiumIds }, expiresAt: { $gt: new Date() } },
              { projection: { userId: 1, text: 1, style: 1, expiresAt: 1 } }
            )
            .toArray()
        : [];
    const noteByUser = new Map(
      noteDocs.map((n) => [
        String(n.userId),
        {
          text: n.text as string,
          // โน๊ตเก่าที่ไม่มี style = กรอบธรรมดา
          style: (n.style as string) ?? "none",
          expiresAt: (n.expiresAt as Date).toISOString(),
        },
      ])
    );

    const entries = top.map((r, i) => {
      const u = users.get(String(r._id));
      const org = u ? orgInfo(u) : undefined;
      return {
        rank: i + 1,
        name: u?.nickname ?? "ไม่ระบุชื่อ",
        // รูปโปรไฟล์ของแต่ละคน (ไม่มี = null แล้วฝั่งหน้าเว็บแสดงตัวอักษรแรกแทน)
        avatarUrl: u?.avatarUrl ?? null,
        // บริษัท / แผนก ของแต่ละคน (แสดงใต้ชื่อในหน้าอันดับ)
        company: org?.company ?? null,
        department: org?.department ?? null,
        total: r.total,
        rounds: r.rounds,
        me: String(r._id) === myId,
        goalRank: seqOf.get(String(r._id)) ?? null,
        goal,
        // อันดับ 4 ขึ้นไป = null เสมอ
        note: i < PODIUM ? (noteByUser.get(String(r._id)) ?? null) : null,
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