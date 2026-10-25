import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// Tenant isolation (docs/02 §1.1).
//  1. tenantDb(tenantId): Prisma client extension that adds tenantId to where/data of every tenant model.
//  2. withTenantTx(tenantId, fn): interactive transaction with `app.tenant_id` set transaction-local
//     (set_config(…, true) — works behind PgBouncer in transaction mode). Required for the RLS tables
//     (credential, browser_session, recording, run, run_step, run_artifact, run_log): outside it they
//     return 0 rows (fail-closed).
//  3. withPlatformTx(fn): `app.platform = on` for the scheduler / platform admin paths.

/** Every model with a non-null tenantId (kept in sync by tests/tenant-models.test.ts). */
export const TENANT_MODELS = new Set<string>([
  "Membership", "ApiKey", "Payment", "AiTokenLedger", "AiTokenRequest", "TargetSystem", "Credential", "BrowserSession",
  "Recording", "Workflow", "WorkflowVersion", "MethodCollection", "Method", "Job", "Run", "RunStep", "RunArtifact", "RunLog",
  "WebhookEndpoint", "WebhookDelivery", "RunCreditLedger", "RunCreditRequest", "UsageDaily", "Notification", "SystemDoc",
  "WorkflowLayout", "ImportMapping", "ValueMap", "FileObject", "RunFile", "Incident", "StepBaseline", "OptionCatalog",
  "Destination", "DestinationDelivery", "ExtractSnapshot",
]);

/** Models protected by RLS in the database: use withTenantTx for these. */
export const RLS_MODELS = new Set<string>(["Credential", "BrowserSession", "Recording", "Run", "RunStep", "RunArtifact", "RunLog"]);

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: Record<string, unknown> };

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

/** Pure: scopes the args of one operation to a tenant. Exported for unit tests. */
export function scopeArgs(operation: string, args: Args | undefined, tenantId: string): Args {
  const a: Args = { ...(args ?? {}) };
  if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), tenantId };
  if (CREATE_OPS.has(operation)) {
    const withTenant = (d: unknown) => ({ ...(d as Record<string, unknown>), tenantId });
    a.data = Array.isArray(a.data) ? a.data.map(withTenant) : withTenant(a.data);
  }
  if (operation === "upsert") {
    a.where = { ...(a.where ?? {}), tenantId };
    a.create = { ...(a.create ?? {}), tenantId };
  }
  if ((operation === "update" || operation === "updateMany" || operation === "upsert") && a.data && typeof a.data === "object" && "tenantId" in (a.data as object)) {
    throw new Error("tenantDb: tenantId cannot be changed");
  }
  return a;
}

function scoped<C extends { $extends: (typeof prisma)["$extends"] }>(client: C, tenantId: string) {
  if (!tenantId) throw new Error("tenantDb: tenantId is required");
  return client.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(operation, args as Args, tenantId) as typeof args);
        },
      },
    },
  });
}

export function tenantDb(tenantId: string) {
  return scoped(prisma, tenantId);
}

export type TenantTx = Prisma.TransactionClient;

export async function withTenantTx<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>, opts?: { timeout?: number }): Promise<T> {
  if (!tenantId) throw new Error("withTenantTx: tenantId is required");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    { timeout: opts?.timeout ?? 15_000 },
  );
}

export async function withPlatformTx<T>(fn: (tx: TenantTx) => Promise<T>, opts?: { timeout?: number }): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`select set_config('app.platform', 'on', true)`;
      return fn(tx);
    },
    { timeout: opts?.timeout ?? 60_000 },
  );
}
