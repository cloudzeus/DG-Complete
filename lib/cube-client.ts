import "server-only";
import { getCubeDeployment, openCubeSecrets, signCubeToken } from "@/lib/cube";
import { tenantAccess } from "@/lib/tenant-services";

// Server-side Cube queries for dashboards. Every call is signed for exactly one tenant
// (short-lived JWT), so the tenant's own warehouse role scopes the data inside Cube.

export type CubeQuery = {
  measures?: string[];
  dimensions?: string[];
  timeDimensions?: { dimension: string; granularity?: "day" | "week" | "month" | "quarter" | "year"; dateRange?: string | [string, string] }[];
  filters?: CubeFilter[];
  order?: Record<string, "asc" | "desc"> | [string, "asc" | "desc"][];
  limit?: number;
};

export type CubeFilter =
  | { member: string; operator: string; values?: string[] }
  | { or: CubeFilter[] }
  | { and: CubeFilter[] };

export type CubeRow = Record<string, string | number | null>;

export class CubeError extends Error {}
/** The query touches a cube outside the tenant's plan. */
export class CubeForbiddenError extends CubeError {}

/** Cubes a query reads (measures, dimensions, time dimensions, filters, order). */
export function queryCubes(q: CubeQuery): Set<string> {
  const out = new Set<string>();
  const add = (m?: string) => m && out.add(m.split(".")[0]);
  q.measures?.forEach(add);
  q.dimensions?.forEach(add);
  q.timeDimensions?.forEach((t) => add(t.dimension));
  const walk = (fs?: CubeFilter[]) =>
    fs?.forEach((f) => ("or" in f ? walk(f.or) : "and" in f ? walk(f.and) : add(f.member)));
  walk(q.filters);
  return out;
}

async function connection() {
  const deployment = await getCubeDeployment();
  if (!deployment) throw new CubeError("Ο Cube server δεν έχει ρυθμιστεί.");
  return { apiUrl: deployment.apiUrl.replace(/\/+$/, ""), secrets: openCubeSecrets(deployment.secretsEnc) };
}

/** Runs one Cube query for a tenant; waits through Cube's "Continue wait" (up to ~30s). */
export async function cubeLoad(tenantId: string, query: CubeQuery): Promise<CubeRow[]> {
  const [{ apiUrl, secrets }, access] = await Promise.all([connection(), tenantAccess(tenantId)]);
  if (access.cubes) {
    const blocked = [...queryCubes(query)].filter((c) => !access.cubes!.includes(c));
    if (blocked.length) throw new CubeForbiddenError(`Η υπηρεσία για «${blocked.join(", ")}» δεν περιλαμβάνεται στο πακέτο σας.`);
  }
  const started = Date.now();
  for (;;) {
    const res = await fetch(`${apiUrl}/cubejs-api/v1/load`, {
      method: "POST",
      headers: { Authorization: signCubeToken(secrets, apiUrl, { tenantId, modules: access.cubes }), "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { data?: CubeRow[]; error?: string };
    if (body.error === "Continue wait") {
      if (Date.now() - started > 30_000) throw new CubeError("Το Cube δεν απάντησε εγκαίρως.");
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    if (!res.ok || body.error) throw new CubeError(String(body.error ?? `HTTP ${res.status}`).slice(0, 300));
    return body.data ?? [];
  }
}

/** Several queries in parallel; a failing one yields [] plus its error (dashboards degrade per card). */
export async function cubeLoadAll<K extends string>(
  tenantId: string,
  queries: Record<K, CubeQuery>,
): Promise<{ data: Record<K, CubeRow[]>; errors: string[] }> {
  const keys = Object.keys(queries) as K[];
  const results = await Promise.allSettled(keys.map((k) => cubeLoad(tenantId, queries[k])));
  const data = {} as Record<K, CubeRow[]>;
  const errors: string[] = [];
  results.forEach((r, i) => {
    data[keys[i]] = r.status === "fulfilled" ? r.value : [];
    // Parts outside the plan just stay empty — not an error on a dashboard.
    if (r.status === "rejected" && !(r.reason instanceof CubeForbiddenError)) errors.push((r.reason as Error).message);
  });
  return { data, errors: [...new Set(errors)] };
}

export const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));
