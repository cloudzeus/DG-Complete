import "server-only";
import { prisma } from "@/lib/prisma";
import { FOREIGN_KEYS } from "@/lib/softone-labels";

export type Lookups = Record<string, Record<string, string>>; // field → (id → display name)

/**
 * Builds id → name maps for the foreign-key fields of a sync job, from the other mirrored tables
 * of the same connection (customers come from s1_customer). Fields without a mirror are omitted.
 */
export async function buildLookups(job: { connectionId: string; table: string; keyField: string; fields: string }): Promise<Lookups> {
  const keyParts = new Set(job.keyField.split(","));
  const fkFields = job.fields
    .split(",")
    .filter((f) => FOREIGN_KEYS[f] && !(keyParts.has(f) && FOREIGN_KEYS[f] === job.table));
  if (!fkFields.length) return {};

  const targets = [...new Set(fkFields.map((f) => FOREIGN_KEYS[f]))];
  const sources = await prisma.syncJob.findMany({
    where: { connectionId: job.connectionId, type: "TABLE", table: { in: targets } },
    select: { id: true, table: true, keyField: true },
  });

  const byTable: Record<string, Record<string, string>> = {};
  for (const src of sources) {
    // Single-column keys only (composite ones can't be addressed by one FK value).
    if (src.keyField.includes(",")) continue;
    const rows = await prisma.$queryRaw<{ key: string; name: string | null }[]>`
      SELECT "key", COALESCE(NULLIF("data"->>'NAME', ''), NULLIF("data"->>'SHORTCUT', ''), "data"->>'CODE') AS "name"
      FROM "s1_record" WHERE "jobId" = ${src.id}`;
    const map = (byTable[src.table] ??= {});
    for (const r of rows) if (r.name) map[r.key] = r.name;
  }
  if (targets.includes("TRDR")) {
    const customers = await prisma.s1Customer.findMany({ where: { connectionId: job.connectionId }, select: { trdr: true, name: true } });
    const map = (byTable.TRDR ??= {});
    for (const c of customers) map[String(c.trdr)] = c.name;
  }

  const out: Lookups = {};
  for (const f of fkFields) if (byTable[FOREIGN_KEYS[f]]) out[f] = byTable[FOREIGN_KEYS[f]];
  return out;
}
