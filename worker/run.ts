// Run lifecycle (docs/06 §3): claim → semaphores → decrypt → session/login → steps → artifacts →
// final status, billing (docs/14) and retry. Every write to run tables goes through withTenantTx (RLS).
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateSync } from "otplib";
import type { BrowserContext, Page } from "playwright";
import { applyCredit } from "@/lib/billing";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { parseDefinition, type WorkflowDefinition } from "@/lib/dsl";
import { EngineError, Interpreter, classify, installGuard, normalizeOrigins, resolveLocator, type ErrorDetector, type Hooks } from "@/lib/engine";
import type { LogLevel, RunStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getBoss } from "@/lib/queue";
import { publishRunEvent, type RunEvent } from "@/lib/queue/events";
import { RUNS_QUEUE } from "@/lib/runs/create";
import { withTenantTx } from "@/lib/tenant-db";
import { collectOnError, saveArtifact, type ArtifactCtx } from "./artifacts";
import { newContext } from "./browser";
import { acquire, heartbeat, release, type LeaseKey } from "./leases";

type Secrets = { username?: string; password?: string; totpSecret?: string; [k: string]: unknown };
type LogRow = { level: LogLevel; source: string; message: string; data?: Record<string, unknown>; stepId?: string; ts: Date };

const ATTENTION = new Set(["E_CAPTCHA_DETECTED", "E_HUMAN_TIMEOUT"]);

export async function processRun(runId: string, tenantId: string, workerId: string): Promise<string> {
  const run = await withTenantTx(tenantId, (tx) =>
    tx.run.findFirst({
      where: { id: runId, status: { in: ["QUEUED", "RETRY_SCHEDULED"] } },
      include: { workflowVersion: { include: { workflow: { include: { targetSystem: true } } } }, method: true },
    }),
  );
  if (!run) return "not-claimable";
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { isDemo: true, plan: { select: { maxConcurrentRuns: true, artifactRetentionDays: true, freeTestRunsDaily: true } } } });
  const version = run.workflowVersion;
  const target = version.workflow.targetSystem;
  const credential = await pickCredential(tenantId, target.id, run.method?.credentialId ?? null);

  const leases: LeaseKey[] = [
    { scope: "tenant", key: tenantId, max: tenant.plan?.maxConcurrentRuns ?? 2 },
    { scope: "target", key: target.id, max: target.maxConcurrency },
    ...(credential ? [{ scope: "credential" as const, key: credential.id, max: credential.maxSessions }] : []),
  ];
  // Slots first, then the claim: a run is RUNNING only while it really holds its slots.
  if (!(await acquire(runId, leases))) {
    const boss = await getBoss("worker");
    await boss.send(RUNS_QUEUE, { runId, tenantId }, { startAfter: 2 + Math.floor(Math.random() * 4), singletonKey: `${runId}:${Date.now()}` });
    return "no-slot";
  }
  const claimed = await withTenantTx(tenantId, (tx) =>
    tx.run.updateMany({ where: { id: runId, status: { in: ["QUEUED", "RETRY_SCHEDULED"] } }, data: { status: "RUNNING", workerId, startedAt: new Date() } }),
  );
  if (!claimed.count) {
    await release(runId);
    return "not-claimable";
  }

  const started = Date.now();
  const logs: LogRow[] = [];
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, stepId?: string, source = "engine") => logs.push({ level, source, message, data, stepId, ts: new Date() });
  const flushLogs = async () => {
    const batch = logs.splice(0);
    if (!batch.length) return;
    await withTenantTx(tenantId, (tx) => tx.runLog.createMany({ data: batch.map((l) => ({ tenantId, runId, stepId: l.stepId ?? null, ts: l.ts, level: l.level, source: l.source, message: l.message.slice(0, 2000), data: (l.data ?? undefined) as never })) }));
  };
  const emit = (e: RunEvent) => void publishRunEvent(runId, tenantId, e).catch(() => undefined);
  emit({ type: "status", status: "RUNNING" });
  const beat = setInterval(() => void heartbeat(runId).catch(() => undefined), 60_000);
  const flusher = setInterval(() => void flushLogs().catch(() => undefined), 2_000);
  const artifactCtx: ArtifactCtx = { tenantId, runId, retentionDays: tenant.plan?.artifactRetentionDays ?? 30 };

  let context: BrowserContext | null = null;
  let interpreter: Interpreter | null = null;
  let tracing = false;
  try {
    log("INFO", `Έναρξη εκτέλεσης (προσπάθεια ${run.attempt}) στον worker ${workerId}`, undefined, undefined, "system");
    const parsed = parseDefinition(version.definition, { inputSchema: version.inputSchema, outputSchema: version.outputSchema, name: version.workflow.name });
    if (!parsed.ok) throw new EngineError("E_INPUT_VALIDATION", `Ο ορισμός της ροής δεν είναι έγκυρος: ${parsed.issues.map((i) => i.message).slice(0, 3).join(" · ")}`);
    const def = parsed.def;

    const input = decryptJson<Record<string, unknown>>(run.inputEnc, `${tenantId}:${runId}`);
    const missing = def.inputs.filter((i) => i.required && (input[i.key] === undefined || input[i.key] === null || input[i.key] === ""));
    if (missing.length) throw new EngineError("E_INPUT_VALIDATION", `Λείπουν υποχρεωτικές είσοδοι: ${missing.map((m) => m.label || m.key).join(", ")}.`);

    const creds = credential ? decryptJson<Secrets>(credential.payloadEnc, `${tenantId}:${credential.id}`) : null;
    const secrets: Record<string, string> = {};
    if (creds) {
      for (const [k, v] of Object.entries(creds)) if (typeof v === "string" && k !== "totpSecret") secrets[k] = v;
      if (creds.totpSecret) Object.defineProperty(secrets, "totp", { enumerable: true, get: () => generateSync({ secret: creds.totpSecret! }) });
    }

    const browserOpts = (target.browserOptions ?? {}) as { locale?: string; timezone?: string };
    const session = credential ? await loadSession(tenantId, credential.id) : null;
    context = await newContext({
      locale: browserOpts.locale ?? def.settings.locale,
      timezoneId: browserOpts.timezone ?? def.settings.timezone,
      viewport: def.settings.viewport,
      storageState: session?.state as never,
    });
    const allowed = normalizeOrigins(target.allowedOrigins, target.baseUrl);
    await installGuard(context, allowed, (origin, reason) => log("WARN", `Αποκλείστηκε αίτημα προς ${origin} (${reason === "private" ? "ιδιωτική διεύθυνση" : "εκτός επιτρεπτών origins"})`, undefined, undefined, "network"));
    const page = await context.newPage();
    const consoleLines: string[] = [];
    page.on("console", (m) => consoleLines.length < 2000 && consoleLines.push(`[${m.type()}] ${m.text().slice(0, 500)}`));
    page.on("pageerror", (e) => log("WARN", `Σφάλμα JavaScript σελίδας: ${e.message.slice(0, 300)}`, undefined, undefined, "page.console"));

    const stepRows = new Map<number, string>();
    const hooks: Hooks = {
      log: (level, message, data, stepId) => log(level, message, data, stepId),
      onStepStart: async (e) => {
        const row = await withTenantTx(tenantId, (tx) =>
          tx.runStep.create({ data: { tenantId, runId, stepId: e.step.id, seq: e.seq, path: e.path, type: e.step.type, label: e.step.label || e.step.type, status: "RUNNING", startedAt: new Date() }, select: { id: true } }),
        );
        stepRows.set(e.seq, row.id);
        emit({ type: "step.started", stepId: e.step.id, seq: e.seq, iteration: e.iteration });
      },
      onStepEnd: async (r) => {
        const data = {
          status: r.status,
          attempt: r.attempt,
          locatorUsed: (r.locatorUsed ? { ...(r.locatorUsed as object), fallback: !!r.fallback } : undefined) as never,
          valuePreview: r.valuePreview?.slice(0, 200) ?? null,
          pageUrl: r.pageUrl?.slice(0, 1000) ?? null,
          message: r.message?.slice(0, 1000) ?? null,
          errorCode: r.errorCode ?? null,
          finishedAt: new Date(),
          durationMs: r.durationMs,
        };
        const id = stepRows.get(r.seq);
        await withTenantTx(tenantId, (tx) =>
          id
            ? tx.runStep.update({ where: { id }, data })
            : tx.runStep.create({ data: { tenantId, runId, stepId: r.step.id, seq: r.seq, path: r.path, type: r.step.type, label: r.step.label || r.step.type, ...data } }),
        );
        emit({ type: "step", stepId: r.step.id, seq: r.seq, status: r.status, durationMs: r.durationMs, errorCode: r.errorCode, iteration: r.iteration });
        log(r.status === "FAILED" ? "ERROR" : "INFO", `${r.step.label || r.step.type}: ${r.status === "SUCCEEDED" ? "ολοκληρώθηκε" : r.status === "SKIPPED" ? "παραλείφθηκε" : (r.message ?? "απέτυχε")}`, { durationMs: r.durationMs }, r.step.id);
      },
      onStepError: async (e, _err, c) => {
        await collectOnError(artifactCtx, c.page, { runStepId: stepRows.get(e.seq), element: c.element, sensitive: c.sensitive, console: consoleLines });
      },
      onScreenshot: async (e, c) => {
        const buf = await c.page.screenshot({ fullPage: c.fullPage, mask: c.sensitive });
        await saveArtifact(artifactCtx, c.fullPage ? "SCREENSHOT_FULL" : "SCREENSHOT_VIEWPORT", buf, "image/png", { runStepId: stepRows.get(e.seq), meta: { name: c.name } });
      },
      isCancelled: () => false,
    };

    const loginSeq = !credential ? 0 : await ensureLogin({ tenantId, run, def, page, context, credentialId: credential.id, sessionTtlSec: target.sessionTtlSec, hadSession: !!session, baseUrl: target.baseUrl, secrets, log, hooks });

    // Trace after the login (it records typed values unmasked); kept only if no sensitive value was typed.
    tracing = await context.tracing.start({ screenshots: true, snapshots: true }).then(() => true, () => false);
    interpreter = new Interpreter(def, {
      page,
      input,
      secrets,
      baseUrl: target.baseUrl,
      env: { now: new Date().toISOString(), today: new Date().toISOString().slice(0, 10), runId },
      errorDetectors: (target.errorDetectors ?? []) as ErrorDetector[],
      hooks,
      seqStart: loginSeq,
    });
    const result = await interpreter.run();
    if (tracing) await context.tracing.stop().catch(() => undefined);
    await finish({ tenantId, run, status: "SUCCEEDED", started, output: result.output, tenant });
    log("INFO", "Η εκτέλεση ολοκληρώθηκε επιτυχώς.", undefined, undefined, "system");
    return "succeeded";
  } catch (raw) {
    const err = classify(raw);
    if (tracing && context) await saveTrace(context, interpreter, artifactCtx, log);
    if (err.code === "E_INTERNAL") log("ERROR", `Εσωτερικό σφάλμα: ${(raw as Error)?.message?.slice(0, 500)}`, undefined, err.extra.stepId, "system");
    const committed = interpreter?.mayHaveCommitted ?? false;
    const maxAttempts = run.trigger === "UI_TEST" ? 1 : (run.method?.maxAttempts ?? run.maxAttempts);
    if (ATTENTION.has(err.code)) {
      await finish({ tenantId, run, status: "NEEDS_ATTENTION", started, err, committed, tenant });
    } else if (err.retryable && run.attempt < maxAttempts && !committed) {
      const delay = (run.method?.retryBackoffSec ?? 30) * 2 ** (run.attempt - 1) + Math.floor(Math.random() * 10);
      await withTenantTx(tenantId, (tx) =>
        tx.run.update({ where: { id: runId }, data: { status: "RETRY_SCHEDULED", attempt: run.attempt + 1, errorCode: err.code, errorMessage: err.message, errorStepId: err.extra.stepId ?? null, workerId: null } }),
      );
      emit({ type: "status", status: "RETRY_SCHEDULED", errorCode: err.code });
      const boss = await getBoss("worker");
      await boss.send(RUNS_QUEUE, { runId, tenantId }, { startAfter: delay, singletonKey: `${runId}:retry:${run.attempt + 1}` });
      log("WARN", `Νέα προσπάθεια σε ${delay}″ (${err.code}).`, undefined, err.extra.stepId, "system");
    } else {
      await finish({ tenantId, run, status: "FAILED", started, err, committed, tenant });
      if (committed) log("WARN", "Η αποτυχία έγινε μετά από βήμα αποθήκευσης — ελέγξτε χειροκίνητα αν η εγγραφή δημιουργήθηκε.", undefined, err.extra.stepId, "system");
    }
    return `failed:${err.code}`;
  } finally {
    clearInterval(beat);
    clearInterval(flusher);
    await context?.close().catch(() => undefined);
    await release(runId).catch(() => undefined);
    await flushLogs().catch((e) => console.error("[worker] logs", runId, (e as Error).message));
  }
}

async function pickCredential(tenantId: string, targetSystemId: string, preferredId: string | null) {
  return withTenantTx(tenantId, async (tx) => {
    if (preferredId) {
      const c = await tx.credential.findFirst({ where: { id: preferredId, targetSystemId } });
      if (c) return c;
    }
    return tx.credential.findFirst({ where: { targetSystemId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  });
}

async function loadSession(tenantId: string, credentialId: string) {
  const s = await withTenantTx(tenantId, (tx) => tx.browserSession.findFirst({ where: { credentialId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }));
  if (!s) return null;
  try {
    return { id: s.id, state: decryptJson<unknown>(s.storageStateEnc, `${tenantId}:${s.id}`) };
  } catch {
    return null;
  }
}

type LoginCtx = {
  tenantId: string;
  run: { id: string; workflowVersion: { workflow: { targetSystem: { loginWorkflowId: string | null } } } };
  def: WorkflowDefinition;
  page: Page;
  context: BrowserContext;
  credentialId: string;
  sessionTtlSec: number;
  hadSession: boolean;
  baseUrl: string;
  secrets: Record<string, string>;
  log: (level: LogLevel, message: string, data?: Record<string, unknown>, stepId?: string, source?: string) => void;
  hooks: Hooks;
};

/** Session reuse + login flow (docs/06 §6). Login failures are E_AUTH_FAILED. Returns the last step number used. */
async function ensureLogin(c: LoginCtx): Promise<number> {
  const loginWorkflowId = c.run.workflowVersion.workflow.targetSystem.loginWorkflowId;
  if (!loginWorkflowId) return 0;
  const lw = await prisma.workflow.findFirst({ where: { id: loginWorkflowId, tenantId: c.tenantId }, include: { versions: { orderBy: { versionNo: "desc" }, take: 5 } } });
  if (!lw) return 0;
  const v = lw.versions.find((x) => x.id === lw.publishedVersionId) ?? lw.versions[0];
  if (!v) return 0;
  const parsed = parseDefinition(v.definition, { inputSchema: v.inputSchema, outputSchema: v.outputSchema, name: lw.name });
  if (!parsed.ok) throw new EngineError("E_AUTH_FAILED", `Η ροή σύνδεσης «${lw.name}» δεν είναι έγκυρη.`);
  const check = c.def.login.sessionCheck ?? parsed.def.login.sessionCheck;

  const loggedIn = async () => {
    if (!check) return false;
    return resolveLocator(c.page, check, { timeoutMs: 5000, render: (s) => s }).then(() => true, () => false);
  };
  if (c.hadSession && check) {
    await c.page.goto(c.baseUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    if (await loggedIn()) {
      c.log("INFO", "Επαναχρησιμοποίηση αποθηκευμένου session.", undefined, undefined, "system");
      return 0;
    }
    c.log("INFO", "Το αποθηκευμένο session έληξε — νέα σύνδεση.", undefined, undefined, "system");
  }
  c.log("INFO", `Σύνδεση με τη ροή «${lw.name}».`, undefined, undefined, "system");
  const login = new Interpreter(parsed.def, { page: c.page, input: {}, secrets: c.secrets, baseUrl: c.baseUrl, hooks: c.hooks, pathPrefix: "login" });
  try {
    await login.run();
  } catch (err) {
    const e = classify(err);
    if (e.code === "E_CAPTCHA_DETECTED") throw e;
    throw new EngineError("E_AUTH_FAILED", `Η σύνδεση στο σύστημα απέτυχε: ${e.message}`, { stepId: e.extra.stepId, targetMessage: e.extra.targetMessage });
  }
  if (check && !(await loggedIn())) throw new EngineError("E_AUTH_FAILED", "Η σύνδεση δεν επιβεβαιώθηκε (το στοιχείο ελέγχου session δεν εμφανίστηκε).");

  const state = await c.context.storageState();
  await withTenantTx(c.tenantId, async (tx) => {
    const s = await tx.browserSession.create({
      data: { tenantId: c.tenantId, targetSystemId: (await tx.credential.findUniqueOrThrow({ where: { id: c.credentialId }, select: { targetSystemId: true } })).targetSystemId, credentialId: c.credentialId, storageStateEnc: "pending", expiresAt: new Date(Date.now() + c.sessionTtlSec * 1000) },
      select: { id: true },
    });
    await tx.browserSession.update({ where: { id: s.id }, data: { storageStateEnc: encryptJson(state, `${c.tenantId}:${s.id}`) } });
    await tx.browserSession.deleteMany({ where: { credentialId: c.credentialId, id: { not: s.id } } });
    await tx.credential.update({ where: { id: c.credentialId }, data: { lastUsedAt: new Date() } });
  });
  return login.lastSeq;
}

type FinishCtx = {
  tenantId: string;
  run: { id: string; trigger: string; workflowVersionId: string };
  status: RunStatus;
  started: number;
  output?: Record<string, unknown>;
  err?: EngineError;
  committed?: boolean;
  tenant: { isDemo: boolean; plan: { freeTestRunsDaily: number } | null };
};

async function finish(c: FinishCtx) {
  const durationMs = Date.now() - c.started;
  await withTenantTx(c.tenantId, async (tx) => {
    await tx.run.update({
      where: { id: c.run.id },
      data: {
        status: c.status,
        output: (c.output ?? undefined) as never,
        errorCode: c.err?.code ?? null,
        errorMessage: c.err?.message ?? null,
        errorStepId: c.err?.extra.stepId ?? null,
        targetMessage: c.err?.extra.targetMessage ?? null,
        mayHaveCommitted: c.committed ?? false,
        finishedAt: new Date(),
        durationMs,
        browserMs: durationMs,
      },
    });
    if (c.status === "SUCCEEDED" && c.run.trigger === "UI_TEST") {
      await tx.workflowVersion.updateMany({ where: { id: c.run.workflowVersionId }, data: { lastTestRunId: c.run.id } });
    }
  });
  void publishRunEvent(c.run.id, c.tenantId, { type: "status", status: c.status, errorCode: c.err?.code ?? null }).catch(() => undefined);
  if (c.status === "SUCCEEDED") await charge(c);
}

async function saveTrace(context: BrowserContext, interpreter: Interpreter | null, ctx: ArtifactCtx, log: (level: LogLevel, message: string, data?: Record<string, unknown>, stepId?: string, source?: string) => void) {
  if (!interpreter || interpreter.filledSensitive) {
    await context.tracing.stop().catch(() => undefined);
    if (interpreter?.filledSensitive) log("INFO", "Το Playwright trace δεν κρατήθηκε: η ροή συμπλήρωσε ευαίσθητες τιμές.", undefined, undefined, "system");
    return;
  }
  const file = path.join(tmpdir(), `trace-${ctx.runId}-${Date.now()}.zip`);
  try {
    await context.tracing.stop({ path: file });
    await saveArtifact(ctx, "PLAYWRIGHT_TRACE", await readFile(file), "application/zip");
  } catch (err) {
    log("WARN", `Το trace δεν αποθηκεύτηκε: ${(err as Error).message.slice(0, 200)}`, undefined, undefined, "system");
  } finally {
    await rm(file, { force: true }).catch(() => undefined);
  }
}

/** One unit per successful run (ledger key usage:<runId>); health runs, demo tenants and test runs within the daily allowance are free (docs/14). */
async function charge(c: FinishCtx) {
  if (c.tenant.isDemo || c.run.trigger === "HEALTH") return;
  if (c.run.trigger === "UI_TEST") {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const today = await withTenantTx(c.tenantId, (tx) => tx.run.count({ where: { trigger: "UI_TEST", status: "SUCCEEDED", finishedAt: { gte: since } } }));
    if (today <= (c.tenant.plan?.freeTestRunsDaily ?? 50)) return;
  }
  const balance = await applyCredit({ tenantId: c.tenantId, delta: -1, kind: "usage", key: `usage:${c.run.id}`, runId: c.run.id, note: "Εκτέλεση" });
  if (balance !== null) await withTenantTx(c.tenantId, (tx) => tx.run.update({ where: { id: c.run.id }, data: { billedUnits: 1 } }));
}
