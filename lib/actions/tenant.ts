"use server";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { audit } from "@/lib/audit";
import { encrypt, encryptJson } from "@/lib/crypto";
import { importChromeRecording } from "@/lib/dsl/import/chromeRecorder";
import { closeSession, getSession, RecorderError, startSession } from "@/lib/recorder/live";
import { ensureMethodForVersion } from "@/lib/methods";
import { sendWelcomeEmail } from "@/lib/email";
import { validate, type FormState } from "@/lib/forms";
import { prisma } from "@/lib/prisma";
import { requirePermission, type Permission } from "@/lib/rbac";
import { createRun, enqueueRun, RunError } from "@/lib/runs/create";
import { tenantDb, withTenantTx } from "@/lib/tenant-db";
import type { Definition, StepDef } from "@/lib/data/tenant";

// Server Actions of the tenant area (ADR-023). Every action: permission check → zod → scoped write
// (tenantDb / withTenantTx) → audit → revalidate. Messages to the user in Greek.

type Result = Promise<FormState>;

const req = (label: string) => z.string().trim().min(1, `Συμπληρώστε: ${label}`);
const opt = z.string().trim().optional().transform((v) => v || undefined);
const intent = z.enum(["READ", "CREATE", "UPDATE", "DELETE", "ACTION"]).optional().or(z.literal("").transform(() => undefined));
const int = (label: string, min: number, max: number) => z.coerce.number({ message: `${label}: αριθμός` }).int().min(min, `${label}: από ${min}`).max(max, `${label}: έως ${max}`);
const list = (label: string) =>
  z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])).pipe(z.array(z.string()).min(1, `Επιλέξτε τουλάχιστον ένα: ${label}`));
const optList = z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));
const lines = (s: string | undefined) => (s ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || `item-${randomBytes(3).toString("hex")}`;

async function guard(tenantId: string, perm: Permission) {
  return requirePermission(perm, tenantId);
}
const done = (tenantId: string, path: string, message: string): FormState => {
  revalidatePath(`/t/${tenantId}${path}`);
  return { ok: true, message };
};
const fail = (err: unknown): FormState => ({ ok: false, message: err instanceof RunError ? err.message : "Η ενέργεια απέτυχε. Δοκιμάστε ξανά." });

/** Private hosts are refused for target systems and webhooks (SSRF, docs/02 §6). */
function isPrivateHost(url: string) {
  const host = new URL(url).hostname;
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

// ───────────── Targets & credentials ─────────────

const targetSchema = z.object({
  name: req("Όνομα"),
  baseUrl: z.url({ message: "Διεύθυνση: μη έγκυρο URL" }),
  origins: opt,
  maxConcurrency: int("Ταυτόχρονες εκτελέσεις", 1, 20),
});

export async function createTargetAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.targets.manage");
  const v = validate(targetSchema, fd);
  if ("state" in v) return v.state;
  if (process.env.NODE_ENV === "production" && isPrivateHost(v.data.baseUrl)) return { ok: false, errors: { baseUrl: "Ιδιωτικές διευθύνσεις δεν επιτρέπονται" } };
  const origins = lines(v.data.origins);
  const t = await tenantDb(tenantId).targetSystem.create({
    data: {
      name: v.data.name,
      slug: slugify(v.data.name),
      baseUrl: v.data.baseUrl,
      allowedOrigins: origins.length ? origins : [new URL(v.data.baseUrl).host],
      maxConcurrency: v.data.maxConcurrency,
    } as never,
  });
  await audit({ actorId: user.id, action: "target.create", entity: "TargetSystem", entityId: t.id, tenantId, meta: { name: v.data.name } });
  return done(tenantId, "/targets", "Το σύστημα‑στόχος δημιουργήθηκε.");
}

export async function updateTargetAction(tenantId: string, id: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.targets.manage");
  const v = validate(targetSchema, fd);
  if ("state" in v) return v.state;
  const origins = lines(v.data.origins);
  const r = await tenantDb(tenantId).targetSystem.updateMany({
    where: { id },
    data: { name: v.data.name, baseUrl: v.data.baseUrl, maxConcurrency: v.data.maxConcurrency, ...(origins.length ? { allowedOrigins: origins } : {}) },
  });
  if (!r.count) return { ok: false, message: "Το σύστημα δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "target.update", entity: "TargetSystem", entityId: id, tenantId });
  return done(tenantId, `/targets/${id}`, "Οι αλλαγές αποθηκεύτηκαν.");
}

/** Deletes workflows with their versions, methods, jobs and runs (one RLS transaction). */
async function purgeWorkflows(tenantId: string, workflowIds: string[]) {
  if (!workflowIds.length) return;
  await withTenantTx(
    tenantId,
    async (tx) => {
      const versions = (await tx.workflowVersion.findMany({ where: { tenantId, workflowId: { in: workflowIds } }, select: { id: true } })).map((v) => v.id);
      const methods = (await tx.method.findMany({ where: { tenantId, workflowVersionId: { in: versions } }, select: { id: true } })).map((m) => m.id);
      const runs = (await tx.run.findMany({ where: { tenantId, workflowVersionId: { in: versions } }, select: { id: true } })).map((r) => r.id);
      if (runs.length) await tx.runLog.deleteMany({ where: { tenantId, runId: { in: runs } } });
      if (methods.length) await tx.job.deleteMany({ where: { tenantId, methodId: { in: methods } } });
      await tx.run.deleteMany({ where: { tenantId, workflowVersionId: { in: versions } } });
      if (methods.length) await tx.method.deleteMany({ where: { tenantId, id: { in: methods } } });
      await tx.recording.updateMany({ where: { tenantId, workflowId: { in: workflowIds } }, data: { workflowId: null } });
      await tx.workflow.deleteMany({ where: { tenantId, id: { in: workflowIds } } });
    },
    { timeout: 60_000 },
  );
}

const DELETE_FAILED = "Η διαγραφή δεν ολοκληρώθηκε: υπάρχουν ακόμη στοιχεία που εξαρτώνται από αυτό (π.χ. εξαγωγές ή incidents). Δοκιμάστε ξανά ή επικοινωνήστε με την υποστήριξη.";

export async function deleteTargetAction(tenantId: string, id: string): Result {
  const user = await guard(tenantId, "tenant.targets.manage");
  const db = tenantDb(tenantId);
  const target = await db.targetSystem.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!target) return { ok: false, message: "Το σύστημα δεν βρέθηκε." };
  const workflows = (await db.workflow.findMany({ where: { targetSystemId: id }, select: { id: true } })).map((w) => w.id);
  try {
    await purgeWorkflows(tenantId, workflows);
    await withTenantTx(tenantId, async (tx) => {
      await tx.recording.deleteMany({ where: { tenantId, targetSystemId: id } });
      await tx.targetSystem.deleteMany({ where: { tenantId, id } });
    });
  } catch (err) {
    console.error("[targets] delete", id, (err as Error).message);
    return { ok: false, message: DELETE_FAILED };
  }
  await audit({ actorId: user.id, action: "target.delete", entity: "TargetSystem", entityId: id, tenantId, meta: { name: target.name, workflows: workflows.length } });
  revalidatePath(`/t/${tenantId}`, "layout");
  redirect(`/t/${tenantId}/targets`);
}

export async function deleteWorkflowAction(tenantId: string, id: string): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const wf = await tenantDb(tenantId).workflow.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!wf) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  try {
    await purgeWorkflows(tenantId, [id]);
  } catch (err) {
    console.error("[workflows] delete", id, (err as Error).message);
    return { ok: false, message: DELETE_FAILED };
  }
  await audit({ actorId: user.id, action: "workflow.delete", entity: "Workflow", entityId: id, tenantId, meta: { name: wf.name } });
  revalidatePath(`/t/${tenantId}`, "layout");
  redirect(`/t/${tenantId}/workflows`);
}

export async function addCredentialAction(tenantId: string, targetSystemId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.credentials.manage");
  const v = validate(z.object({ label: req("Περιγραφή"), username: req("Όνομα χρήστη"), password: req("Κωδικός"), totpSecret: opt }), fd);
  if ("state" in v) return v.state;
  if (!(await tenantDb(tenantId).targetSystem.findUnique({ where: { id: targetSystemId }, select: { id: true } }))) return { ok: false, message: "Το σύστημα δεν βρέθηκε." };
  const { label, username, password, totpSecret } = v.data;
  const hint = username.length > 4 ? `${username.slice(0, 3)}•••${username.slice(-2)}` : "••••";
  const id = await withTenantTx(tenantId, async (tx) => {
    const c = await tx.credential.create({
      data: { tenantId, targetSystemId, label, kind: totpSecret ? "USERNAME_PASSWORD_TOTP" : "USERNAME_PASSWORD", payloadEnc: "pending", usernameHint: hint } as never,
      select: { id: true },
    });
    // AAD tenantId:credentialId — the ciphertext cannot be moved to another row (docs/02 §4).
    await tx.credential.update({ where: { id: c.id }, data: { payloadEnc: encryptJson({ username, password, totpSecret }, `${tenantId}:${c.id}`) } });
    return c.id;
  });
  await audit({ actorId: user.id, action: "credential.create", entity: "Credential", entityId: id, tenantId, meta: { name: label } });
  revalidatePath(`/t/${tenantId}/workflows`, "layout");
  return done(tenantId, `/targets/${targetSystemId}`, "Το διαπιστευτήριο αποθηκεύτηκε κρυπτογραφημένο.");
}

export async function deleteCredentialAction(tenantId: string, id: string): Result {
  const user = await guard(tenantId, "tenant.credentials.manage");
  const r = await withTenantTx(tenantId, (tx) => tx.credential.deleteMany({ where: { id } }));
  if (!r.count) return { ok: false, message: "Δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "credential.delete", entity: "Credential", entityId: id, tenantId });
  return done(tenantId, "/targets", "Το διαπιστευτήριο διαγράφηκε.");
}

// ───────────── Recordings ─────────────

/** 8-digit pairing code for the extension, derived from the recording (P06 verifies it, 10′). */
function pairingCode(recordingId: string) {
  const secret = process.env.RECORDER_JWT_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev";
  const window = Math.floor(Date.now() / 600_000);
  const n = parseInt(createHmac("sha256", secret).update(`${recordingId}:${window}`).digest("hex").slice(0, 8), 16);
  return String(n % 100_000_000).padStart(8, "0");
}

export async function newRecordingAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.recordings.create");
  const v = validate(z.object({ name: req("Όνομα"), targetId: req("Σύστημα‑στόχος") }), fd);
  if ("state" in v) return v.state;
  if (!(await tenantDb(tenantId).targetSystem.findUnique({ where: { id: v.data.targetId }, select: { id: true } }))) return { ok: false, errors: { targetId: "Το σύστημα δεν βρέθηκε" } };
  const rec = await withTenantTx(tenantId, (tx) =>
    tx.recording.create({ data: { tenantId, targetSystemId: v.data.targetId, name: v.data.name, createdById: user.id } as never, select: { id: true } }),
  );
  await audit({ actorId: user.id, action: "recording.create", entity: "Recording", entityId: rec.id, tenantId, meta: { name: v.data.name } });
  revalidatePath(`/t/${tenantId}/recordings`);
  return {
    ok: true,
    message: "Ανοίξτε το extension «DG Complete Recorder» και πληκτρολογήστε τον κωδικό σύνδεσης.",
    reveal: { label: "Κωδικός σύνδεσης", value: pairingCode(rec.id), note: "Ισχύει έως 10 λεπτά." },
  };
}

// ───────────── Workflows & versions ─────────────

const EMPTY_SCHEMA = { type: "object", properties: {}, required: [] as string[] };

export async function newWorkflowAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const v = validate(z.object({ name: req("Όνομα"), targetId: req("Σύστημα‑στόχος"), recordingId: opt, intent }), fd);
  if ("state" in v) return v.state;
  const db = tenantDb(tenantId);
  if (!(await db.targetSystem.findUnique({ where: { id: v.data.targetId }, select: { id: true } }))) return { ok: false, errors: { targetId: "Το σύστημα δεν βρέθηκε" } };
  let steps: StepDef[] = [];
  if (v.data.recordingId) {
    const rec = await withTenantTx(tenantId, (tx) => tx.recording.findUnique({ where: { id: v.data.recordingId }, select: { events: true } }));
    // Full compilation of recordings is lib/recorder (P07); here each event becomes one step.
    const events = (rec?.events ?? []) as { type?: string; label?: string; selector?: unknown; value?: unknown }[];
    steps = events.map((e, i) => ({ id: `s${i + 1}`, type: e.type ?? "click", label: e.label ?? `Βήμα ${i + 1}`, locator: e.selector, value: e.value }));
  }
  const wf = await db.workflow.create({
    data: {
      name: v.data.name,
      slug: `${slugify(v.data.name)}-${randomBytes(2).toString("hex")}`,
      targetSystemId: v.data.targetId,
      intent: v.data.intent ?? null,
      createdById: user.id,
      latestVersionNo: 1,
      versions: { create: { tenantId, versionNo: 1, definition: { dslVersion: 1, steps }, inputSchema: EMPTY_SCHEMA, outputSchema: EMPTY_SCHEMA, createdById: user.id } },
    } as never,
    select: { id: true },
  });
  if (v.data.recordingId) await withTenantTx(tenantId, (tx) => tx.recording.updateMany({ where: { id: v.data.recordingId }, data: { workflowId: wf.id, status: "COMPILED" } }));
  await audit({ actorId: user.id, action: "workflow.create", entity: "Workflow", entityId: wf.id, tenantId, meta: { name: v.data.name } });
  return done(tenantId, "/workflows", "Η ροή δημιουργήθηκε ως πρόχειρο.");
}

/** Starts a live recording in the app's own browser (docs/04 §10) and opens it. */
export async function deleteRecordingAction(tenantId: string, id: string): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const r = await withTenantTx(tenantId, (tx) => tx.recording.deleteMany({ where: { tenantId, id } }));
  if (!r.count) return { ok: false, message: "Η καταγραφή δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "recording.delete", entity: "Recording", entityId: id, tenantId });
  return done(tenantId, "/recordings", "Η καταγραφή διαγράφηκε.");
}

export async function startLiveRecordingAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const v = validate(z.object({ name: req("Όνομα"), targetId: req("Σύστημα‑στόχος"), workflowId: opt, intent }), fd);
  if ("state" in v) return v.state;
  const target = await tenantDb(tenantId).targetSystem.findUnique({ where: { id: v.data.targetId }, select: { id: true, baseUrl: true, allowedOrigins: true } });
  if (!target) return { ok: false, errors: { targetId: "Το σύστημα δεν βρέθηκε" } };
  if (v.data.workflowId && !(await tenantDb(tenantId).workflow.findUnique({ where: { id: v.data.workflowId }, select: { id: true } }))) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  let id: string;
  try {
    id = await startSession({ tenantId, userId: user.id, targetId: target.id, baseUrl: target.baseUrl, allowedOrigins: target.allowedOrigins, name: v.data.name, workflowId: v.data.workflowId, intent: v.data.intent });
  } catch (err) {
    return { ok: false, message: err instanceof RecorderError ? err.message : "Ο browser καταγραφής δεν ξεκίνησε. Δοκιμάστε ξανά." };
  }
  redirect(`/t/${tenantId}/recordings/live/${id}`);
}

/** Live recording → new draft workflow; closes the browser. */
export async function finishLiveRecordingAction(tenantId: string, sessionId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const s = getSession(sessionId, tenantId, user.id);
  if (!s) return { ok: false, message: "Η καταγραφή έληξε." };
  if (s.steps.length < 2) return { ok: false, message: "Δεν έχουν καταγραφεί βήματα ακόμα." };
  const name = String(fd.get("name") ?? "").trim() || s.name;
  const inputSchema = {
    type: "object",
    properties: Object.fromEntries(
      s.inputs.map((i) => [
        i.key,
        i.type === "array"
          ? { type: "array", title: i.label, items: { type: "object", properties: Object.fromEntries((i.items ?? []).map((f) => [f.key, { type: "string", title: f.label, ...(f.enum ? { enum: f.enum } : {}) }])), required: (i.items ?? []).map((f) => f.key) } }
          : { type: "string", title: i.label, ...(i.enum ? { enum: i.enum } : {}) },
      ]),
    ),
    required: s.inputs.filter((i) => i.required).map((i) => i.key),
  };
  // extract → string, extractTable → array of row objects (columns by header).
  const outputSchema = {
    type: "object",
    properties: Object.fromEntries(
      s.steps
        .filter((x) => (x.type === "extract" || x.type === "extractTable") && String(x.into).startsWith("output."))
        .map((x) => [
          String(x.into).slice(7),
          x.type === "extractTable"
            ? { type: "array", items: { type: "object", properties: Object.fromEntries(((x.columns ?? []) as { key: string; header: string }[]).map((c) => [c.key, { type: "string", title: c.header }])) } }
            : { type: "string" },
        ]),
    ),
    required: [] as string[],
  };
  if (s.workflowId) {
    // Into the existing workflow's draft: append after its steps, merge inputs/outputs/forms.
    const draft = await draftOf(tenantId, s.workflowId, user.id);
    if (!draft) return { ok: false, message: "Η ροή δεν βρέθηκε." };
    const def = (draft.definition ?? {}) as Definition & { forms?: Record<string, unknown> };
    const existing = def.steps ?? [];
    const prefix = existing.length ? `r${randomBytes(2).toString("hex")}` : "";
    const steps = [...existing, ...s.steps.map((x) => ({ ...x, id: prefix ? `${prefix}${x.id}` : x.id, ...(x.form && prefix ? { form: `${prefix}${x.form}` } : {}) }))];
    const forms = { ...(def.forms ?? {}), ...Object.fromEntries(Object.entries(s.forms).map(([k, f]) => [prefix ? `${prefix}${k}` : k, f])) };
    const oldIn = (draft.inputSchema ?? EMPTY_SCHEMA) as { properties?: Record<string, unknown>; required?: string[] };
    const oldOut = (draft.outputSchema ?? EMPTY_SCHEMA) as { properties?: Record<string, unknown> };
    await tenantDb(tenantId).workflowVersion.update({
      where: { id: draft.id },
      data: {
        definition: { ...def, dslVersion: 1, steps, forms } as never,
        inputSchema: { type: "object", properties: { ...(oldIn.properties ?? {}), ...inputSchema.properties }, required: [...new Set([...(oldIn.required ?? []), ...inputSchema.required])] } as never,
        outputSchema: { type: "object", properties: { ...(oldOut.properties ?? {}), ...outputSchema.properties }, required: [] } as never,
      },
    });
    if (s.intent) await tenantDb(tenantId).workflow.updateMany({ where: { id: s.workflowId }, data: { intent: s.intent } });
    await closeSession(sessionId);
    await audit({ actorId: user.id, action: "workflow.record", entity: "Workflow", entityId: s.workflowId, tenantId, meta: { steps: s.steps.length, appended: existing.length > 0 } });
    revalidatePath(`/t/${tenantId}/workflows/${s.workflowId}`);
    redirect(`/t/${tenantId}/workflows/${s.workflowId}?view=canvas`);
  }
  const wf = await tenantDb(tenantId).workflow.create({
    data: {
      name,
      slug: `${slugify(name)}-${randomBytes(2).toString("hex")}`,
      targetSystemId: s.targetId,
      createdById: user.id,
      latestVersionNo: 1,
      intent: s.intent ?? null,
      tags: ["live-recorder"],
      versions: { create: { tenantId, versionNo: 1, definition: { dslVersion: 1, steps: s.steps, forms: s.forms }, inputSchema, outputSchema, createdById: user.id, changelog: "Καταγραφή στην εφαρμογή" } },
    } as never,
    select: { id: true },
  });
  await closeSession(sessionId);
  await audit({ actorId: user.id, action: "workflow.record", entity: "Workflow", entityId: wf.id, tenantId, meta: { steps: s.steps.length, inputs: s.inputs.length } });
  revalidatePath(`/t/${tenantId}/workflows`);
  redirect(`/t/${tenantId}/workflows/${wf.id}?view=canvas`);
}

export async function cancelLiveRecordingAction(tenantId: string, sessionId: string): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  if (getSession(sessionId, tenantId, user.id)) await closeSession(sessionId);
  redirect(`/t/${tenantId}/recordings`);
}

/** Chrome DevTools Recorder JSON → new draft workflow (docs/04 §5). Password values are dropped. */
export async function importChromeRecordingAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const v = validate(z.object({ name: opt, targetId: req("Σύστημα‑στόχος") }), fd);
  if ("state" in v) return v.state;
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { file: "Επιλέξτε το αρχείο JSON της καταγραφής." } };
  if (file.size > 1_000_000) return { ok: false, errors: { file: "Το αρχείο ξεπερνά το 1 MB." } };
  const db = tenantDb(tenantId);
  const target = await db.targetSystem.findUnique({ where: { id: v.data.targetId }, select: { id: true, baseUrl: true } });
  if (!target) return { ok: false, errors: { targetId: "Το σύστημα δεν βρέθηκε" } };
  let imported: ReturnType<typeof importChromeRecording>;
  try {
    imported = importChromeRecording(JSON.parse(await file.text()), { baseUrl: target.baseUrl, name: v.data.name });
  } catch (err) {
    return { ok: false, errors: { file: err instanceof SyntaxError ? "Το αρχείο δεν είναι έγκυρο JSON." : (err as Error).message } };
  }
  // Recorded values are not kept as examples: they may be real customer data.
  const inputSchema = {
    type: "object",
    properties: Object.fromEntries(imported.inputs.map((i) => [i.key, { type: "string", title: i.label }])),
    required: imported.inputs.map((i) => i.key),
  };
  const wf = await db.workflow.create({
    data: {
      name: imported.name,
      slug: `${slugify(imported.name)}-${randomBytes(2).toString("hex")}`,
      targetSystemId: target.id,
      createdById: user.id,
      latestVersionNo: 1,
      tags: ["chrome-recorder"],
      versions: { create: { tenantId, versionNo: 1, definition: { dslVersion: 1, steps: imported.steps }, inputSchema, outputSchema: EMPTY_SCHEMA, createdById: user.id, changelog: "Εισαγωγή από Chrome Recorder" } },
    } as never,
    select: { id: true },
  });
  await audit({ actorId: user.id, action: "workflow.import", entity: "Workflow", entityId: wf.id, tenantId, meta: { source: "chrome-recorder", steps: imported.steps.length, skipped: imported.skipped } });
  revalidatePath(`/t/${tenantId}/workflows`);
  redirect(`/t/${tenantId}/workflows/${wf.id}?view=canvas`);
}

/** The editable version: the latest DRAFT, or a new draft copied from the latest version. */
async function draftOf(tenantId: string, workflowId: string, userId: string) {
  const db = tenantDb(tenantId);
  const latest = await db.workflowVersion.findFirst({ where: { workflowId }, orderBy: { versionNo: "desc" } });
  if (!latest) return null;
  if (latest.status === "DRAFT") return latest;
  const next = latest.versionNo + 1;
  const draft = await db.workflowVersion.create({
    data: { workflowId, versionNo: next, definition: latest.definition as never, inputSchema: latest.inputSchema as never, outputSchema: latest.outputSchema as never, createdById: userId } as never,
  });
  await db.workflow.updateMany({ where: { id: workflowId }, data: { latestVersionNo: next } });
  return draft;
}

const stepSchema = z.object({
  type: req("Τύπος"),
  label: req("Περιγραφή"),
  locator: opt,
  value: opt,
  timeout: z.coerce.number().int().min(1).max(600).optional(),
  optional: z.boolean().optional(),
  commit: z.boolean().optional(),
});

function toStep(id: string, d: z.infer<typeof stepSchema>): StepDef {
  return { id, type: d.type, label: d.label, ...(d.locator ? { locator: d.locator } : {}), ...(d.value ? { value: d.value } : {}), ...(d.timeout ? { timeoutMs: d.timeout * 1000 } : {}), ...(d.optional ? { optional: true } : {}), ...(d.commit ? { commitPoint: true } : {}) } as StepDef;
}

function mapSteps(steps: StepDef[], fn: (s: StepDef) => StepDef): StepDef[] {
  return steps.map((s) => fn({ ...s, ...(s.steps ? { steps: mapSteps(s.steps, fn) } : {}) }));
}

export async function addStepAction(tenantId: string, workflowId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const v = validate(stepSchema, fd);
  if ("state" in v) return v.state;
  const draft = await draftOf(tenantId, workflowId, user.id);
  if (!draft) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  const def = (draft.definition ?? {}) as Definition;
  const steps = [...(def.steps ?? []), toStep(`s${randomBytes(3).toString("hex")}`, v.data)];
  await tenantDb(tenantId).workflowVersion.update({ where: { id: draft.id }, data: { definition: { ...def, steps } as never } });
  return done(tenantId, `/workflows/${workflowId}`, `Το βήμα προστέθηκε στην έκδοση v${draft.versionNo}.`);
}

export async function editStepAction(tenantId: string, workflowId: string, stepId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const v = validate(stepSchema, fd);
  if ("state" in v) return v.state;
  const draft = await draftOf(tenantId, workflowId, user.id);
  if (!draft) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  const def = (draft.definition ?? {}) as Definition;
  const steps = mapSteps(def.steps ?? [], (s) => (s.id === stepId ? { ...toStep(s.id, v.data), ...(s.steps ? { steps: s.steps } : {}) } : s));
  await tenantDb(tenantId).workflowVersion.update({ where: { id: draft.id }, data: { definition: { ...def, steps } as never } });
  return done(tenantId, `/workflows/${workflowId}`, `Το βήμα αποθηκεύτηκε στην έκδοση v${draft.versionNo}.`);
}

export async function addInputAction(tenantId: string, workflowId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const v = validate(
    z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, "Κλειδί: λατινικά, ξεκινά με πεζό"), label: req("Ετικέτα"), type: z.enum(["string", "number", "boolean", "date", "array", "file"]), required: z.boolean().optional() }),
    fd,
  );
  if ("state" in v) return v.state;
  const draft = await draftOf(tenantId, workflowId, user.id);
  if (!draft) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  const schema = (draft.inputSchema ?? EMPTY_SCHEMA) as { properties?: Record<string, unknown>; required?: string[] };
  const type = v.data.type === "date" || v.data.type === "file" ? "string" : v.data.type;
  const properties = { ...(schema.properties ?? {}), [v.data.key]: { type, title: v.data.label, ...(v.data.type === "date" ? { format: "date" } : v.data.type === "file" ? { format: "file" } : {}) } };
  const required = [...new Set([...(schema.required ?? []).filter((k) => k !== v.data.key), ...(v.data.required ? [v.data.key] : [])])];
  await tenantDb(tenantId).workflowVersion.update({ where: { id: draft.id }, data: { inputSchema: { type: "object", properties, required } as never } });
  return done(tenantId, `/workflows/${workflowId}`, "Η είσοδος προστέθηκε.");
}

export async function testRunAction(tenantId: string, workflowVersionId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.runs.execute");
  const entries = [...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)] as const);
  // Lists (e.g. document lines) are typed as JSON in the test dialog.
  const input: Record<string, unknown> = Object.fromEntries(
    entries
      .filter(([k]) => !k.startsWith("secret__"))
      .map(([k, v]) => {
        if (/^\s*[[{]/.test(v)) {
          try {
            return [k, JSON.parse(v)];
          } catch {
            return [k, v];
          }
        }
        return [k, v];
      }),
  );
  // One-off login details for this test only: travel encrypted with the run input, used by the worker
  // instead of the stored credential, never shown (previewInput masks the key).
  const secrets = Object.fromEntries(entries.filter(([k, v]) => k.startsWith("secret__") && v).map(([k, v]) => [k.slice(8), v]));
  if (Object.keys(secrets).length) input.__secrets = secrets;
  const version = await tenantDb(tenantId).workflowVersion.findUnique({ where: { id: workflowVersionId }, select: { definition: true } });
  if (!((version?.definition as Definition | undefined)?.steps ?? []).length) {
    return { ok: false, message: "Η ροή δεν έχει βήματα ακόμα. Καταγράψτε τα με «Καταγραφή στην εφαρμογή» στη σελίδα της ροής." };
  }
  let runId: string;
  try {
    const run = await createRun({ tenantId, workflowVersionId, input, trigger: "UI_TEST", userId: user.id });
    await tenantDb(tenantId).workflowVersion.updateMany({ where: { id: workflowVersionId }, data: { lastTestRunId: run.id } });
    const v = await tenantDb(tenantId).workflowVersion.findUnique({ where: { id: workflowVersionId }, select: { workflowId: true } });
    if (v) revalidatePath(`/t/${tenantId}/workflows/${v.workflowId}`);
    runId = run.id;
  } catch (err) {
    return fail(err);
  }
  // Straight to the run: steps, logs and screenshots appear live there.
  redirect(`/t/${tenantId}/runs/${runId}`);
}

export async function submitVersionAction(tenantId: string, versionId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.submit");
  const note = String(fd.get("note") ?? "").trim() || undefined;
  const r = await tenantDb(tenantId).workflowVersion.updateMany({
    where: { id: versionId, status: "DRAFT" },
    data: { status: "PENDING_APPROVAL", submittedById: user.id, submittedAt: new Date(), ...(note ? { changelog: note } : {}) },
  });
  if (!r.count) return { ok: false, message: "Μόνο πρόχειρες εκδόσεις υποβάλλονται για έγκριση." };
  await audit({ actorId: user.id, action: "workflow.submit", entity: "WorkflowVersion", entityId: versionId, tenantId });
  revalidatePath(`/t/${tenantId}/approvals`);
  return done(tenantId, "/workflows", "Η έκδοση στάλθηκε για έγκριση.");
}

async function publish(tenantId: string, versionId: string, userId: string, note?: string): Promise<FormState> {
  const db = tenantDb(tenantId);
  const v = await db.workflowVersion.findUnique({ where: { id: versionId } });
  if (!v || (v.status !== "PENDING_APPROVAL" && v.status !== "DRAFT")) return { ok: false, message: "Η έκδοση δεν είναι προς δημοσίευση." };
  // No approval without a successful test run (docs/02 §3).
  const test = v.lastTestRunId ? await withTenantTx(tenantId, (tx) => tx.run.findUnique({ where: { id: v.lastTestRunId! }, select: { status: true } })) : null;
  if (test?.status !== "SUCCEEDED") return { ok: false, message: "Απαιτείται επιτυχημένη δοκιμαστική εκτέλεση της έκδοσης πριν τη δημοσίευση." };
  const checksum = createHash("sha256").update(JSON.stringify(v.definition)).digest("hex");
  await db.workflowVersion.updateMany({ where: { workflowId: v.workflowId, status: "PUBLISHED" }, data: { status: "DEPRECATED" } });
  await db.workflowVersion.update({
    where: { id: v.id },
    data: { status: "PUBLISHED", checksum, approvedById: userId, approvedAt: new Date(), publishedAt: new Date(), ...(note ? { changelog: note } : {}) },
  });
  await db.workflow.updateMany({ where: { id: v.workflowId }, data: { publishedVersionId: v.id } });
  await audit({ actorId: userId, action: "workflow.publish", entity: "WorkflowVersion", entityId: v.id, tenantId, meta: { version: v.versionNo } });
  // The published flow is an API method of its system's collection (created or re-pinned).
  const m = await ensureMethodForVersion(tenantId, v.id);
  const method = await db.method.findUnique({ where: { id: m.methodId }, select: { httpMethod: true, resource: true, slug: true, collection: { select: { slug: true } } } });
  const endpoint = method ? `${method.httpMethod} /api/v1/${method.collection.slug}/${method.resource ?? method.slug}` : "";
  await audit({ actorId: userId, action: m.created ? "method.create" : "method.upgrade", entity: "Method", entityId: m.methodId, tenantId, meta: { endpoint, breaking: m.breaking } });
  revalidatePath(`/t/${tenantId}/workflows/${v.workflowId}`);
  revalidatePath(`/t/${tenantId}/collections`, "layout");
  const api = m.created ? ` Δημιουργήθηκε η μέθοδος ${endpoint}.` : m.upgraded ? ` Η μέθοδος ${endpoint} εκτελεί πλέον τη v${v.versionNo}.` : m.breaking.length ? ` Η μέθοδος ${endpoint} μένει στην προηγούμενη έκδοση (${m.breaking.join(", ")}) — αναβαθμίστε τη από τη σελίδα της.` : "";
  return done(tenantId, "/approvals", `Η έκδοση v${v.versionNo} δημοσιεύτηκε.${api}`);
}

export async function approveVersionAction(tenantId: string, versionId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.approve");
  return publish(tenantId, versionId, user.id, String(fd.get("note") ?? "").trim() || undefined);
}

/** Direct publish by an admin who is also the author (recorded in the audit). */
export async function publishVersionAction(tenantId: string, versionId: string, p: FormState, fd: FormData): Result {
  return approveVersionAction(tenantId, versionId, p, fd);
}

export async function rejectVersionAction(tenantId: string, versionId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.workflows.approve");
  const v = validate(z.object({ note: req("Σχόλιο") }), fd);
  if ("state" in v) return v.state;
  const r = await tenantDb(tenantId).workflowVersion.updateMany({ where: { id: versionId, status: "PENDING_APPROVAL" }, data: { status: "DRAFT", rejectedReason: v.data.note } });
  if (!r.count) return { ok: false, message: "Η έκδοση δεν είναι σε αναμονή έγκρισης." };
  await audit({ actorId: user.id, action: "workflow.reject", entity: "WorkflowVersion", entityId: versionId, tenantId, meta: { note: v.data.note } });
  return done(tenantId, "/approvals", "Η έκδοση επέστρεψε σε πρόχειρο με το σχόλιό σας.");
}

// ───────────── Collections & methods ─────────────

export async function newCollectionAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.methods.manage");
  const v = validate(z.object({ name: req("Όνομα"), description: opt }), fd);
  if ("state" in v) return v.state;
  const c = await tenantDb(tenantId).methodCollection.create({ data: { name: v.data.name, slug: slugify(v.data.name), description: v.data.description } as never });
  await audit({ actorId: user.id, action: "collection.create", entity: "MethodCollection", entityId: c.id, tenantId, meta: { name: v.data.name } });
  return done(tenantId, "/collections", "Η συλλογή δημιουργήθηκε.");
}

export async function newMethodAction(tenantId: string, collectionId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.methods.manage");
  const v = validate(
    z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9-]*$/, "Κλειδί: λατινικά, ξεκινά με πεζό"), name: req("Όνομα"), workflowId: req("Ροή"), mode: z.enum(["async", "sync"], { message: "Επιλέξτε τρόπο" }) }),
    fd,
  );
  if ("state" in v) return v.state;
  const db = tenantDb(tenantId);
  const version = await db.workflowVersion.findUnique({ where: { id: v.data.workflowId }, select: { status: true } });
  if (version?.status !== "PUBLISHED") return { ok: false, errors: { workflowId: "Επιλέξτε δημοσιευμένη έκδοση" } };
  if (await db.method.findFirst({ where: { collectionId, slug: v.data.key } })) return { ok: false, errors: { key: "Υπάρχει ήδη μέθοδος με αυτό το κλειδί" } };
  const m = await db.method.create({
    data: { collectionId, workflowVersionId: v.data.workflowId, name: v.data.name, slug: v.data.key, defaultMode: v.data.mode === "sync" ? "SYNC" : "ASYNC" } as never,
  });
  await audit({ actorId: user.id, action: "method.create", entity: "Method", entityId: m.id, tenantId, meta: { name: v.data.name } });
  return done(tenantId, `/collections/${collectionId}`, "Η μέθοδος δημιουργήθηκε.");
}

export async function methodSettingsAction(tenantId: string, methodId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.methods.manage");
  const v = validate(z.object({ mode: z.enum(["async", "sync"]), syncTimeoutSec: int("Αναμονή sync", 5, 120), retries: int("Επαναλήψεις", 0, 5), screenshotsAlways: z.boolean().optional() }), fd);
  if ("state" in v) return v.state;
  await tenantDb(tenantId).method.updateMany({
    where: { id: methodId },
    data: { defaultMode: v.data.mode === "sync" ? "SYNC" : "ASYNC", syncTimeoutSec: v.data.syncTimeoutSec, maxAttempts: v.data.retries + 1, screenshotPolicy: v.data.screenshotsAlways ? "ALWAYS" : "ON_ERROR" },
  });
  await audit({ actorId: user.id, action: "method.update", entity: "Method", entityId: methodId, tenantId });
  return done(tenantId, "/collections", "Οι ρυθμίσεις αποθηκεύτηκαν.");
}

export async function upgradeMethodAction(tenantId: string, methodId: string): Result {
  const user = await guard(tenantId, "tenant.methods.manage");
  const db = tenantDb(tenantId);
  const m = await db.method.findUnique({ where: { id: methodId }, select: { workflowVersion: { select: { workflowId: true } } } });
  if (!m) return { ok: false, message: "Η μέθοδος δεν βρέθηκε." };
  const latest = await db.workflowVersion.findFirst({ where: { workflowId: m.workflowVersion.workflowId, status: "PUBLISHED" }, orderBy: { versionNo: "desc" } });
  if (!latest) return { ok: false, message: "Δεν υπάρχει δημοσιευμένη έκδοση." };
  await db.method.updateMany({ where: { id: methodId }, data: { workflowVersionId: latest.id } });
  await audit({ actorId: user.id, action: "method.upgrade", entity: "Method", entityId: methodId, tenantId, meta: { version: latest.versionNo } });
  return done(tenantId, "/collections", `Η μέθοδος εκτελεί πλέον την v${latest.versionNo}.`);
}

// ───────────── Runs ─────────────

export async function manualRunAction(tenantId: string, methodId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.runs.execute");
  const m = await tenantDb(tenantId).method.findUnique({ where: { id: methodId }, select: { workflowVersionId: true } });
  if (!m) return { ok: false, message: "Η μέθοδος δεν βρέθηκε." };
  const entries = [...fd.entries()].filter(([k]) => !k.startsWith("$") && k !== "externalRef").map(([k, v]) => [k, String(v)]);
  try {
    const run = await createRun({ tenantId, methodId, workflowVersionId: m.workflowVersionId, input: Object.fromEntries(entries), trigger: "UI_MANUAL", userId: user.id, externalRef: String(fd.get("externalRef") ?? "") || null });
    return done(tenantId, "/runs", `Η εκτέλεση μπήκε στην ουρά (${run.id}).`);
  } catch (err) {
    return fail(err);
  }
}

export async function retryRunAction(tenantId: string, runId: string): Result {
  const user = await guard(tenantId, "tenant.runs.retry");
  const r = await withTenantTx(tenantId, (tx) => tx.run.findUnique({ where: { id: runId }, select: { status: true } }));
  if (r?.status !== "FAILED") return { ok: false, message: "Μόνο αποτυχημένες εκτελέσεις επαναλαμβάνονται." };
  // The worker decrypts the original input; here only a new queued run referencing it.
  const orig = await withTenantTx(tenantId, (tx) => tx.run.findUniqueOrThrow({ where: { id: runId }, select: { workflowVersionId: true, methodId: true, inputEnc: true, inputPreview: true, externalRef: true } }));
  try {
    const { assertQuota } = await import("@/lib/runs/create");
    await assertQuota(tenantId);
    const run = await withTenantTx(tenantId, (tx) =>
      tx.run.create({
        data: { tenantId, workflowVersionId: orig.workflowVersionId, methodId: orig.methodId, trigger: "RETRY", retryOfRunId: runId, inputEnc: orig.inputEnc, inputPreview: orig.inputPreview as never, externalRef: orig.externalRef, createdByUserId: user.id },
        select: { id: true },
      }),
    );
    await enqueueRun(tenantId, run.id);
    await audit({ actorId: user.id, action: "run.retry", entity: "Run", entityId: run.id, tenantId, meta: { of: runId } });
    return done(tenantId, "/runs", `Νέα εκτέλεση στην ουρά (${run.id}).`);
  } catch (err) {
    return fail(err);
  }
}

export async function cancelRunAction(tenantId: string, runId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.runs.retry");
  const r = await withTenantTx(tenantId, (tx) =>
    tx.run.updateMany({ where: { id: runId, status: { in: ["QUEUED", "RETRY_SCHEDULED", "NEEDS_ATTENTION", "HELD", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } }),
  );
  if (!r.count) return { ok: false, message: "Η εκτέλεση δεν μπορεί να ακυρωθεί." };
  await audit({ actorId: user.id, action: "run.cancel", entity: "Run", entityId: runId, tenantId, meta: { reason: String(fd.get("reason") ?? "") } });
  return done(tenantId, `/runs/${runId}`, "Η εκτέλεση ακυρώθηκε.");
}

/** OTP / human input: delivered to the waiting worker through pg_notify — never stored (docs/22). */
export async function resumeRunAction(tenantId: string, runId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.runs.execute");
  const v = validate(z.object({ otp: z.string().regex(/^\d{4,8}$/, "Ο κωδικός έχει 4–8 ψηφία") }), fd);
  if ("state" in v) return v.state;
  const run = await withTenantTx(tenantId, (tx) => tx.run.findUnique({ where: { id: runId }, select: { status: true, workerId: true } }));
  if (run?.status !== "NEEDS_ATTENTION") return { ok: false, message: "Η εκτέλεση δεν περιμένει κωδικό." };
  const secret = process.env.ASSIST_SHARED_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev";
  const sealed = encrypt(v.data.otp, `${tenantId}:${runId}:otp`);
  const payload = JSON.stringify({ type: "human_input", runId, tenantId, sealed, sig: createHmac("sha256", secret).update(runId).digest("hex").slice(0, 16) });
  await prisma.$executeRaw`select pg_notify('run_events', ${payload})`;
  await audit({ actorId: user.id, action: "run.human_input", entity: "Run", entityId: runId, tenantId });
  return done(tenantId, "/attention", "Ο κωδικός στάλθηκε· η εκτέλεση συνεχίζει.");
}

// ───────────── Jobs ─────────────

export async function newJobAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.runs.execute");
  const v = validate(z.object({ name: req("Όνομα"), methodId: req("Μέθοδος"), stopOnErrorRate: z.boolean().optional() }), fd);
  if ("state" in v) return v.state;
  const m = await tenantDb(tenantId).method.findUnique({ where: { id: v.data.methodId }, select: { id: true } });
  if (!m) return { ok: false, message: "Η μέθοδος δεν βρέθηκε." };
  // Parsing and the item runs happen in the worker (`imports` queue, P11); the job waits as PENDING.
  const job = await tenantDb(tenantId).job.create({
    data: { methodId: m.id, name: v.data.name, source: "XLSX", status: "PENDING", createdByUserId: user.id, options: { stopOnErrorRate: v.data.stopOnErrorRate ? 0.2 : null } } as never,
  });
  await audit({ actorId: user.id, action: "job.create", entity: "Job", entityId: job.id, tenantId, meta: { name: v.data.name } });
  return done(tenantId, "/jobs", "Η μαζική εργασία δημιουργήθηκε.");
}

export async function cancelJobAction(tenantId: string, jobId: string): Result {
  const user = await guard(tenantId, "tenant.runs.retry");
  const r = await tenantDb(tenantId).job.updateMany({ where: { id: jobId, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
  if (!r.count) return { ok: false, message: "Η εργασία δεν μπορεί να ακυρωθεί." };
  await withTenantTx(tenantId, (tx) => tx.run.updateMany({ where: { jobId, status: { in: ["QUEUED", "RETRY_SCHEDULED"] } }, data: { status: "CANCELLED", finishedAt: new Date() } }));
  await audit({ actorId: user.id, action: "job.cancel", entity: "Job", entityId: jobId, tenantId });
  return done(tenantId, `/jobs/${jobId}`, "Η εργασία ακυρώθηκε.");
}

export async function retryFailedJobAction(tenantId: string, jobId: string): Result {
  const user = await guard(tenantId, "tenant.runs.retry");
  const failed = await withTenantTx(tenantId, (tx) => tx.run.findMany({ where: { jobId, status: "FAILED" }, select: { id: true } }));
  if (!failed.length) return { ok: false, message: "Δεν υπάρχουν αποτυχημένες γραμμές." };
  let queued = 0;
  for (const r of failed) if ((await retryRunAction(tenantId, r.id)).ok) queued++;
  await audit({ actorId: user.id, action: "job.retry_failed", entity: "Job", entityId: jobId, tenantId, meta: { queued } });
  return done(tenantId, `/jobs/${jobId}`, `${queued} αποτυχημένες γραμμές μπήκαν ξανά στην ουρά.`);
}

// ───────────── API keys & webhooks ─────────────

export async function createApiKeyAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.apikeys.manage");
  const v = validate(z.object({ name: req("Όνομα"), scopes: list("δικαιώματα"), collections: optList, expiresAt: opt, ipAllowlist: opt }), fd);
  if ("state" in v) return v.state;
  const key = `dgc_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(`${process.env.API_KEY_PEPPER ?? ""}${key}`).digest("hex");
  const k = await tenantDb(tenantId).apiKey.create({
    data: {
      name: v.data.name,
      prefix: key.slice(0, 8),
      hash,
      createdById: user.id,
      scopes: v.data.scopes,
      collectionIds: v.data.collections,
      ipAllowlist: lines(v.data.ipAllowlist),
      expiresAt: v.data.expiresAt ? new Date(`${v.data.expiresAt}T23:59:59`) : null,
    } as never,
  });
  await audit({ actorId: user.id, action: "apikey.create", entity: "ApiKey", entityId: k.id, tenantId, meta: { name: v.data.name, scopes: v.data.scopes } });
  revalidatePath(`/t/${tenantId}/settings/api-keys`);
  return { ok: true, message: "Το κλειδί δημιουργήθηκε.", reveal: { label: "Κλειδί API", value: key, note: "Εμφανίζεται μόνο αυτή τη φορά. Αποθηκεύστε το σε ασφαλές σημείο." } };
}

export async function revokeApiKeyAction(tenantId: string, id: string): Result {
  const user = await guard(tenantId, "tenant.apikeys.manage");
  const r = await tenantDb(tenantId).apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) return { ok: false, message: "Το κλειδί δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "apikey.revoke", entity: "ApiKey", entityId: id, tenantId });
  return done(tenantId, "/settings/api-keys", "Το κλειδί ανακλήθηκε.");
}

export async function createWebhookAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const user = await guard(tenantId, "tenant.webhooks.manage");
  const v = validate(z.object({ url: z.url({ message: "Διεύθυνση: μη έγκυρο URL" }), events: list("γεγονότα") }), fd);
  if ("state" in v) return v.state;
  if (!v.data.url.startsWith("https://") || isPrivateHost(v.data.url)) return { ok: false, errors: { url: "Μόνο δημόσιες διευθύνσεις https" } };
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const w = await tenantDb(tenantId).webhookEndpoint.create({ data: { url: v.data.url, events: v.data.events, secretEnc: "pending" } as never, select: { id: true } });
  await tenantDb(tenantId).webhookEndpoint.updateMany({ where: { id: w.id }, data: { secretEnc: encrypt(secret, `${tenantId}:${w.id}`) } });
  await audit({ actorId: user.id, action: "webhook.create", entity: "WebhookEndpoint", entityId: w.id, tenantId, meta: { url: v.data.url } });
  revalidatePath(`/t/${tenantId}/settings/webhooks`);
  return { ok: true, message: "Το webhook δημιουργήθηκε.", reveal: { label: "Secret υπογραφής (HMAC‑SHA256)", value: secret, note: "Εμφανίζεται μόνο αυτή τη φορά." } };
}

export async function redeliverAction(tenantId: string, deliveryId: string): Result {
  const user = await guard(tenantId, "tenant.webhooks.manage");
  const r = await tenantDb(tenantId).webhookDelivery.updateMany({ where: { id: deliveryId }, data: { status: "PENDING", nextAttemptAt: new Date() } });
  if (!r.count) return { ok: false, message: "Η αποστολή δεν βρέθηκε." };
  await audit({ actorId: user.id, action: "webhook.redeliver", entity: "WebhookDelivery", entityId: deliveryId, tenantId });
  return done(tenantId, "/settings/webhooks", "Η αποστολή προγραμματίστηκε ξανά.");
}

// ───────────── Members ─────────────

const ROLE = z.enum(["TENANT_ADMIN", "TENANT_DESIGNER", "TENANT_OPERATOR", "TENANT_USER"], { message: "Επιλέξτε ρόλο" });

export async function inviteMemberAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const actor = await guard(tenantId, "tenant.users.manage");
  const v = validate(z.object({ email: z.email({ message: "Μη έγκυρο email" }).transform((e) => e.toLowerCase()), role: ROLE }), fd);
  if ("state" in v) return v.state;
  const existing = await prisma.user.findUnique({ where: { email: v.data.email } });
  if (existing && existing.platformRole !== "USER") return { ok: false, errors: { email: "Ο λογαριασμός ανήκει σε διαχειριστή πλατφόρμας" } };
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        name: v.data.email.split("@")[0],
        email: v.data.email,
        emailVerified: true,
        accounts: { create: { providerId: "credential", accountId: v.data.email, password: await hashPassword(randomBytes(24).toString("base64url")) } },
      },
    }));
  if (!existing) await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { accountId: user.id } });
  await prisma.membership.upsert({ where: { userId_tenantId: { userId: user.id, tenantId } }, update: { role: v.data.role }, create: { userId: user.id, tenantId, role: v.data.role } });
  await audit({ actorId: actor.id, action: "membership.invite", entity: "User", entityId: user.id, tenantId, meta: { email: v.data.email, role: v.data.role } });
  const mail = existing ? { ok: true } : await sendWelcomeEmail(user.id, tenantId);
  revalidatePath(`/t/${tenantId}/settings/members`);
  return { ok: true, message: mail.ok ? "Η πρόσκληση στάλθηκε." : "Το μέλος προστέθηκε, αλλά το email δεν στάλθηκε." };
}

export async function changeRoleAction(tenantId: string, userId: string, _p: FormState, fd: FormData): Result {
  const actor = await guard(tenantId, "tenant.users.manage");
  const v = validate(z.object({ role: ROLE }), fd);
  if ("state" in v) return v.state;
  if (userId === actor.id && v.data.role !== "TENANT_ADMIN") return { ok: false, message: "Δεν μπορείτε να αφαιρέσετε από τον εαυτό σας τον ρόλο διαχειριστή." };
  const r = await tenantDb(tenantId).membership.updateMany({ where: { userId }, data: { role: v.data.role } });
  if (!r.count) return { ok: false, message: "Το μέλος δεν βρέθηκε." };
  await audit({ actorId: actor.id, action: "membership.role", entity: "User", entityId: userId, tenantId, meta: { role: v.data.role } });
  return done(tenantId, "/settings/members", "Ο ρόλος άλλαξε.");
}

export async function removeMemberAction(tenantId: string, userId: string): Result {
  const actor = await guard(tenantId, "tenant.users.manage");
  if (userId === actor.id) return { ok: false, message: "Δεν μπορείτε να αφαιρέσετε τον εαυτό σας." };
  const r = await tenantDb(tenantId).membership.deleteMany({ where: { userId } });
  if (!r.count) return { ok: false, message: "Το μέλος δεν βρέθηκε." };
  await audit({ actorId: actor.id, action: "membership.remove", entity: "User", entityId: userId, tenantId });
  return done(tenantId, "/settings/members", "Το μέλος αφαιρέθηκε.");
}

// ───────────── Settings, usage, notifications ─────────────

export async function tenantSettingsAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const actor = await guard(tenantId, "tenant.settings.manage");
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true, plan: { select: { logRetentionDays: true, artifactRetentionDays: true } } } });
  const maxLogs = t.plan?.logRetentionDays ?? 30;
  const maxArtifacts = t.plan?.artifactRetentionDays ?? 7;
  const v = validate(
    z.object({
      timezone: z.enum(["Europe/Athens", "Europe/Nicosia"], { message: "Επιλέξτε ζώνη ώρας" }),
      logRetentionDays: int("Διατήρηση logs", 7, maxLogs),
      artifactRetentionDays: int("Διατήρηση στιγμιοτύπων", 1, maxArtifacts),
      emailOnFailure: z.boolean().optional(),
      emailOnAttention: z.boolean().optional(),
      teams: z.boolean().optional(),
    }),
    fd,
  );
  if ("state" in v) return v.state;
  const settings = { ...((t.settings ?? {}) as object), ...v.data, emailOnFailure: !!v.data.emailOnFailure, emailOnAttention: !!v.data.emailOnAttention, teams: !!v.data.teams };
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings } });
  await audit({ actorId: actor.id, action: "tenant.settings", entity: "Tenant", entityId: tenantId, tenantId, meta: v.data });
  return done(tenantId, "/settings", "Οι ρυθμίσεις αποθηκεύτηκαν.");
}

export async function buyCreditsAction(tenantId: string, _p: FormState, fd: FormData): Result {
  const actor = await guard(tenantId, "tenant.billing.manage");
  const v = validate(z.object({ pack: req("Πακέτο") }), fd);
  if ("state" in v) return v.state;
  const pack = await prisma.runCreditPack.findFirst({ where: { id: v.data.pack, active: true } });
  if (!pack) return { ok: false, errors: { pack: "Το πακέτο δεν είναι διαθέσιμο" } };
  // Approved by DGsoft in /admin; the credits are added through lib/billing on approval (docs/14 §2).
  const r = await tenantDb(tenantId).runCreditRequest.create({ data: { packId: pack.id, runs: pack.runs, priceEur: pack.priceEur, status: "PENDING", requestedById: actor.id } as never });
  await audit({ actorId: actor.id, action: "credits.request", entity: "RunCreditRequest", entityId: r.id, tenantId, meta: { runs: pack.runs } });
  return done(tenantId, "/usage", "Το αίτημα στάλθηκε στη DGsoft· οι εκτελέσεις προστίθενται μετά την έγκριση.");
}

export async function markNotificationsReadAction(tenantId: string): Promise<void> {
  const user = await guard(tenantId, "tenant.dashboards.view");
  await tenantDb(tenantId).notification.updateMany({ where: { readAt: null, OR: [{ userId: user.id }, { userId: null }] }, data: { readAt: new Date() } });
  revalidatePath(`/t/${tenantId}`, "layout");
}

// ───────────── Editor (list drag-and-drop, canvas) ─────────────

const dslStep: z.ZodType<StepDef> = z.lazy(() =>
  z.looseObject({ id: z.string().min(1).max(64), type: z.string().min(1).max(40), label: z.string().max(200).optional(), steps: z.array(dslStep).optional() }),
) as z.ZodType<StepDef>;
const dslDefinition = z.looseObject({ dslVersion: z.number().int().optional(), steps: z.array(dslStep).max(2000) });

export type SaveResult = { ok: true; updatedAt: string; versionNo: number } | { ok: false; message: string; conflict?: boolean };

/**
 * Saves a whole definition produced by lib/dsl/commands on the client. Optimistic concurrency:
 * `expectedUpdatedAt` must match the draft, otherwise someone else saved in between.
 */
export async function saveDefinitionAction(tenantId: string, workflowId: string, expectedUpdatedAt: string, definition: unknown): Promise<SaveResult> {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const parsed = dslDefinition.safeParse(definition);
  if (!parsed.success) return { ok: false, message: "Μη έγκυρος ορισμός ροής." };
  const db = tenantDb(tenantId);
  const latest = await db.workflowVersion.findFirst({ where: { workflowId }, orderBy: { versionNo: "desc" }, select: { status: true, updatedAt: true } });
  if (!latest) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  if (latest.status === "DRAFT" && latest.updatedAt.toISOString() !== expectedUpdatedAt) {
    return { ok: false, conflict: true, message: "Η ροή άλλαξε από άλλον χρήστη. Ανανεώστε τη σελίδα." };
  }
  const draft = await draftOf(tenantId, workflowId, user.id);
  if (!draft) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  const r = await db.workflowVersion.update({ where: { id: draft.id }, data: { definition: parsed.data as never }, select: { updatedAt: true, versionNo: true } });
  revalidatePath(`/t/${tenantId}/workflows/${workflowId}`);
  return { ok: true, updatedAt: r.updatedAt.toISOString(), versionNo: r.versionNo };
}

export async function deleteStepAction(tenantId: string, workflowId: string, stepId: string): Result {
  const user = await guard(tenantId, "tenant.workflows.edit");
  const draft = await draftOf(tenantId, workflowId, user.id);
  if (!draft) return { ok: false, message: "Η ροή δεν βρέθηκε." };
  const def = (draft.definition ?? {}) as Definition;
  const prune = (steps: StepDef[]): StepDef[] => steps.filter((s) => s.id !== stepId).map((s) => (s.steps ? { ...s, steps: prune(s.steps) } : s));
  await tenantDb(tenantId).workflowVersion.update({ where: { id: draft.id }, data: { definition: { ...def, steps: prune(def.steps ?? []) } as never } });
  revalidatePath(`/t/${tenantId}/workflows/${workflowId}`);
  return { ok: true, message: `Το βήμα αφαιρέθηκε (v${draft.versionNo}).` };
}
