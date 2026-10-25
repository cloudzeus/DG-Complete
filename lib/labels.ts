// Greek UI labels shared by the tenant area (no i18n library — same as dgsmartbi).

export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRY_SCHEDULED" | "NEEDS_ATTENTION" | "CANCELLED" | "HELD";
export type VersionStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "DEPRECATED" | "ARCHIVED";
export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "CANCELLED" | "FAILED";
export type TenantRoleKey = "TENANT_ADMIN" | "TENANT_DESIGNER" | "TENANT_OPERATOR" | "TENANT_USER";

/** Visual tone of a status badge (docs/09 §5). */
export type StatusTone = "neutral" | "info" | "success" | "danger" | "warning" | "muted";

export const RUN_STATUS: Record<RunStatus, { label: string; tone: StatusTone }> = {
  QUEUED: { label: "Σε ουρά", tone: "neutral" },
  RUNNING: { label: "Εκτελείται", tone: "info" },
  SUCCEEDED: { label: "Επιτυχία", tone: "success" },
  FAILED: { label: "Αποτυχία", tone: "danger" },
  RETRY_SCHEDULED: { label: "Νέα προσπάθεια", tone: "warning" },
  NEEDS_ATTENTION: { label: "Προς ενέργεια", tone: "warning" },
  CANCELLED: { label: "Ακυρώθηκε", tone: "muted" },
  HELD: { label: "Σε αναμονή", tone: "muted" },
};

export const VERSION_STATUS: Record<VersionStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Πρόχειρο", tone: "neutral" },
  PENDING_APPROVAL: { label: "Σε έγκριση", tone: "warning" },
  PUBLISHED: { label: "Δημοσιευμένη", tone: "success" },
  DEPRECATED: { label: "Παρωχημένη", tone: "muted" },
  ARCHIVED: { label: "Αρχειοθετημένη", tone: "muted" },
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: "Σε αναμονή", tone: "neutral" },
  RUNNING: { label: "Εκτελείται", tone: "info" },
  COMPLETED: { label: "Ολοκληρώθηκε", tone: "success" },
  COMPLETED_WITH_ERRORS: { label: "Με σφάλματα", tone: "warning" },
  CANCELLED: { label: "Ακυρώθηκε", tone: "muted" },
  FAILED: { label: "Απέτυχε", tone: "danger" },
};

export const RECORDING_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  RECORDING: { label: "Σε εξέλιξη", tone: "info" },
  FINISHED: { label: "Ολοκληρώθηκε", tone: "success" },
  VERIFIED: { label: "Επαληθεύτηκε", tone: "success" },
  COMPILED: { label: "Έγινε ροή", tone: "muted" },
  DISCARDED: { label: "Απορρίφθηκε", tone: "muted" },
};

export const RUN_TRIGGER: Record<string, string> = { API: "API", UI_TEST: "Δοκιμή", UI_MANUAL: "Χειροκίνητη", JOB: "Μαζική", RETRY: "Επανάληψη", HEALTH: "Έλεγχος υγείας" };

export const TARGET_HEALTH: Record<string, { label: string; tone: StatusTone }> = {
  ok: { label: "Σε λειτουργία", tone: "success" },
  degraded: { label: "Με προβλήματα", tone: "warning" },
  down: { label: "Εκτός λειτουργίας", tone: "danger" },
  unknown: { label: "Χωρίς εκτελέσεις", tone: "neutral" },
};

export const TENANT_ROLES: Record<TenantRoleKey, { label: string; description: string }> = {
  TENANT_ADMIN: { label: "Διαχειριστής", description: "Όλα, μαζί με μέλη, κλειδιά API, εγκρίσεις και χρέωση" },
  TENANT_DESIGNER: { label: "Σχεδιαστής", description: "Καταγραφές, ροές, συστήματα‑στόχοι, δοκιμαστικές εκτελέσεις" },
  TENANT_OPERATOR: { label: "Χειριστής", description: "Εκτελέσεις, μαζικές εργασίες, «Προς ενέργεια»" },
  TENANT_USER: { label: "Προβολή", description: "Μόνο ανάγνωση" },
};

export const API_SCOPES = [
  { key: "runs:write", label: "Δημιουργία εκτελέσεων" },
  { key: "runs:read", label: "Ανάγνωση εκτελέσεων" },
  { key: "jobs:write", label: "Δημιουργία μαζικών εργασιών" },
  { key: "jobs:read", label: "Ανάγνωση μαζικών εργασιών" },
  { key: "artifacts:read", label: "Λήψη στιγμιοτύπων / αρχείων" },
  { key: "collections:read", label: "Ανάγνωση συλλογών" },
  { key: "usage:read", label: "Ανάγνωση χρήσης" },
] as const;

export const WEBHOOK_EVENTS = [
  { key: "run.succeeded", label: "Εκτέλεση επιτυχής" },
  { key: "run.failed", label: "Εκτέλεση απέτυχε" },
  { key: "run.needs_attention", label: "Εκτέλεση προς ενέργεια" },
  { key: "job.completed", label: "Μαζική εργασία ολοκληρώθηκε" },
  { key: "method.paused", label: "Μέθοδος σε παύση (incident)" },
] as const;

export const STEP_TYPES: Record<string, string> = {
  goto: "Πλοήγηση",
  fill: "Συμπλήρωση",
  select: "Επιλογή",
  click: "Κλικ",
  check: "Επιλογή πεδίου",
  waitFor: "Αναμονή",
  assert: "Έλεγχος",
  extract: "Εξαγωγή",
  forEach: "Για κάθε",
  if: "Συνθήκη",
  humanTask: "Ενέργεια χειριστή",
  upload: "Ανέβασμα αρχείου",
};
