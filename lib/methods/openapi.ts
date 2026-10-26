import "server-only";
import { tenantDb } from "@/lib/tenant-db";

// OpenAPI 3.1 of a collection (docs/07 §3): resource-style paths, schemas from the pinned versions.

const PROBLEM = { $ref: "#/components/schemas/Problem" };

export async function collectionOpenApi(tenantId: string, slug: string, baseUrl: string) {
  const db = tenantDb(tenantId);
  const col = await db.methodCollection.findFirst({ where: { slug } });
  if (!col) return null;
  const methods = await db.method.findMany({ where: { collectionId: col.id, isActive: true }, include: { workflowVersion: { select: { versionNo: true, inputSchema: true, outputSchema: true } } }, orderBy: { name: "asc" } });
  const paths: Record<string, Record<string, unknown>> = {};
  for (const m of methods) {
    const path = `/${col.slug}/${m.resource ?? m.slug}`;
    const http = m.httpMethod.toLowerCase();
    const input = m.workflowVersion.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    const isQuery = http === "get" || http === "delete";
    paths[path] ??= {};
    paths[path][http] = {
      operationId: m.slug,
      summary: m.name,
      description: `${m.summary ?? ""}\n\nΕκτελεί τη ροή «${m.name}» (v${m.workflowVersion.versionNo}). \`?mode=sync\` περιμένει το αποτέλεσμα έως ${m.syncTimeoutSec}″, αλλιώς 202 με το id της εκτέλεσης.`.trim(),
      ...(isQuery
        ? {}
        : { requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { input, externalRef: { type: "string" }, mode: { enum: ["sync", "async"] }, callbackUrl: { type: "string", format: "uri" } }, required: ["input"] } } } } }),
      parameters: [
        ...(isQuery ? Object.entries(input.properties ?? {}).map(([name, schema]) => ({ name, in: "query", required: (input.required ?? []).includes(name), schema })) : []),
        { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Ολοκληρώθηκε (sync)", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, status: { const: "SUCCEEDED" }, output: m.workflowVersion.outputSchema } } } } },
        "202": { description: "Σε ουρά — παρακολουθήστε το GET /runs/{id}", content: { "application/json": { schema: { $ref: "#/components/schemas/RunRef" } } } },
        "401": { description: "API key", content: { "application/problem+json": { schema: PROBLEM } } },
        "422": { description: "Μη έγκυρη είσοδος ή αποτυχία στο σύστημα", content: { "application/problem+json": { schema: PROBLEM } } },
        "429": { description: "Όριο αιτημάτων / υπόλοιπο εκτελέσεων", content: { "application/problem+json": { schema: PROBLEM } } },
      },
      security: [{ bearer: [] }],
    };
  }
  paths["/runs/{id}"] = {
    get: { operationId: "getRun", summary: "Κατάσταση και αποτέλεσμα εκτέλεσης", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Εκτέλεση", content: { "application/json": { schema: { $ref: "#/components/schemas/Run" } } } } }, security: [{ bearer: [] }] },
  };
  return {
    openapi: "3.1.0",
    info: { title: `DG Complete · ${col.name}`, version: "1", description: col.description ?? undefined },
    servers: [{ url: `${baseUrl}/api/v1` }],
    paths,
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "API key dgc_… (Ρυθμίσεις → Κλειδιά API)" } },
      schemas: {
        RunRef: { type: "object", properties: { id: { type: "string" }, status: { type: "string" }, method: { type: "string" }, links: { type: "object" } } },
        Run: { type: "object", properties: { id: { type: "string" }, status: { enum: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "RETRY_SCHEDULED", "NEEDS_ATTENTION", "CANCELLED", "HELD"] }, output: { type: "object" }, error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, targetMessage: { type: "string" } } }, durationMs: { type: "integer" } } },
        Problem: { type: "object", properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, detail: { type: "string" }, code: { type: "string" }, errors: { type: "array" } } },
      },
    },
  };
}
