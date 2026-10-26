import "server-only";
import { toInputKey } from "@/lib/dsl/import/chromeRecorder";
import { INTENTS, type Intent } from "@/lib/labels";
import { tenantDb } from "@/lib/tenant-db";

// API methods from workflows (docs/07, docs/24 §5): a published workflow becomes a method of its
// target system's collection — `{HTTP} /api/v1/{collection}/{resource}` with the workflow's input
// and output schemas. Created on the first publish, re-pinned on later ones unless they break the API.

type JsonSchema = { type?: string; title?: string; enum?: string[]; format?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema };

/** «Λίστα πελατών» → "lista-pelaton". */
export function kebab(s: string) {
  return (
    toInputKey(s, new Set())
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .slice(0, 50) || "method"
  );
}

export const httpOf = (intent?: string | null) => (intent && intent in INTENTS ? INTENTS[intent as Intent].http : "POST");

/** New required input or a removed output = the existing API clients would break. */
export function breakingChanges(oldIn: JsonSchema, newIn: JsonSchema, oldOut: JsonSchema, newOut: JsonSchema) {
  const out: string[] = [];
  const oldReq = new Set(oldIn.required ?? []);
  for (const k of newIn.required ?? []) if (!oldReq.has(k)) out.push(`νέα υποχρεωτική είσοδος «${k}»`);
  for (const k of Object.keys(oldOut.properties ?? {})) if (!(newOut.properties ?? {})[k]) out.push(`αφαιρέθηκε η έξοδος «${k}»`);
  return out;
}

export async function ensureMethodForVersion(tenantId: string, versionId: string): Promise<{ methodId: string; created: boolean; upgraded: boolean; breaking: string[] }> {
  const db = tenantDb(tenantId);
  const v = await db.workflowVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { id: true, inputSchema: true, outputSchema: true, workflow: { select: { id: true, name: true, intent: true, resourceSlug: true, targetSystem: { select: { id: true, name: true, slug: true } } } } },
  });
  const wf = v.workflow;
  const target = wf.targetSystem;
  const collection =
    (await db.methodCollection.findFirst({ where: { slug: target.slug } })) ??
    (await db.methodCollection.create({ data: { name: target.name, slug: target.slug, description: `Μέθοδοι του συστήματος ${target.name}` } as never }));

  const existing = await db.method.findFirst({ where: { collectionId: collection.id, workflowVersion: { workflowId: wf.id } }, include: { workflowVersion: { select: { inputSchema: true, outputSchema: true } } } });
  if (existing) {
    if (existing.workflowVersionId === v.id) return { methodId: existing.id, created: false, upgraded: false, breaking: [] };
    const breaking = breakingChanges(existing.workflowVersion.inputSchema as JsonSchema, v.inputSchema as JsonSchema, existing.workflowVersion.outputSchema as JsonSchema, v.outputSchema as JsonSchema);
    if (breaking.length) return { methodId: existing.id, created: false, upgraded: false, breaking };
    await db.method.updateMany({ where: { id: existing.id }, data: { workflowVersionId: v.id } });
    return { methodId: existing.id, created: false, upgraded: true, breaking: [] };
  }

  const http = httpOf(wf.intent);
  let resource = wf.resourceSlug || kebab(wf.name);
  // (collection, resource, http, action) is unique: suffix on a clash.
  for (let n = 2; await db.method.findFirst({ where: { collectionId: collection.id, resource, httpMethod: http, action: null } }); n++) resource = `${wf.resourceSlug || kebab(wf.name)}-${n}`;
  let slug = resource;
  for (let n = 2; await db.method.findFirst({ where: { collectionId: collection.id, slug } }); n++) slug = `${resource}-${n}`;
  const m = await db.method.create({
    data: {
      collectionId: collection.id,
      workflowVersionId: v.id,
      name: wf.name,
      slug,
      resource,
      httpMethod: http,
      // Reads answer in the same request; writes are queued unless the client asks for sync.
      defaultMode: http === "GET" ? "SYNC" : "ASYNC",
      summary: wf.intent && wf.intent in INTENTS ? INTENTS[wf.intent as Intent].hint : undefined,
    } as never,
  });
  return { methodId: m.id, created: true, upgraded: false, breaking: [] };
}

/** Example value for docs from a JSON Schema property. */
export function exampleOf(key: string, p: JsonSchema): unknown {
  const choices = (p.enum ?? []).filter((v) => v && v !== "—" && v !== "-");
  if (choices.length) return choices[0];
  if (p.type === "number" || p.type === "integer") return 1;
  if (p.type === "boolean") return true;
  if (p.type === "array") return [exampleOf("item", p.items ?? { type: "string" }), ...(p.items?.type === "object" ? [exampleOf("item", p.items)] : [])];
  if (p.type === "object") return Object.fromEntries(Object.entries(p.properties ?? {}).map(([k, v]) => [k, exampleOf(k, v)]));
  if (p.format === "date") return "2026-10-26";
  if (/afm/i.test(key)) return "094014201";
  if (/email/i.test(key)) return "info@example.gr";
  return p.title ? `<${p.title}>` : "<τιμή>";
}

export function exampleObject(schema: unknown) {
  const s = (schema ?? {}) as JsonSchema;
  return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, p]) => [k, exampleOf(k, p)]));
}
