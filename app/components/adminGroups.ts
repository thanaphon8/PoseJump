// รวมผู้เล่นเป็นกลุ่ม (แผนก/สาขา) สำหรับหน้าแอดมิน ไม่มี UI
// สำนักงานใหญ่ = 1 แผนก / หน้าร้าน = 1 สาขา

export type Sort = "points" | "total";

export type GroupMember = {
  userId: string;
  name: string;
  username: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  total: number;
};

export type GroupRow = {
  key: string;
  rank: number;
  name: string;
  company: string | null;
  kind: "dept" | "branch" | null;
  sub: string;
  players: number;
  total: number; // ยอดโดดของช่วงที่เลือก (รวมเฉพาะคนที่โดดในช่วงนั้น)
  points: number;
  cum: number; // ยอดสะสมทั้งหมดของกลุ่ม (ตรงหน้าผู้ใช้) 0 ถ้าไม่ได้ส่ง cum มา
  members: GroupMember[]; // เรียงโดดมาก → น้อย
};

// โครงสังกัดขั้นต่ำที่ต้องใช้ (OrgInfo ในหน้า admin ใช้ได้เลย)
type OrgLike = {
  company: string | null;
  workplace: string | null;
  branchCode: string | null;
  province: string | null;
  groupKey: string | null;
  groupName: string | null;
};

type PlayerRow = {
  userId: string;
  name: string;
  username: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  total: number;
  points: number;
  org?: OrgLike | null;
};

// cum = ยอดสะสมรายกลุ่ม ถ้าส่งมา sort "points" จะเรียงตามยอดสะสม (เหมือนหน้าผู้ใช้)
// ไม่ส่ง = เรียงตาม point ของช่วงนั้น
export function buildGroups(
  rows: PlayerRow[],
  sort: Sort,
  cum?: Record<string, number>
): GroupRow[] {
  const m = new Map<string, Omit<GroupRow, "rank">>();
  for (const e of rows) {
    const o = e.org ?? undefined;
    const key = o?.groupKey ?? "none";
    const g = m.get(key) ?? {
      key,
      name: o?.groupName ?? "ไม่ระบุสังกัด",
      company: o?.company ?? null,
      kind: !o?.groupKey
        ? null
        : o.workplace === "หน้าร้าน"
          ? ("branch" as const)
          : ("dept" as const),
      sub: o?.groupKey
        ? [o.company, o.workplace, o.branchCode ? `ID ${o.branchCode}` : null, o.province]
            .filter(Boolean)
            .join(" · ")
        : "",
      players: 0,
      total: 0,
      points: 0,
      cum: cum?.[key] ?? 0,
      members: [],
    };
    g.players += 1;
    g.total += e.total;
    g.points += e.points;
    g.members.push({
      userId: e.userId,
      name: e.name,
      username: e.username,
      employeeId: e.employeeId,
      avatarUrl: e.avatarUrl,
      total: e.total,
    });
    m.set(key, g);
  }
  const main = (g: Omit<GroupRow, "rank">) => (cum ? g.cum : g.points);
  return [...m.values()]
    .map((g) => ({
      ...g,
      members: [...g.members].sort((a, b) => b.total - a.total),
    }))
    .sort(
      sort === "total"
        ? (a, b) => b.total - a.total || main(b) - main(a)
        : (a, b) => main(b) - main(a) || b.total - a.total
    )
    .map((g, i) => ({ ...g, rank: i + 1 }));
}

export const matchesGroup = (q: string, g: GroupRow) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return `${g.name} ${g.sub}`.toLowerCase().includes(s);
};

// ค้นหาในหน้าแผนก:
// - ชื่อกลุ่ม/สังกัดตรง = แสดงทั้งกลุ่ม สมาชิกครบ
// - ไม่ตรง แต่มีสมาชิกตรง (ชื่อ / username / รหัสพนักงาน) = แสดงกลุ่มนั้น เฉพาะคนที่ตรง
// - ไม่ตรงเลย = null
export const filterGroupByQuery = (
  q: string,
  g: GroupRow
): GroupRow | null => {
  const s = q.trim().toLowerCase();
  if (!s) return g;
  if (`${g.name} ${g.sub}`.toLowerCase().includes(s)) return g;
  const hit = g.members.filter(
    (m) =>
      m.name.toLowerCase().includes(s) ||
      m.username.toLowerCase().includes(s) ||
      (m.employeeId ?? "").toLowerCase().includes(s)
  );
  return hit.length > 0 ? { ...g, members: hit } : null;
};