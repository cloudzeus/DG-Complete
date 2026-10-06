import "server-only";
import { getCubeDeployment, openCubeSecrets, signCubeToken } from "@/lib/cube";
import { tenantAccess } from "@/lib/tenant-services";

// What Κίμων can query: the tenant's Cube model, read from /meta (so it always matches the deployed
// model) and condensed into a compact text catalog for the system prompt. Cached per tenant.

type MetaMember = { name: string; title?: string; shortTitle?: string; type: string; description?: string; public?: boolean };
type MetaCube = { name: string; title?: string; description?: string; measures: MetaMember[]; dimensions: MetaMember[] };

export type KimonCatalog = { text: string; members: Set<string>; types: Map<string, string> };

const cache = new Map<string, { at: number; catalog: KimonCatalog }>();
const TTL = 10 * 60_000;

const short = (name: string) => name.slice(name.indexOf(".") + 1);
const oneLine = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim();

function describe(m: MetaMember) {
  const d = oneLine(m.description);
  return `${short(m.name)} (${m.type})${d ? ` — ${d}` : ""}`;
}

export type MetaField = { name: string; title: string; type: string; description: string | null; kind: "measure" | "dimension" };
export type MetaCubeInfo = { name: string; title: string; description: string | null; fields: MetaField[] };

const metaCache = new Map<string, { at: number; cubes: MetaCubeInfo[] }>();

/** The tenant's Cube model with titles (report builder): only the cubes of its plan. Cached 10'. */
export async function tenantCubeMeta(tenantId: string): Promise<MetaCubeInfo[]> {
  const hit = metaCache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL) return hit.cubes;
  const deployment = await getCubeDeployment();
  if (!deployment) throw new Error("Ο Cube server δεν έχει ρυθμιστεί.");
  const access = await tenantAccess(tenantId);
  const token = signCubeToken(openCubeSecrets(deployment.secretsEnc), deployment.apiUrl, { tenantId, modules: access.cubes });
  const res = await fetch(`${deployment.apiUrl.replace(/\/+$/, "")}/cubejs-api/v1/meta`, { headers: { Authorization: token }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Cube meta HTTP ${res.status}`);
  const raw = (((await res.json()) as { cubes?: MetaCube[] }).cubes ?? []).filter((c) => !access.cubes || access.cubes.includes(c.name));
  const field = (m: MetaMember, kind: MetaField["kind"]): MetaField => ({
    name: m.name,
    title: m.shortTitle || m.title || short(m.name),
    type: m.type,
    description: m.description ? oneLine(m.description) : null,
    kind,
  });
  const cubes = raw.map((c) => ({
    name: c.name,
    title: c.title ?? c.name,
    description: c.description ? oneLine(c.description) : null,
    fields: [...c.measures.filter((m) => m.public !== false).map((m) => field(m, "measure")), ...c.dimensions.filter((m) => m.public !== false).map((m) => field(m, "dimension"))],
  }));
  metaCache.set(tenantId, { at: Date.now(), cubes });
  return cubes;
}

export async function kimonCatalog(tenantId: string): Promise<KimonCatalog> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL) return hit.catalog;

  const deployment = await getCubeDeployment();
  if (!deployment) throw new Error("Ο Cube server δεν έχει ρυθμιστεί.");
  const access = await tenantAccess(tenantId);
  const token = signCubeToken(openCubeSecrets(deployment.secretsEnc), deployment.apiUrl, { tenantId, modules: access.cubes });
  const res = await fetch(`${deployment.apiUrl.replace(/\/+$/, "")}/cubejs-api/v1/meta`, {
    headers: { Authorization: token },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Cube meta HTTP ${res.status}`);
  // Only the cubes of the tenant's plan: Κίμων never even sees the rest.
  const cubes = (((await res.json()) as { cubes?: MetaCube[] }).cubes ?? []).filter((c) => !access.cubes || access.cubes.includes(c.name));
  if (cubes.length === 0) throw new Error("Το μοντέλο δεδομένων δεν είναι διαθέσιμο αυτή τη στιγμή.");

  const members = new Set<string>();
  const types = new Map<string, string>();
  const blocks = cubes.map((c) => {
    const measures = c.measures.filter((m) => m.public !== false);
    const dimensions = c.dimensions.filter((m) => m.public !== false);
    for (const m of [...measures, ...dimensions]) {
      members.add(m.name);
      types.set(m.name, m.type);
    }
    return [
      `### ${c.name}${c.description ? ` — ${oneLine(c.description)}` : ""}`,
      `measures: ${measures.map(describe).join("; ")}`,
      `dimensions: ${dimensions.map(describe).join("; ")}`,
    ].join("\n");
  });

  const catalog = { text: blocks.join("\n\n"), members, types };
  cache.set(tenantId, { at: Date.now(), catalog });
  return catalog;
}
