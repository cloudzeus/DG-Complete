import "server-only";
import { createHash } from "node:crypto";
import { problem, requireScope, apiJson, type ApiContext } from "@/lib/api-v1";
import { createRun, RunError } from "@/lib/runs/create";
import { tenantDb, withTenantTx } from "@/lib/tenant-db";

// Resource-style call of a method (docs/07 §3, docs/24 §5): input from the JSON body (POST/PATCH/PUT)
// or the query string (GET/DELETE), Idempotency-Key, sync wait or 202 with the run id.

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; enum?: string[] };
const RESERVED = new Set(["mode", "externalRef", "callbackUrl"]);
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "NEEDS_ATTENTION", "HELD"]);

export function runBody(r: { id: string; status: string; output: unknown; errorCode: string | null; errorMessage: string | null; targetMessage: string | null; durationMs: number | null; queuedAt: Date; finishedAt: Date | null; externalRef: string | null }) {
  return {
    id: r.id,
    status: r.status,
    externalRef: r.externalRef,
    queuedAt: r.queuedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: r.durationMs,
    output: r.output ?? null,
    error: r.errorCode ? { code: r.errorCode, message: r.errorMessage, targetMessage: r.targetMessage } : null,
    links: { self: `/api/v1/runs/${r.id}` },
  };
}

function validateInput(schema: JsonSchema, input: Record<string, unknown>) {
  const errors: { field: string; message: string }[] = [];
  for (const k of schema.required ?? []) {
    const v = input[k];
    if (v === undefined || v === null || v === "") errors.push({ field: k, message: "Υποχρεωτικό πεδίο" });
  }
  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    const v = input[k];
    if (v === undefined || v === null) continue;
    if (p.type === "array" && !Array.isArray(v)) errors.push({ field: k, message: "Αναμένεται λίστα (JSON array)" });
    if (p.enum && typeof v === "string" && !p.enum.includes(v)) errors.push({ field: k, message: `Επιτρεπτές τιμές: ${p.enum.slice(0, 20).join(", ")}` });
  }
  return errors;
}

export async function invokeMethod(req: Request, ctx: ApiContext, collectionSlug: string, resource: string) {
  requireScope(ctx, "runs:write");
  const db = tenantDb(ctx.tenantId);
  const col = await db.methodCollection.findFirst({ where: { slug: collectionSlug, isActive: true } });
  if (!col || (ctx.collectionIds.length && !ctx.collectionIds.includes(col.id))) return problem(404, `Η συλλογή «${collectionSlug}» δεν βρέθηκε.`);
  const http = req.method === "PUT" ? "PATCH" : req.method;
  const method = await db.method.findFirst({
    where: { collectionId: col.id, OR: [{ resource }, { slug: resource }], httpMethod: http, isActive: true },
    include: { workflowVersion: { select: { id: true, versionNo: true, inputSchema: true } } },
  });
  if (!method) {
    const other = await db.method.findMany({ where: { collectionId: col.id, OR: [{ resource }, { slug: resource }] }, select: { httpMethod: true } });
    if (other.length) return problem(405, `Ο πόρος «${resource}» δέχεται: ${[...new Set(other.map((o) => o.httpMethod))].join(", ")}.`);
    return problem(404, `Η μέθοδος «${collectionSlug}/${resource}» δεν βρέθηκε.`);
  }

  const url = new URL(req.url);
  let raw: Record<string, unknown> = {};
  if (http === "GET" || http === "DELETE") raw = Object.fromEntries(url.searchParams.entries());
  else {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return problem(400, "Το σώμα πρέπει να είναι JSON αντικείμενο.");
    raw = body;
  }
  const input = (raw.input && typeof raw.input === "object" ? raw.input : Object.fromEntries(Object.entries(raw).filter(([k]) => !RESERVED.has(k)))) as Record<string, unknown>;
  const mode = (raw.mode ?? url.searchParams.get("mode") ?? (method.defaultMode === "SYNC" ? "sync" : "async")) === "sync" ? "sync" : "async";
  const errors = validateInput(method.workflowVersion.inputSchema as JsonSchema, input);
  if (errors.length) return problem(422, "Μη έγκυρη είσοδος.", { code: "E_INPUT_VALIDATION", errors });

  // Idempotency: same key + same body → the same run; same key + different body → 409.
  const idem = req.headers.get("idempotency-key")?.slice(0, 200) || null;
  const requestHash = createHash("sha256").update(JSON.stringify({ m: method.id, input })).digest("hex");
  if (idem) {
    const prev = await withTenantTx(ctx.tenantId, (tx) => tx.run.findFirst({ where: { tenantId: ctx.tenantId, idempotencyKey: idem } }));
    if (prev) {
      if (prev.requestHash && prev.requestHash !== requestHash) return problem(409, "Το Idempotency-Key χρησιμοποιήθηκε ήδη με διαφορετικό αίτημα.");
      return apiJson(runBody(prev), TERMINAL.has(prev.status) ? 200 : 202);
    }
  }

  let runId: string;
  try {
    const run = await createRun({
      tenantId: ctx.tenantId,
      workflowVersionId: method.workflowVersion.id,
      methodId: method.id,
      input,
      trigger: "API",
      externalRef: typeof raw.externalRef === "string" ? raw.externalRef.slice(0, 200) : null,
      idempotencyKey: idem,
      apiKeyId: ctx.keyId,
      callbackUrl: typeof raw.callbackUrl === "string" ? raw.callbackUrl.slice(0, 1000) : null,
    });
    runId = run.id;
    await withTenantTx(ctx.tenantId, (tx) => tx.run.update({ where: { id: runId }, data: { requestHash } }));
  } catch (err) {
    if (err instanceof RunError) {
      const status = err.code === "E_QUOTA_EXCEEDED" ? 429 : err.code === "E_METHOD_PAUSED" ? 503 : 409;
      return problem(status, err.message, { code: err.code });
    }
    throw err;
  }

  const load = () => withTenantTx(ctx.tenantId, (tx) => tx.run.findUniqueOrThrow({ where: { id: runId } }));
  if (mode === "sync") {
    const deadline = Date.now() + Math.min(method.syncTimeoutSec, 120) * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      const r = await load();
      if (!TERMINAL.has(r.status)) continue;
      if (r.status === "SUCCEEDED") return apiJson(runBody(r), 200);
      return problem(r.status === "FAILED" ? 422 : 409, r.errorMessage ?? "Η εκτέλεση δεν ολοκληρώθηκε.", { code: r.errorCode, targetMessage: r.targetMessage, run: runBody(r) });
    }
  }
  const r = await load();
  return new Response(JSON.stringify({ ...runBody(r), method: `${col.slug}/${method.resource ?? method.slug}`, version: method.workflowVersion.versionNo }), {
    status: 202,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Location: `/api/v1/runs/${runId}` },
  });
}
