import type { z } from "zod";

// Result of every form Server Action (ADR-023): field errors come back from the server.
export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Shown once in the dialog instead of closing it (e.g. a new API key). */
  reveal?: { label: string; value: string; note?: string };
};

export const INITIAL_FORM_STATE: FormState = { ok: false };

/** FormData → object (repeated keys become arrays, checkboxes "on" → true). */
export function formObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = v === "on" ? true : v;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], val);
    else out[k] = val;
  }
  return out;
}

/** Validates with zod; on failure returns the first message per field (Greek messages). */
export function validate<S extends z.ZodType>(schema: S, fd: FormData): { data: z.infer<S> } | { state: FormState } {
  const parsed = schema.safeParse(formObject(fd));
  if (parsed.success) return { data: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "_");
    errors[key] ??= issue.message;
  }
  return { state: { ok: false, errors, message: "Διορθώστε τα πεδία που επισημαίνονται." } };
}
