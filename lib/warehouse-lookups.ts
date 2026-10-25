import "server-only";
import { readRows } from "@/lib/warehouse-writer";

// id → display name maps for warehouse rows (dimension tables of the same tenant schema).
const DIMENSIONS: Record<string, { table: string; key: string; label: (r: Record<string, unknown>) => string }> = {
  ACNT: { table: "gl_accounts", key: "acnt", label: (r) => [r.code, r.name].filter(Boolean).join(" · ") },
  MTRL: { table: "items", key: "mtrl", label: (r) => String(r.name ?? r.code ?? "") },
  BRANCH: { table: "branches", key: "branch", label: (r) => String(r.name ?? "") },
  SERIES: { table: "series", key: "series", label: (r) => String(r.name ?? r.code ?? "") },
};

export async function buildWarehouseLookups(tenantId: string, targetTable: string, fields: string[]) {
  const out: Record<string, Record<string, string>> = {};
  const wanted = fields.filter((f) => DIMENSIONS[f] || f === "TRDR");
  for (const f of wanted) {
    const dim =
      f === "TRDR"
        ? { table: targetTable === "purchase_docs" ? "suppliers" : "customers", key: "trdr", label: (r: Record<string, unknown>) => String(r.name ?? "") }
        : DIMENSIONS[f];
    if (dim.table === targetTable) continue;
    const { rows } = await readRows(tenantId, dim.table, 20000);
    if (!rows.length) continue;
    out[f] = Object.fromEntries(rows.map((r) => [String(r[dim.key]), dim.label(r)]));
  }
  return out;
}
