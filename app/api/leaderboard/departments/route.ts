import { NextResponse, connection } from "next/server";
import type { ObjectId } from "mongodb";
import { currentUser } from "../../../../lib/auth";
import { getDb } from "../../../../lib/mongodb";
import { DEPARTMENTS, getCompany } from "../../../components/departments";
import { branchLabel, getBranch } from "../../../components/branches";
import { voidedDeptFilter } from "../../../../lib/bans";

const PAGE_SIZE = 35; // จำนวนกลุ่ม (แผนก/สาขา) ต่อหน้า
const MEMBERS_PER_GROUP = 100; // จำกัดสมาชิกที่ส่งต่อกลุ่ม (กัน response ใหญ่)

type Member = {
  name: string;
  username: string;
  avatarUrl: string | null;
  isMe: boolean;
};

type Kind = "dept" | "branch";

// 1 กลุ่ม = แผนกของสำนักงานใหญ่ หรือ 1 สาขาของหน้าร้าน
// key กันชนกันระหว่าง id แผนกกับ id สาขา เช่น "d:3" / "b:3"
// ถ้ามีทั้งสองอย่าง (ข้อมูลเก่า) ให้นับเป็นแผนกก่อน
function groupOf(
  d: number | null | undefined,
  b: number | null | undefined
): { key: string; kind: Kind; id: number } | null {
  if (d != null) return { key: `d:${d}`, kind: "dept", id: d };
  if (b != null) return { key: `b:${b}`, kind: "branch", id: b };
  return null;
}

const deptById = new Map(DEPARTMENTS.map((d) => [d.id, d]));

// ชื่อกลุ่ม + ชื่อบริษัท (ชื่อแผนก/สาขาซ้ำข้ามบริษัทได้)
function describe(kind: Kind, id: number) {
  if (kind === "dept") {
    const d = deptById.get(id);
    if (!d) return null;
    return { name: d.name, company: getCompany(d.companyId)?.name ?? null };
  }
  const b = getBranch(id);
  if (!b) return null;
  const cid = (b as unknown as { companyId?: number }).companyId;
  return {
    name: branchLabel(b),
    company: cid != null ? (getCompany(cid)?.name ?? null) : null,
  };
}

// GET /api/leaderboard/departments?page=N → อันดับแผนก/สาขาแบบสะสม (ไม่รีเซ็ต) แบ่งหน้าละ PAGE_SIZE
// + สมาชิก (ไว้แสดงรูปซ้อน) เฉพาะกลุ่มในหน้านั้น
// คะแนนมาจาก collection "dept_jumps" (บันทึกโดย /api/sessions) รวมทุกแถวตั้งแต่เริ่มเก็บ
// ใช้ departmentId / branchId ที่บันทึกในแถวคะแนนก่อน ถ้าแถวไม่มีทั้งสองอย่าง
// จะดูจากข้อมูลผู้ใช้ปัจจุบัน (กรณี /api/sessions ยังไม่ได้เก็บ branchId)
export async function GET(req: Request) {
  await connection();
  try {
    const me = await currentUser();
    const meX = me as unknown as {
      departmentId?: number | null;
      branchId?: number | null;
    } | null;
    const db = await getDb();

    // รวมคะแนนทั้งหมด ไม่กรองช่วงเวลา
    // ตัดแถวของคนที่ถูกแบนในวันที่ถูกแบนออก (ไม่นับเข้าแผนก) null = ไม่มีแบน
    const voidFilter = await voidedDeptFilter(db);
    const rows = await db
      .collection("dept_jumps")
      .aggregate<{
        _id: { u: ObjectId; d: number | null; b: number | null };
        total: number;
      }>([
        ...(voidFilter ? [{ $match: voidFilter }] : []),
        {
          $group: {
            _id: { u: "$userId", d: "$departmentId", b: "$branchId" },
            total: { $sum: "$total" },
          },
        },
      ])
      .toArray();

    // แถวที่ไม่มีทั้ง departmentId และ branchId → ไปดูจากผู้ใช้
    const lookup = new Map<string, ObjectId>();
    for (const r of rows) {
      if (r._id.d == null && r._id.b == null)
        lookup.set(String(r._id.u), r._id.u);
    }
    const userGroup = new Map<string, { d: number | null; b: number | null }>();
    if (lookup.size > 0) {
      const found = await db
        .collection("users")
        .find(
          { _id: { $in: [...lookup.values()] } },
          { projection: { departmentId: 1, branchId: 1 } }
        )
        .toArray();
      for (const u of found) {
        userGroup.set(String(u._id), {
          d: (u.departmentId as number | null | undefined) ?? null,
          b: (u.branchId as number | null | undefined) ?? null,
        });
      }
    }

    const sums = new Map<
      string,
      { kind: Kind; id: number; total: number; users: Set<string> }
    >();
    for (const r of rows) {
      let d = r._id.d;
      let b = r._id.b;
      if (d == null && b == null) {
        const g = userGroup.get(String(r._id.u));
        d = g?.d ?? null;
        b = g?.b ?? null;
      }
      const g = groupOf(d, b);
      if (!g) continue;
      const cur = sums.get(g.key) ?? {
        kind: g.kind,
        id: g.id,
        total: 0,
        users: new Set<string>(),
      };
      cur.total += r.total;
      cur.users.add(String(r._id.u));
      sums.set(g.key, cur);
    }

    const myGroup = groupOf(meX?.departmentId, meX?.branchId);
    const myKey = myGroup?.key ?? null;

    const ranked = [...sums.entries()]
      .map(([key, s]) => {
        const info = describe(s.kind, s.id);
        if (!info) return null;
        return {
          key,
          kind: s.kind,
          id: s.id,
          name: info.name,
          // คง en ไว้กันโค้ดฝั่ง UI ที่ยังอ่านอยู่
          en: info.name,
          company: info.company,
          total: s.total,
          active: s.users.size,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.total > 0)
      .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
      .map((d, i) => ({ ...d, rank: i + 1, me: d.key === myKey }));

    // แบ่งหน้า: ranked คำนวณเต็มไว้แล้ว (ให้ me และเลขอันดับถูกต้อง) ตัดเฉพาะตอนส่งออก
    const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
    const rawPage = Number(new URL(req.url).searchParams.get("page"));
    const page = Math.min(
      totalPages,
      Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1)
    );
    const top = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // สมาชิกของกลุ่มที่แสดง (ใช้วาดรูปโปรไฟล์ซ้อน) เฉพาะกลุ่มในหน้านี้
    const deptIds = top.filter((g) => g.kind === "dept").map((g) => g.id);
    const branchIds = top.filter((g) => g.kind === "branch").map((g) => g.id);
    const or: Record<string, unknown>[] = [];
    if (deptIds.length) or.push({ departmentId: { $in: deptIds } });
    if (branchIds.length) or.push({ branchId: { $in: branchIds } });

    const users = or.length
      ? await db
          .collection("users")
          .find(
            { $or: or },
            {
              projection: {
                display: 1,
                username: 1,
                nickname: 1,
                avatarUrl: 1,
                departmentId: 1,
                branchId: 1,
              },
            }
          )
          .sort({ createdAt: 1 })
          .toArray()
      : [];

    const byGroup = new Map<string, Member[]>();
    const countOf = new Map<string, number>();
    for (const u of users) {
      const g = groupOf(
        u.departmentId as number | null | undefined,
        u.branchId as number | null | undefined
      );
      if (!g) continue;
      countOf.set(g.key, (countOf.get(g.key) ?? 0) + 1);
      const list = byGroup.get(g.key) ?? [];
      if (list.length < MEMBERS_PER_GROUP) {
        list.push({
          name: u.nickname as string,
          username: (u.display ?? u.username) as string,
          avatarUrl: (u.avatarUrl as string) || null,
          isMe: !!me && u._id.equals(me.id),
        });
        byGroup.set(g.key, list);
      }
    }
    // ตัวเองขึ้นก่อน แล้วคนที่มีรูปโปรไฟล์ (ให้รูปซ้อนดูสวย) ที่เหลือตามเวลาสมัคร
    for (const list of byGroup.values()) {
      list.sort(
        (a, b) =>
          Number(b.isMe) - Number(a.isMe) ||
          Number(!!b.avatarUrl) - Number(!!a.avatarUrl)
      );
    }

    const entries = top.map((d) => ({
      ...d,
      memberCount: countOf.get(d.key) ?? 0,
      members: byGroup.get(d.key) ?? [],
    }));

    // me คำนวณจากรายการเต็ม: แผนกอันดับ 80 ก็ได้ rank 80 ไม่ว่าอยู่หน้าไหน
    const mine = ranked.find((d) => d.me);
    const myInfo =
      myKey == null
        ? null
        : mine
          ? {
              rank: mine.rank,
              total: mine.total,
              gap:
                mine.rank === 1
                  ? 0
                  : ranked[mine.rank - 2].total - mine.total + 1,
              name: mine.name,
              company: mine.company,
            }
          : { rank: 0, total: 0, gap: 0, name: "", company: null }; // กลุ่มตัวเองยังไม่มีคะแนน

    // สะสมไม่รีเซ็ต จึงไม่มี resetAt
    return NextResponse.json(
      {
        entries,
        me: myInfo,
        count: ranked.length,
        page,
        totalPages,
        pageSize: PAGE_SIZE,
        resetAt: null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("dept leaderboard failed", e);
    return NextResponse.json({ error: "เซิร์ฟเวอร์ผิดพลาด" }, { status: 500 });
  }
}