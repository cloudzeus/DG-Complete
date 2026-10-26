import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantDb, withTenantTx } from "@/lib/tenant-db";

// Read models of the tenant area. Every query is scoped: tenantDb() for the plain tenant tables,
// withTenantTx() for the RLS tables (runs, steps, artifacts, logs, credentials, recordings).
// Non-tenant tables (user, audit_log, plan) are read with an explicit tenant filter.

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ───────────── Targets ─────────────

export type TargetHealth = "ok" | "degraded" | "down" | "unknown";
const health = (rate: number | null): TargetHealth => (rate === null ? "unknown" : rate >= 95 ? "ok" : rate >= 80 ? "degraded" : "down");

type TargetStat = { targetSystemId: string; ok: number; done: number; last: Date | null };

async function targetStats(tenantId: string, days = 7) {
  const rows = await withTenantTx(tenantId, (tx) =>
    tx.$queryRaw<TargetStat[]>(Prisma.sql`
      SELECT w."targetSystemId",
             count(*) FILTER (WHERE r.status = 'SUCCEEDED')::int AS ok,
             count(*) FILTER (WHERE r.status IN ('SUCCEEDED', 'FAILED'))::int AS done,
             max(r."queuedAt") AS last
      FROM "run" r
      JOIN "workflow_version" v ON v.id = r."workflowVersionId"
      JOIN "workflow" w ON w.id = v."workflowId"
      WHERE r."queuedAt" > now() - make_interval(days => ${days})
      GROUP BY 1`),
  );
  return new Map(rows.map((r) => [r.targetSystemId, r]));
}

export async function listTargets(tenantId: string, q?: string) {
  const db = tenantDb(tenantId);
  const [targets, stats, creds] = await Promise.all([
    db.targetSystem.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { baseUrl: { contains: q } }] } : {},
      orderBy: { name: "asc" },
      include: { _count: { select: { workflows: true } } },
    }),
    targetStats(tenantId),
    withTenantTx(tenantId, (tx) => tx.credential.groupBy({ by: ["targetSystemId"], _count: { _all: true } })),
  ]);
  const credCount = new Map(creds.map((c) => [c.targetSystemId, c._count._all]));
  return targets.map((t) => {
    const s = stats.get(t.id);
    const rate = s && s.done ? (s.ok / s.done) * 100 : null;
    return {
      id: t.id,
      name: t.name,
      baseUrl: t.baseUrl,
      origins: t.allowedOrigins,
      maxConcurrency: t.maxConcurrency,
      errorDetectors: (t.errorDetectors ?? []) as { name?: string; css?: string; kind?: string }[],
      workflows: t._count.workflows,
      credentials: credCount.get(t.id) ?? 0,
      successRate: rate,
      lastRunAt: iso(s?.last),
      health: health(rate),
    };
  });
}

export type TargetRow = Awaited<ReturnType<typeof listTargets>>[number];

export async function getTarget(tenantId: string, id: string) {
  return (await listTargets(tenantId)).find((t) => t.id === id) ?? null;
}

export async function listCredentials(tenantId: string, targetSystemId?: string) {
  const rows = await withTenantTx(tenantId, (tx) =>
    tx.credential.findMany({
      where: targetSystemId ? { targetSystemId } : {},
      orderBy: { label: "asc" },
      select: { id: true, targetSystemId: true, label: true, usernameHint: true, updatedAt: true, lastUsedAt: true, kind: true },
    }),
  );
  return rows.map((c) => ({ id: c.id, targetId: c.targetSystemId, label: c.label, username: c.usernameHint ?? "••••", kind: c.kind, updatedAt: iso(c.updatedAt)!, lastUsedAt: iso(c.lastUsedAt) }));
}

export async function targetOptions(tenantId: string) {
  return (await tenantDb(tenantId).targetSystem.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })).map((t) => ({ value: t.id, label: t.name }));
}

// ───────────── Recordings ─────────────

export async function listRecordings(tenantId: string) {
  const rows = await withTenantTx(tenantId, (tx) =>
    tx.recording.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, status: true, eventCount: true, createdById: true, createdAt: true, workflowId: true, targetSystem: { select: { name: true } } },
    }),
  );
  const users = await userNames(rows.map((r) => r.createdById));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    target: r.targetSystem.name,
    status: r.status,
    steps: r.eventCount,
    workflowId: r.workflowId,
    createdBy: users.get(r.createdById) ?? "—",
    createdAt: iso(r.createdAt)!,
  }));
}

// ───────────── Workflows ─────────────

export type StepDef = { id: string; type: string; label?: string; locator?: unknown; value?: unknown; url?: string; optional?: boolean; steps?: StepDef[]; output?: string; timeoutMs?: number };
export type Definition = { dslVersion?: number; steps?: StepDef[] };

export async function listWorkflows(tenantId: string, opts: { q?: string; status?: string } = {}) {
  const db = tenantDb(tenantId);
  const rows = await db.workflow.findMany({
    where: { archivedAt: null, ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}) },
    orderBy: { updatedAt: "desc" },
    include: {
      targetSystem: { select: { name: true } },
      versions: { orderBy: { versionNo: "desc" }, take: 1, select: { id: true, versionNo: true, status: true, updatedAt: true, createdById: true, _count: { select: { methods: true } } } },
    },
  });
  const users = await userNames(rows.flatMap((w) => w.versions.map((v) => v.createdById)));
  return rows
    .map((w) => {
      const v = w.versions[0];
      return {
        id: w.id,
        name: w.name,
        target: w.targetSystem.name,
        targetId: w.targetSystemId,
        version: v?.versionNo ?? 0,
        status: v?.status ?? "DRAFT",
        methods: v?._count.methods ?? 0,
        updatedAt: iso(v?.updatedAt ?? w.updatedAt)!,
        updatedBy: v ? (users.get(v.createdById) ?? "—") : "—",
      };
    })
    .filter((w) => !opts.status || w.status === opts.status);
}

export async function getWorkflow(tenantId: string, id: string) {
  const db = tenantDb(tenantId);
  const wf = await db.workflow.findUnique({
    where: { id },
    include: { targetSystem: { select: { id: true, name: true } }, versions: { orderBy: { versionNo: "desc" } } },
  });
  if (!wf) return null;
  const latest = wf.versions[0] ?? null;
  const published = wf.versions.find((v) => v.status === "PUBLISHED") ?? null;
  const users = await userNames(wf.versions.flatMap((v) => [v.createdById, v.approvedById ?? ""]));
  const schema = (latest?.inputSchema ?? {}) as { properties?: Record<string, { type?: string; title?: string }>; required?: string[] };
  const outSchema = (latest?.outputSchema ?? {}) as { properties?: Record<string, unknown> };
  return {
    id: wf.id,
    name: wf.name,
    target: wf.targetSystem,
    latest: latest && {
      id: latest.id,
      versionNo: latest.versionNo,
      status: latest.status,
      definition: (latest.definition ?? {}) as Definition,
      updatedAt: iso(latest.updatedAt)!,
      lastTestRunId: latest.lastTestRunId,
    },
    publishedId: published?.id ?? null,
    inputs: Object.entries(schema.properties ?? {}).map(([key, p]) => ({ key, label: p.title ?? key, type: p.type ?? "string", required: (schema.required ?? []).includes(key) })),
    outputs: Object.keys(outSchema.properties ?? {}),
    versions: wf.versions.map((v) => ({
      id: v.id,
      version: v.versionNo,
      status: v.status,
      author: users.get(v.createdById) ?? "—",
      createdAt: iso(v.createdAt)!,
      note: v.changelog ?? v.rejectedReason ?? "",
      checksum: v.checksum ? `${v.checksum.slice(0, 4)}…${v.checksum.slice(-4)}` : "—",
      definition: (v.definition ?? {}) as Definition,
    })),
  };
}

export type WorkflowDetail = NonNullable<Awaited<ReturnType<typeof getWorkflow>>>;

export async function pendingApprovals(tenantId: string) {
  const db = tenantDb(tenantId);
  const rows = await db.workflowVersion.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: { submittedAt: "asc" },
    include: { workflow: { select: { id: true, name: true, targetSystem: { select: { name: true } } } } },
  });
  const users = await userNames(rows.map((r) => r.submittedById ?? r.createdById));
  return Promise.all(
    rows.map(async (v) => {
      const prev = await db.workflowVersion.findFirst({ where: { workflowId: v.workflowId, status: { in: ["PUBLISHED", "DEPRECATED"] } }, orderBy: { versionNo: "desc" }, select: { versionNo: true, definition: true } });
      const test = v.lastTestRunId ? await withTenantTx(tenantId, (tx) => tx.run.findUnique({ where: { id: v.lastTestRunId! }, select: { status: true } })) : null;
      return {
        id: v.id,
        workflowId: v.workflow.id,
        name: v.workflow.name,
        target: v.workflow.targetSystem.name,
        version: v.versionNo,
        status: v.status,
        submittedBy: users.get(v.submittedById ?? v.createdById) ?? "—",
        submittedAt: iso(v.submittedAt ?? v.updatedAt)!,
        note: v.changelog ?? "",
        prevVersion: prev?.versionNo ?? null,
        prevDefinition: (prev?.definition ?? { steps: [] }) as Definition,
        definition: (v.definition ?? {}) as Definition,
        testOk: test?.status === "SUCCEEDED",
        testRunId: v.lastTestRunId,
      };
    }),
  );
}

export async function countPendingApprovals(tenantId: string) {
  return tenantDb(tenantId).workflowVersion.count({ where: { status: "PENDING_APPROVAL" } });
}

// ───────────── Collections & methods ─────────────

async function methodStats(tenantId: string, days = 7) {
  const rows = await withTenantTx(tenantId, (tx) =>
    tx.run.groupBy({ by: ["methodId", "status"], where: { queuedAt: { gt: new Date(Date.now() - days * DAY) }, methodId: { not: null } }, _count: { _all: true } }),
  );
  const out = new Map<string, { calls: number; failed: number; done: number }>();
  for (const r of rows) {
    const m = out.get(r.methodId!) ?? { calls: 0, failed: 0, done: 0 };
    m.calls += r._count._all;
    if (r.status === "FAILED") m.failed += r._count._all;
    if (r.status === "FAILED" || r.status === "SUCCEEDED") m.done += r._count._all;
    out.set(r.methodId!, m);
  }
  return out;
}

export async function listMethods(tenantId: string, collectionId?: string) {
  const db = tenantDb(tenantId);
  const [rows, stats] = await Promise.all([
    db.method.findMany({
      where: collectionId ? { collectionId } : {},
      orderBy: { name: "asc" },
      include: { workflowVersion: { select: { versionNo: true, workflowId: true, workflow: { select: { latestVersionNo: true, name: true } } } } },
    }),
    methodStats(tenantId),
  ]);
  const latestPublished = new Map<string, number>();
  for (const wfId of new Set(rows.map((m) => m.workflowVersion.workflowId))) {
    const v = await db.workflowVersion.findFirst({ where: { workflowId: wfId, status: "PUBLISHED" }, orderBy: { versionNo: "desc" }, select: { versionNo: true, id: true } });
    if (v) latestPublished.set(wfId, v.versionNo);
  }
  return rows.map((m) => {
    const s = stats.get(m.id);
    return {
      id: m.id,
      collectionId: m.collectionId,
      key: m.slug,
      name: m.name,
      workflowId: m.workflowVersion.workflowId,
      workflowName: m.workflowVersion.workflow.name,
      workflowVersionId: m.workflowVersionId,
      pinnedVersion: m.workflowVersion.versionNo,
      latestVersion: latestPublished.get(m.workflowVersion.workflowId) ?? m.workflowVersion.versionNo,
      mode: m.defaultMode === "SYNC" ? ("sync" as const) : ("async" as const),
      syncTimeoutSec: m.syncTimeoutSec,
      runTimeoutSec: m.runTimeoutSec,
      maxAttempts: m.maxAttempts,
      screenshotPolicy: m.screenshotPolicy,
      calls7d: s?.calls ?? 0,
      errorRate: s && s.done ? (s.failed / s.done) * 100 : 0,
      status: m.state === "PAUSED" || !m.isActive ? ("PAUSED" as const) : ("ACTIVE" as const),
    };
  });
}

export type MethodRow = Awaited<ReturnType<typeof listMethods>>[number];

export async function listCollections(tenantId: string) {
  const [cols, methods] = await Promise.all([
    tenantDb(tenantId).methodCollection.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { methods: true } } } }),
    listMethods(tenantId),
  ]);
  return cols.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    methods: c._count.methods,
    calls7d: methods.filter((m) => m.collectionId === c.id).reduce((n, m) => n + m.calls7d, 0),
  }));
}

export async function getCollection(tenantId: string, id: string) {
  return (await listCollections(tenantId)).find((c) => c.id === id) ?? null;
}

export async function publishedWorkflowOptions(tenantId: string) {
  const rows = await tenantDb(tenantId).workflowVersion.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ workflowId: "asc" }, { versionNo: "desc" }],
    select: { id: true, versionNo: true, workflow: { select: { name: true } } },
  });
  return rows.map((v) => ({ value: v.id, label: `${v.workflow.name} (v${v.versionNo})` }));
}

// ───────────── Runs ─────────────

export type RunListFilter = { q?: string; status?: string; methodId?: string; jobId?: string; take?: number };

export async function listRuns(tenantId: string, f: RunListFilter = {}) {
  const where: Prisma.RunWhereInput = {
    ...(f.status ? { status: f.status as never } : {}),
    ...(f.methodId ? { methodId: f.methodId } : {}),
    ...(f.jobId ? { jobId: f.jobId } : {}),
    ...(f.q ? { OR: [{ id: { contains: f.q } }, { externalRef: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const rows = await withTenantTx(tenantId, (tx) =>
    tx.run.findMany({
      where,
      orderBy: { queuedAt: "desc" },
      take: f.take ?? 100,
      select: {
        id: true, methodId: true, status: true, externalRef: true, durationMs: true, queuedAt: true, trigger: true,
        errorCode: true, errorMessage: true, errorStepId: true, itemIndex: true, jobId: true,
      },
    }),
  );
  const names = await methodNames(tenantId, rows.map((r) => r.methodId));
  return rows.map((r) => ({
    id: r.id,
    methodId: r.methodId,
    methodName: (r.methodId && names.get(r.methodId)?.name) || "Δοκιμαστική εκτέλεση",
    methodKey: (r.methodId && names.get(r.methodId)?.key) || "—",
    status: r.status,
    externalRef: r.externalRef,
    durationMs: r.durationMs,
    createdAt: iso(r.queuedAt)!,
    trigger: r.trigger,
    itemIndex: r.itemIndex,
    error: r.errorCode ? { code: r.errorCode, message: r.errorMessage ?? "", step: r.errorStepId ?? "" } : null,
  }));
}

export type RunRow = Awaited<ReturnType<typeof listRuns>>[number];

export async function getRun(tenantId: string, id: string) {
  return withTenantTx(tenantId, async (tx) => {
    const r = await tx.run.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { seq: "asc" } },
        artifacts: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, runStepId: true, storagePath: true, contentType: true, sizeBytes: true } },
        workflowVersion: { select: { versionNo: true, workflow: { select: { name: true } } } },
      },
    });
    if (!r) return null;
    const logs = await tx.runLog.findMany({ where: { runId: id }, orderBy: { ts: "asc" }, take: 500 });
    const method = r.methodId ? await tx.method.findUnique({ where: { id: r.methodId }, select: { name: true, slug: true } }) : null;
    const failedStep = r.steps.find((s) => s.status === "FAILED");
    return {
      id: r.id,
      status: r.status,
      methodName: method?.name ?? r.workflowVersion.workflow.name,
      methodKey: method?.slug ?? "—",
      version: r.workflowVersion.versionNo,
      externalRef: r.externalRef,
      trigger: r.trigger,
      createdAt: iso(r.queuedAt)!,
      durationMs: r.durationMs,
      inputPreview: r.inputPreview,
      output: r.output,
      error: r.errorCode ? { code: r.errorCode, message: r.errorMessage ?? "", step: failedStep ? String(failedStep.seq).padStart(2, "0") : (r.errorStepId ?? "") } : null,
      targetMessage: r.targetMessage,
      steps: r.steps.map((s) => ({
        no: String(s.seq).padStart(2, "0"),
        label: s.label,
        status: s.status === "SUCCEEDED" ? ("ok" as const) : s.status === "FAILED" ? ("failed" as const) : s.status === "SKIPPED" ? ("skipped" as const) : ("pending" as const),
        durationMs: s.durationMs ?? 0,
        fallback: !!(s.locatorUsed && (s.locatorUsed as { fallback?: boolean }).fallback),
      })),
      logs: logs.map((l) => ({ at: iso(l.ts)!, level: l.level.toLowerCase(), message: l.message })),
      artifacts: r.artifacts,
    };
  });
}

export type RunDetail = NonNullable<Awaited<ReturnType<typeof getRun>>>;

export async function countAttention(tenantId: string) {
  return withTenantTx(tenantId, (tx) => tx.run.count({ where: { status: "NEEDS_ATTENTION" } }));
}

// ───────────── Jobs ─────────────

export async function listJobs(tenantId: string) {
  const rows = await tenantDb(tenantId).job.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const [names, users] = await Promise.all([methodNames(tenantId, rows.map((j) => j.methodId)), userNames(rows.map((j) => j.createdByUserId ?? ""))]);
  return rows.map((j) => ({
    id: j.id,
    name: j.name ?? "Μαζική εργασία",
    methodId: j.methodId,
    methodName: names.get(j.methodId)?.name ?? "—",
    status: j.status,
    total: j.totalItems,
    done: j.succeededCount + j.failedCount + j.cancelledCount,
    failed: j.failedCount,
    createdAt: iso(j.createdAt)!,
    createdBy: users.get(j.createdByUserId ?? "") ?? "API",
    file: j.sourceFilePath?.split("/").pop() ?? "—",
  }));
}

export async function getJob(tenantId: string, id: string) {
  return (await listJobs(tenantId)).find((j) => j.id === id) ?? null;
}

// ───────────── Dashboard & usage ─────────────

export async function dashboardStats(tenantId: string) {
  const since = new Date(Date.now() - 14 * DAY);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return withTenantTx(tenantId, async (tx) => {
    const [todayCount, last24, queued, avg, series] = await Promise.all([
      tx.run.count({ where: { queuedAt: { gte: today } } }),
      tx.run.groupBy({ by: ["status"], where: { queuedAt: { gte: new Date(Date.now() - DAY) } }, _count: { _all: true } }),
      tx.run.count({ where: { status: { in: ["QUEUED", "RETRY_SCHEDULED"] } } }),
      tx.run.aggregate({ where: { finishedAt: { gte: new Date(Date.now() - DAY) }, durationMs: { not: null } }, _avg: { durationMs: true } }),
      tx.$queryRaw<{ day: Date; succeeded: number; failed: number }[]>(Prisma.sql`
        SELECT date_trunc('day', "queuedAt" AT TIME ZONE 'Europe/Athens') AS day,
               count(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
               count(*) FILTER (WHERE status = 'FAILED')::int AS failed
        FROM "run" WHERE "queuedAt" >= ${since} GROUP BY 1 ORDER BY 1`),
    ]);
    const ok = last24.find((g) => g.status === "SUCCEEDED")?._count._all ?? 0;
    const bad = last24.find((g) => g.status === "FAILED")?._count._all ?? 0;
    const byDay = new Map(series.map((s) => [s.day.toISOString().slice(0, 10), s]));
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * DAY);
      const key = d.toISOString().slice(0, 10);
      const s = byDay.get(key);
      return { day: `${d.getDate()}/${d.getMonth() + 1}`, succeeded: s?.succeeded ?? 0, failed: s?.failed ?? 0 };
    });
    return { today: todayCount, successRate: ok + bad ? (ok / (ok + bad)) * 100 : null, avgSeconds: avg._avg.durationMs ? avg._avg.durationMs / 1000 : null, queued, series: days };
  });
}

export async function usageSummary(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { runBalance: true, plan: { select: { name: true, runsMonthly: true, overagePricePerRun: true, overageEnabled: true } } } });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const db = tenantDb(tenantId);
  const [ledger, used, extra, daily] = await Promise.all([
    db.runCreditLedger.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.runCreditLedger.aggregate({ where: { kind: "usage", createdAt: { gte: monthStart } }, _sum: { delta: true } }),
    db.runCreditLedger.aggregate({ where: { kind: { in: ["topup", "gift"] } }, _sum: { delta: true } }),
    db.usageDaily.findMany({ where: { day: { gte: monthStart } }, orderBy: { day: "asc" } }),
  ]);
  const KIND: Record<string, string> = { grant: "Μηνιαία χορήγηση", topup: "Αγορά πακέτου", gift: "Δώρο", usage: "Κατανάλωση", refund: "Επιστροφή", adjust: "Διόρθωση", overage_invoice: "Χρέωση υπέρβασης" };
  return {
    plan: tenant.plan?.name ?? "Χωρίς πακέτο",
    runsMonthly: tenant.plan?.runsMonthly ?? 0,
    balance: tenant.runBalance,
    used: -(used._sum.delta ?? 0),
    extraCredits: extra._sum.delta ?? 0,
    overagePrice: tenant.plan?.overageEnabled ? Number(tenant.plan.overagePricePerRun ?? 0) : null,
    daily: daily.map((d) => ({ day: d.day.getDate(), succeeded: d.succeeded, failed: d.failed })),
    ledger: ledger.map((l) => ({ id: l.id, at: iso(l.createdAt)!, kind: l.note ?? KIND[l.kind] ?? l.kind, amount: l.delta })),
  };
}

export async function runPacks() {
  return prisma.runCreditPack.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

// ───────────── Admin: keys, webhooks, members, audit, notifications ─────────────

export async function listApiKeys(tenantId: string) {
  const rows = await tenantDb(tenantId).apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } });
  return rows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, collections: k.collectionIds, lastUsedAt: iso(k.lastUsedAt), expiresAt: iso(k.expiresAt), createdAt: iso(k.createdAt)! }));
}

export async function listWebhooks(tenantId: string) {
  const db = tenantDb(tenantId);
  const [endpoints, deliveries] = await Promise.all([
    db.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" }, include: { deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { lastStatusCode: true, createdAt: true } } } }),
    db.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    endpoints: endpoints.map((w) => ({ id: w.id, url: w.url, events: w.events, active: w.isActive, lastDelivery: w.deliveries[0] ? { status: w.deliveries[0].lastStatusCode ?? 0, at: iso(w.deliveries[0].createdAt)! } : null })),
    deliveries: deliveries.map((d) => ({ id: d.id, event: d.event, status: d.lastStatusCode ?? 0, state: d.status, attempts: d.attempts, at: iso(d.createdAt)! })),
  };
}

export async function listMembers(tenantId: string) {
  const rows = await tenantDb(tenantId).membership.findMany({
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true, active: true, platformRole: true, sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } } },
  });
  return rows
    .filter((m) => m.user.platformRole === "USER")
    .map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      status: m.user.sessions.length ? ("ACTIVE" as const) : ("INVITED" as const),
      active: m.user.active,
      lastLoginAt: iso(m.user.sessions[0]?.createdAt),
    }));
}

export async function listAudit(tenantId: string, q?: string) {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entity: { contains: q, mode: "insensitive" } }, { actor: { name: { contains: q, mode: "insensitive" } } }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { actor: { select: { name: true } } },
  });
  return rows.map((a) => ({ id: a.id, at: iso(a.createdAt)!, actor: a.actor?.name ?? "Σύστημα", action: a.action, entity: [a.entity, (a.meta as { name?: string } | null)?.name].filter(Boolean).join(" · ") }));
}

export async function listNotifications(tenantId: string, userId: string) {
  const rows = await tenantDb(tenantId).notification.findMany({ where: { OR: [{ userId }, { userId: null }] }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((n) => ({ id: n.id, at: iso(n.createdAt)!, text: n.title, body: n.body, href: n.link ?? "", read: !!n.readAt }));
}

export async function unreadNotifications(tenantId: string, userId: string) {
  return tenantDb(tenantId).notification.count({ where: { readAt: null, OR: [{ userId }, { userId: null }] } });
}

export async function tenantSettings(tenantId: string) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true, plan: { select: { logRetentionDays: true, artifactRetentionDays: true } } } });
  const s = (t.settings ?? {}) as { timezone?: string; logRetentionDays?: number; artifactRetentionDays?: number; emailOnFailure?: boolean; emailOnAttention?: boolean; teams?: boolean };
  const maxLogs = t.plan?.logRetentionDays ?? 30;
  const maxArtifacts = t.plan?.artifactRetentionDays ?? 7;
  return {
    timezone: s.timezone ?? "Europe/Athens",
    logRetentionDays: Math.min(s.logRetentionDays ?? maxLogs, maxLogs),
    artifactRetentionDays: Math.min(s.artifactRetentionDays ?? maxArtifacts, maxArtifacts),
    maxLogs,
    maxArtifacts,
    emailOnFailure: s.emailOnFailure ?? true,
    emailOnAttention: s.emailOnAttention ?? true,
    teams: s.teams ?? false,
  };
}

// ───────────── helpers ─────────────

async function userNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((u) => [u.id, u.name]));
}

async function methodNames(tenantId: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map<string, { name: string; key: string }>();
  const rows = await tenantDb(tenantId).method.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true } });
  return new Map(rows.map((m) => [m.id, { name: m.name, key: m.slug }]));
}

/** Latest runs of a workflow (all versions) with their logs, for the panel under the editor. */
export async function workflowRuns(tenantId: string, workflowId: string, take = 10) {
  return withTenantTx(tenantId, async (tx) => {
    const runs = await tx.run.findMany({
      where: { workflowVersion: { workflowId } },
      orderBy: { queuedAt: "desc" },
      take,
      select: { id: true, status: true, trigger: true, externalRef: true, queuedAt: true, durationMs: true, errorCode: true, errorMessage: true, workflowVersion: { select: { versionNo: true } } },
    });
    const logs = runs.length
      ? await tx.runLog.findMany({ where: { runId: { in: runs.map((r) => r.id) } }, orderBy: { ts: "asc" }, take: 50 * runs.length })
      : [];
    // Step statuses of the latest run, for the canvas (the last attempt of each step wins).
    const latestSteps = runs[0] ? await tx.runStep.findMany({ where: { runId: runs[0].id }, orderBy: { seq: "asc" }, select: { stepId: true, status: true, path: true } }) : [];
    const stepStatus = Object.fromEntries(latestSteps.filter((s) => !s.path.startsWith("login")).map((s) => [s.stepId, s.status]));
    return runs.map((r, i) => ({
      stepStatus: i === 0 ? stepStatus : undefined,
      id: r.id,
      status: r.status,
      trigger: r.trigger,
      externalRef: r.externalRef,
      version: r.workflowVersion.versionNo,
      createdAt: iso(r.queuedAt)!,
      durationMs: r.durationMs,
      error: r.errorCode ? `${r.errorCode}: ${r.errorMessage ?? ""}` : null,
      logs: logs.filter((l) => l.runId === r.id).slice(-50).map((l) => ({ at: iso(l.ts)!, level: l.level.toLowerCase(), message: l.message })),
    }));
  });
}
