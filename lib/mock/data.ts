import "server-only";
import type { JobStatus, RunStatus, TenantRoleKey, VersionStatus } from "@/lib/labels";

// Mock data of the tenant area (UI phase). Replaced by tenantDb()/withTenantTx() queries when the
// screens are connected — the shapes below are what the pages expect from those queries.

const now = new Date("2026-10-25T10:30:00+03:00").getTime();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

export type Target = {
  id: string;
  name: string;
  baseUrl: string;
  origins: string[];
  maxConcurrency: number;
  credentials: number;
  workflows: number;
  successRate: number;
  lastRunAt: string;
  health: "ok" | "degraded" | "down";
};

export const targets: Target[] = [
  { id: "tg_taxis", name: "TAXISnet — Μητρώο", baseUrl: "https://www1.aade.gr/taxisnet", origins: ["www1.aade.gr", "login.gsis.gr"], maxConcurrency: 2, credentials: 3, workflows: 4, successRate: 97.4, lastRunAt: ago(4), health: "ok" },
  { id: "tg_opske", name: "ΟΠΣΚΕ — Υποβολή δαπανών", baseUrl: "https://logon.ops.gr", origins: ["logon.ops.gr"], maxConcurrency: 1, credentials: 1, workflows: 3, successRate: 88.1, lastRunAt: ago(36), health: "degraded" },
  { id: "tg_erp", name: "Πύλη προμηθευτή — Παραγγελίες", baseUrl: "https://supplier.example.gr", origins: ["supplier.example.gr"], maxConcurrency: 4, credentials: 2, workflows: 2, successRate: 99.2, lastRunAt: ago(120), health: "ok" },
  { id: "tg_sandbox", name: "Sandbox (δοκιμές)", baseUrl: "http://localhost:4100", origins: ["localhost:4100"], maxConcurrency: 8, credentials: 1, workflows: 1, successRate: 100, lastRunAt: ago(900), health: "ok" },
];

export type Credential = { id: string; targetId: string; label: string; username: string; updatedAt: string; lastUsedAt: string | null };
export const credentials: Credential[] = [
  { id: "cr_1", targetId: "tg_taxis", label: "Λογιστήριο — κύριος", username: "acc•••01", updatedAt: ago(60 * 24 * 12), lastUsedAt: ago(4) },
  { id: "cr_2", targetId: "tg_taxis", label: "Λογιστήριο — εφεδρικός", username: "acc•••02", updatedAt: ago(60 * 24 * 40), lastUsedAt: ago(60 * 26) },
  { id: "cr_3", targetId: "tg_taxis", label: "Τμήμα μισθοδοσίας", username: "pay•••11", updatedAt: ago(60 * 24 * 3), lastUsedAt: null },
  { id: "cr_4", targetId: "tg_opske", label: "Υπεύθυνος έργου", username: "ops•••77", updatedAt: ago(60 * 24 * 8), lastUsedAt: ago(36) },
];

export type Recording = { id: string; name: string; targetId: string; steps: number; status: "RECORDING" | "COMPLETED" | "CONVERTED"; createdBy: string; createdAt: string };
export const recordings: Recording[] = [
  { id: "rc_1", name: "Καταχώριση πελάτη", targetId: "tg_taxis", steps: 14, status: "CONVERTED", createdBy: "Μαρία Παππά", createdAt: ago(60 * 24 * 9) },
  { id: "rc_2", name: "Υποβολή δαπάνης", targetId: "tg_opske", steps: 22, status: "COMPLETED", createdBy: "Νίκος Γεωργίου", createdAt: ago(60 * 5) },
  { id: "rc_3", name: "Νέα παραγγελία", targetId: "tg_erp", steps: 9, status: "RECORDING", createdBy: "Μαρία Παππά", createdAt: ago(12) },
];

export type Step = { id: string; no: string; type: string; label: string; locator?: string; value?: string; optional?: boolean; children?: Step[] };
export type Workflow = {
  id: string;
  name: string;
  targetId: string;
  version: number;
  status: VersionStatus;
  methods: number;
  updatedAt: string;
  updatedBy: string;
  inputs: { key: string; label: string; type: string; required: boolean }[];
  outputs: string[];
  steps: Step[];
};

export const workflows: Workflow[] = [
  {
    id: "wf_customer",
    name: "Καταχώριση πελάτη",
    targetId: "tg_taxis",
    version: 4,
    status: "PUBLISHED",
    methods: 2,
    updatedAt: ago(60 * 3),
    updatedBy: "Μαρία Παππά",
    inputs: [
      { key: "afm", label: "ΑΦΜ", type: "string", required: true },
      { key: "name", label: "Επωνυμία", type: "string", required: true },
      { key: "city", label: "Πόλη", type: "string", required: false },
      { key: "contacts", label: "Επαφές", type: "array", required: false },
    ],
    outputs: ["customerCode"],
    steps: [
      { id: "s1", no: "01", type: "goto", label: "Πλοήγηση στη φόρμα", value: "/customers/new" },
      { id: "s2", no: "02", type: "fill", label: "Συμπλήρωση ΑΦΜ", locator: 'label "ΑΦΜ"', value: "{{input.afm}}" },
      { id: "s3", no: "03", type: "fill", label: "Επωνυμία", locator: 'label "Επωνυμία"', value: "{{input.name}}" },
      { id: "s4", no: "04", type: "fill", label: "Πόλη (όταν υπάρχει)", locator: 'label "Πόλη"', value: "{{input.city}}", optional: true },
      {
        id: "s5",
        no: "05",
        type: "forEach",
        label: "Για κάθε επαφή",
        value: "{{input.contacts}}",
        children: [{ id: "s5a", no: "05a", type: "click", label: "Νέα επαφή", locator: 'role button "Προσθήκη επαφής"' }],
      },
      { id: "s6", no: "06", type: "click", label: "Αποθήκευση", locator: 'role button "Αποθήκευση"' },
      { id: "s7", no: "07", type: "assert", label: "Έλεγχος μηνυμάτων", locator: "css .alert-danger" },
      { id: "s8", no: "08", type: "extract", label: "Επιβεβαίωση — κωδικός πελάτη", locator: "testid entry-id" },
    ],
  },
  { id: "wf_expense", name: "Υποβολή δαπάνης ΟΠΣΚΕ", targetId: "tg_opske", version: 2, status: "PENDING_APPROVAL", methods: 1, updatedAt: ago(50), updatedBy: "Νίκος Γεωργίου", inputs: [{ key: "project", label: "Κωδικός έργου", type: "string", required: true }, { key: "amount", label: "Ποσό", type: "number", required: true }], outputs: ["submissionId"], steps: [] },
  { id: "wf_order", name: "Νέα παραγγελία προμηθευτή", targetId: "tg_erp", version: 1, status: "DRAFT", methods: 0, updatedAt: ago(15), updatedBy: "Μαρία Παππά", inputs: [{ key: "sku", label: "Κωδικός είδους", type: "string", required: true }], outputs: [], steps: [] },
  { id: "wf_vat", name: "Έλεγχος ΑΦΜ", targetId: "tg_taxis", version: 7, status: "PUBLISHED", methods: 1, updatedAt: ago(60 * 24 * 20), updatedBy: "Μαρία Παππά", inputs: [{ key: "afm", label: "ΑΦΜ", type: "string", required: true }], outputs: ["valid", "name"], steps: [] },
];

export type Version = { version: number; status: VersionStatus; author: string; createdAt: string; note: string; checksum: string };
export const versions: Version[] = [
  { version: 4, status: "PUBLISHED", author: "Μαρία Παππά", createdAt: ago(60 * 3), note: "Νέο βήμα επαφών", checksum: "a41f…9c2e" },
  { version: 3, status: "DEPRECATED", author: "Μαρία Παππά", createdAt: ago(60 * 24 * 6), note: "Εναλλακτικός επιλογέας ΑΦΜ", checksum: "7d10…be04" },
  { version: 2, status: "ARCHIVED", author: "Νίκος Γεωργίου", createdAt: ago(60 * 24 * 15), note: "Έλεγχος μηνυμάτων σφάλματος", checksum: "c3aa…1f77" },
  { version: 1, status: "ARCHIVED", author: "Μαρία Παππά", createdAt: ago(60 * 24 * 21), note: "Από καταγραφή", checksum: "0b9e…44d1" },
];

export type Method = { id: string; collectionId: string; key: string; name: string; workflowId: string; pinnedVersion: number; latestVersion: number; mode: "async" | "sync"; calls7d: number; errorRate: number; status: "ACTIVE" | "PAUSED" };
export type Collection = { id: string; name: string; description: string; methods: number; calls7d: number };

export const collections: Collection[] = [
  { id: "co_tax", name: "Φορολογικά", description: "Μέθοδοι για TAXISnet", methods: 2, calls7d: 4210 },
  { id: "co_ops", name: "Έργα ΕΣΠΑ", description: "Υποβολές στο ΟΠΣΚΕ", methods: 1, calls7d: 318 },
  { id: "co_sup", name: "Προμηθευτές", description: "Παραγγελίες σε πύλες προμηθευτών", methods: 1, calls7d: 76 },
];

export const methods: Method[] = [
  { id: "me_create_customer", collectionId: "co_tax", key: "createCustomer", name: "Καταχώριση πελάτη", workflowId: "wf_customer", pinnedVersion: 3, latestVersion: 4, mode: "async", calls7d: 3120, errorRate: 2.6, status: "ACTIVE" },
  { id: "me_check_vat", collectionId: "co_tax", key: "checkVat", name: "Έλεγχος ΑΦΜ", workflowId: "wf_vat", pinnedVersion: 7, latestVersion: 7, mode: "sync", calls7d: 1090, errorRate: 0.4, status: "ACTIVE" },
  { id: "me_expense", collectionId: "co_ops", key: "submitExpense", name: "Υποβολή δαπάνης", workflowId: "wf_expense", pinnedVersion: 1, latestVersion: 2, mode: "async", calls7d: 318, errorRate: 11.9, status: "PAUSED" },
  { id: "me_order", collectionId: "co_sup", key: "placeOrder", name: "Νέα παραγγελία", workflowId: "wf_order", pinnedVersion: 1, latestVersion: 1, mode: "async", calls7d: 76, errorRate: 0.8, status: "ACTIVE" },
];

export type Run = {
  id: string;
  methodId: string;
  status: RunStatus;
  externalRef: string | null;
  durationMs: number | null;
  createdAt: string;
  error: { code: string; message: string; step: string } | null;
  trigger: "api" | "job" | "manual";
};

const RUN_SEED: [RunStatus, string, number | null, Run["error"]][] = [
  ["SUCCEEDED", "me_create_customer", 18_400, null],
  ["FAILED", "me_create_customer", 22_100, { code: "E_TARGET_VALIDATION", message: "Το σύστημα απάντησε: «Μη έγκυρο ΑΦΜ»", step: "07" }],
  ["RUNNING", "me_check_vat", null, null],
  ["NEEDS_ATTENTION", "me_expense", null, { code: "E_HUMAN_REQUIRED", message: "Απαιτείται κωδικός OTP", step: "03" }],
  ["SUCCEEDED", "me_check_vat", 3_200, null],
  ["QUEUED", "me_create_customer", null, null],
  ["RETRY_SCHEDULED", "me_order", 9_800, { code: "E_TIMEOUT", message: "Λήξη χρόνου στο βήμα 04", step: "04" }],
  ["SUCCEEDED", "me_create_customer", 17_900, null],
  ["HELD", "me_expense", null, null],
  ["FAILED", "me_expense", 31_000, { code: "E_LOCATOR_NOT_FOUND", message: "Δεν βρέθηκε το στοιχείο «Υποβολή»", step: "11" }],
  ["CANCELLED", "me_order", null, null],
  ["SUCCEEDED", "me_order", 12_300, null],
];

export const runs: Run[] = RUN_SEED.map(([status, methodId, durationMs, error], i) => ({
  id: `run_${(9071 - i).toString(36)}${i}`,
  methodId,
  status,
  externalRef: i % 3 === 2 ? null : `INV-2026-${(48120 - i * 7).toString()}`,
  durationMs,
  createdAt: ago(i * 11 + 2),
  error,
  trigger: i % 4 === 0 ? "job" : i % 4 === 3 ? "manual" : "api",
}));

export type RunStep = { no: string; label: string; status: "ok" | "failed" | "skipped" | "pending"; durationMs: number; fallback?: boolean };
export const runSteps = (run: Run): RunStep[] => {
  const failAt = run.error ? Number(run.error.step) : 99;
  return workflows[0].steps.map((s, i) => {
    const n = Number(s.no.replace(/\D/g, "")) || i + 1;
    const status = n < failAt ? (s.optional && i % 2 ? "skipped" : "ok") : n === failAt ? "failed" : "pending";
    return { no: s.no, label: s.label, status, durationMs: 400 + ((i * 377) % 2200), fallback: i === 1 };
  });
};

export const runLogs = (run: Run) => [
  { at: run.createdAt, level: "info", message: "Ξεκίνησε εκτέλεση (worker w-02, browser context #3)" },
  { at: run.createdAt, level: "info", message: "Σύνδεση με διαπιστευτήριο «Λογιστήριο — κύριος» (••••)" },
  { at: run.createdAt, level: "warn", message: "Βήμα 02: χρήση εναλλακτικού επιλογέα css input[name=afm]" },
  ...(run.error ? [{ at: run.createdAt, level: "error", message: `${run.error.code}: ${run.error.message}` }] : [{ at: run.createdAt, level: "info", message: "Ολοκληρώθηκε" }]),
];

export type Job = { id: string; name: string; methodId: string; status: JobStatus; total: number; done: number; failed: number; createdAt: string; createdBy: string; file: string };
export const jobs: Job[] = [
  { id: "jb_1", name: "Πελάτες Οκτωβρίου", methodId: "me_create_customer", status: "RUNNING", total: 1200, done: 742, failed: 18, createdAt: ago(40), createdBy: "Ελένη Κ.", file: "pelates-oktovrios.xlsx" },
  { id: "jb_2", name: "Έλεγχος ΑΦΜ προμηθευτών", methodId: "me_check_vat", status: "COMPLETED", total: 380, done: 380, failed: 0, createdAt: ago(60 * 26), createdBy: "Ελένη Κ.", file: "promitheftes.csv" },
  { id: "jb_3", name: "Δαπάνες Q3", methodId: "me_expense", status: "COMPLETED_WITH_ERRORS", total: 64, done: 64, failed: 7, createdAt: ago(60 * 24 * 4), createdBy: "Νίκος Γεωργίου", file: "dapanes-q3.xlsx" },
];

export type ApiKey = { id: string; name: string; prefix: string; scopes: string[]; collections: string[]; lastUsedAt: string | null; expiresAt: string | null; createdAt: string };
export const apiKeys: ApiKey[] = [
  { id: "ak_1", name: "ERP παραγωγής", prefix: "dgc_7Hq2", scopes: ["runs:write", "runs:read", "artifacts:read"], collections: ["co_tax"], lastUsedAt: ago(1), expiresAt: null, createdAt: ago(60 * 24 * 60) },
  { id: "ak_2", name: "Middleware ΕΣΠΑ", prefix: "dgc_p0Lm", scopes: ["runs:write", "jobs:write", "jobs:read"], collections: ["co_ops"], lastUsedAt: ago(60 * 5), expiresAt: "2027-03-31T00:00:00+03:00", createdAt: ago(60 * 24 * 20) },
];

export type Webhook = { id: string; url: string; events: string[]; active: boolean; lastDelivery: { status: number; at: string } | null };
export const webhooks: Webhook[] = [
  { id: "wh_1", url: "https://middleware.client.gr/hooks/dgcomplete", events: ["run.succeeded", "run.failed", "job.completed"], active: true, lastDelivery: { status: 200, at: ago(3) } },
  { id: "wh_2", url: "https://alerts.client.gr/dg", events: ["run.needs_attention", "method.paused"], active: true, lastDelivery: { status: 503, at: ago(65) } },
];
export const deliveries = [
  { id: "dl_1", webhookId: "wh_1", event: "run.succeeded", status: 200, attempts: 1, at: ago(3) },
  { id: "dl_2", webhookId: "wh_2", event: "method.paused", status: 503, attempts: 4, at: ago(65) },
  { id: "dl_3", webhookId: "wh_1", event: "job.completed", status: 200, attempts: 1, at: ago(60 * 26) },
];

export type Member = { id: string; name: string; email: string; role: TenantRoleKey; status: "ACTIVE" | "INVITED"; lastLoginAt: string | null };
export const members: Member[] = [
  { id: "us_1", name: "Μαρία Παππά", email: "m.pappa@client.gr", role: "TENANT_ADMIN", status: "ACTIVE", lastLoginAt: ago(20) },
  { id: "us_2", name: "Νίκος Γεωργίου", email: "n.georgiou@client.gr", role: "TENANT_DESIGNER", status: "ACTIVE", lastLoginAt: ago(60 * 3) },
  { id: "us_3", name: "Ελένη Κωνσταντίνου", email: "e.konst@client.gr", role: "TENANT_OPERATOR", status: "ACTIVE", lastLoginAt: ago(45) },
  { id: "us_4", name: "Γιώργος Αλεξίου", email: "g.alexiou@client.gr", role: "TENANT_USER", status: "INVITED", lastLoginAt: null },
];

export const auditLog = [
  { id: "au_1", at: ago(5), actor: "Μαρία Παππά", action: "Δημοσίευση έκδοσης", entity: "Καταχώριση πελάτη v4" },
  { id: "au_2", at: ago(50), actor: "Νίκος Γεωργίου", action: "Υποβολή για έγκριση", entity: "Υποβολή δαπάνης ΟΠΣΚΕ v2" },
  { id: "au_3", at: ago(60 * 4), actor: "Μαρία Παππά", action: "Νέο κλειδί API", entity: "ERP παραγωγής" },
  { id: "au_4", at: ago(60 * 26), actor: "Σύστημα", action: "Αυτόματη παύση μεθόδου", entity: "submitExpense" },
  { id: "au_5", at: ago(60 * 30), actor: "Μαρία Παππά", action: "Πρόσκληση μέλους", entity: "g.alexiou@client.gr" },
];

export const usage = {
  plan: "Business",
  runsMonthly: 20000,
  used: 13482,
  balance: 6518,
  extraCredits: 2000,
  overagePrice: 0.04,
  daily: Array.from({ length: 25 }, (_, i) => ({ day: i + 1, succeeded: 380 + ((i * 97) % 260), failed: 6 + ((i * 13) % 22) })),
  ledger: [
    { id: "lg_1", at: ago(60 * 24 * 25), kind: "Μηνιαία χορήγηση", amount: 20000 },
    { id: "lg_2", at: ago(60 * 24 * 12), kind: "Αγορά πακέτου 2.000", amount: 2000 },
    { id: "lg_3", at: ago(60 * 24), kind: "Κατανάλωση ημέρας", amount: -612 },
  ],
};

export const dashboard = {
  today: 1834,
  successRate: 96.8,
  avgSeconds: 14.2,
  queued: 57,
  series: Array.from({ length: 14 }, (_, i) => ({ day: `${12 + i}/10`, succeeded: 1200 + ((i * 173) % 700), failed: 20 + ((i * 31) % 60) })),
};

export const notifications = [
  { id: "nt_1", at: ago(4), text: "Η μέθοδος submitExpense τέθηκε σε παύση (11,9% σφάλματα)", href: "collections/co_ops" },
  { id: "nt_2", at: ago(36), text: "Νέα έκδοση σε αναμονή έγκρισης: Υποβολή δαπάνης ΟΠΣΚΕ v2", href: "approvals" },
  { id: "nt_3", at: ago(60 * 2), text: "Η μαζική εργασία «Δαπάνες Q3» ολοκληρώθηκε με 7 σφάλματα", href: "jobs/jb_3" },
];

export const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
export const targetName = (id: string) => byId(targets, id)?.name ?? "—";
export const methodOf = (id: string) => byId(methods, id);
