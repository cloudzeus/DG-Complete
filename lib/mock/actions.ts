"use server";

import { z } from "zod";
import { validate, type FormState } from "@/lib/forms";
import { requireTenant } from "@/lib/tenant";

// UI phase: every tenant-area form posts here. Validation is real (zod, Greek messages), the write
// is not — each form gets its own Server Action (tenantDb + audit) when the screens are connected.

const req = (label: string) => z.string().trim().min(1, `Συμπληρώστε: ${label}`);
const url = (label: string) => z.url({ message: `${label}: μη έγκυρο URL` });
const list = (label: string) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .pipe(z.array(z.string()).min(1, `Επιλέξτε τουλάχιστον ένα: ${label}`));
const int = (label: string, min: number, max: number) => z.coerce.number({ message: `${label}: αριθμός` }).int().min(min, `${label}: από ${min}`).max(max, `${label}: έως ${max}`);
const comment = z.string().trim().optional();

const SCHEMAS = {
  createTarget: z.object({ name: req("Όνομα"), baseUrl: url("Διεύθυνση"), origins: req("Επιτρεπτά origins"), maxConcurrency: int("Ταυτόχρονες εκτελέσεις", 1, 20) }),
  editTarget: z.object({ name: req("Όνομα"), baseUrl: url("Διεύθυνση"), maxConcurrency: int("Ταυτόχρονες εκτελέσεις", 1, 20) }),
  addCredential: z.object({ label: req("Περιγραφή"), username: req("Όνομα χρήστη"), password: req("Κωδικός") }),
  newRecording: z.object({ name: req("Όνομα"), targetId: req("Σύστημα‑στόχος") }),
  newWorkflow: z.object({ name: req("Όνομα"), targetId: req("Σύστημα‑στόχος") }),
  addStep: z.object({ type: req("Τύπος"), label: req("Περιγραφή") }),
  addInput: z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, "Κλειδί: λατινικά, ξεκινά με πεζό"), label: req("Ετικέτα"), type: req("Τύπος") }),
  submitApproval: z.object({ note: comment }),
  publish: z.object({ note: comment }),
  newCollection: z.object({ name: req("Όνομα"), description: comment }),
  newMethod: z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "Κλειδί: camelCase, λατινικά"), name: req("Όνομα"), workflowId: req("Ροή"), mode: z.enum(["async", "sync"], { message: "Επιλέξτε τρόπο" }) }),
  methodSettings: z.object({ mode: z.enum(["async", "sync"]), syncTimeoutSec: int("Χρόνος αναμονής", 5, 120), retries: int("Επαναλήψεις", 0, 5) }),
  upgradeMethod: z.object({}),
  manualRun: z.object({}).passthrough(),
  newJob: z.object({ name: req("Όνομα"), methodId: req("Μέθοδος") }),
  retryFailed: z.object({}),
  cancel: z.object({ reason: comment }),
  resumeRun: z.object({ otp: z.string().regex(/^\d{4,8}$/, "Ο κωδικός έχει 4–8 ψηφία") }),
  approve: z.object({ note: comment }),
  reject: z.object({ note: req("Σχόλιο") }),
  createApiKey: z.object({ name: req("Όνομα"), scopes: list("δικαιώματα"), expiresAt: z.string().optional() }),
  revoke: z.object({}),
  createWebhook: z.object({ url: url("Διεύθυνση"), events: list("γεγονότα") }),
  redeliver: z.object({}),
  invite: z.object({ email: z.email({ message: "Μη έγκυρο email" }), role: req("Ρόλος") }),
  changeRole: z.object({ role: req("Ρόλος") }),
  removeMember: z.object({}),
  tenantSettings: z.object({ timezone: req("Ζώνη ώρας"), logRetentionDays: int("Διατήρηση logs", 7, 365), artifactRetentionDays: int("Διατήρηση στιγμιοτύπων", 1, 365) }),
  buyCredits: z.object({ pack: req("Πακέτο") }),
} as const;

export type MockForm = keyof typeof SCHEMAS;

const MESSAGES: Partial<Record<MockForm, string>> = {
  createTarget: "Το σύστημα‑στόχος δημιουργήθηκε.",
  addCredential: "Το διαπιστευτήριο αποθηκεύτηκε κρυπτογραφημένο.",
  newWorkflow: "Η ροή δημιουργήθηκε ως πρόχειρο.",
  submitApproval: "Η έκδοση στάλθηκε για έγκριση.",
  publish: "Η έκδοση δημοσιεύτηκε.",
  manualRun: "Η εκτέλεση μπήκε στην ουρά.",
  newJob: "Η μαζική εργασία δημιουργήθηκε.",
  retryFailed: "Οι αποτυχημένες εγγραφές μπήκαν ξανά στην ουρά.",
  resumeRun: "Η εκτέλεση συνεχίζει.",
  approve: "Η έκδοση εγκρίθηκε και δημοσιεύτηκε.",
  reject: "Η έκδοση επέστρεψε σε πρόχειρο με το σχόλιό σας.",
  revoke: "Το κλειδί ανακλήθηκε.",
  redeliver: "Η αποστολή προγραμματίστηκε ξανά.",
  invite: "Η πρόσκληση στάλθηκε.",
  removeMember: "Το μέλος αφαιρέθηκε.",
  cancel: "Ακυρώθηκε.",
};

export async function mockSubmit(tenantId: string, form: MockForm, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireTenant(tenantId);
  const v = validate(SCHEMAS[form], fd);
  if ("state" in v) return v.state;
  await new Promise((r) => setTimeout(r, 300));
  if (form === "createApiKey") {
    const secret = `dgc_${crypto.randomUUID().replaceAll("-", "").slice(0, 32)}`;
    return {
      ok: true,
      message: "Το κλειδί δημιουργήθηκε.",
      reveal: { label: "Κλειδί API", value: secret, note: "Εμφανίζεται μόνο αυτή τη φορά. Αποθηκεύστε το σε ασφαλές σημείο." },
    };
  }
  if (form === "newRecording") {
    return {
      ok: true,
      message: "Ανοίξτε το extension «DG Complete Recorder» και πληκτρολογήστε τον κωδικό σύνδεσης.",
      reveal: { label: "Κωδικός σύνδεσης", value: String(Math.floor(10_000_000 + Math.random() * 89_999_999)), note: "Ισχύει 10 λεπτά." },
    };
  }
  return { ok: true, message: MESSAGES[form] ?? "Οι αλλαγές αποθηκεύτηκαν." };
}
