import type { Db, ObjectId } from "mongodb";

// ตัววัดที่รวม: "total" = รวมค่า total ในแถว (จำนวนครั้ง), "rows" = นับจำนวนแถว dept_jumps
type Metric = "total" | "rows";

export async function computeDeptTotals(
  db: Db,
  metric: Metric = "total"
): Promise<Record<string, number>> {
  const rows = await db
    .collection("dept_jumps")
    .aggregate<{
      _id: { u: ObjectId; d: number | null; b: number | null };
      total: number;
    }>([
      {
        $group: {
          _id: { u: "$userId", d: "$departmentId", b: "$branchId" },
          total: metric === "rows" ? { $sum: 1 } : { $sum: "$total" },
        },
      },
    ])
    .toArray();

  // ที่เหลือเหมือนเดิมทุกบรรทัด
  const lookup = new Map<string, ObjectId>();
  for (const r of rows) {
    if (r._id.d == null && r._id.b == null) lookup.set(String(r._id.u), r._id.u);
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

  const out: Record<string, number> = {};
  for (const r of rows) {
    let d = r._id.d;
    let b = r._id.b;
    if (d == null && b == null) {
      const g = userGroup.get(String(r._id.u));
      d = g?.d ?? null;
      b = g?.b ?? null;
    }
    const key = d != null ? `d:${d}` : b != null ? `b:${b}` : null;
    if (!key) continue;
    out[key] = (out[key] ?? 0) + (Number(r.total) || 0);
  }
  return out;
}