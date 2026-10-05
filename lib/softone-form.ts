import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { openSoftOneCredentials, type SoftOneLoginObj } from "@/lib/softone";

// Shared validation for SoftOne connection forms (DGsoft settings + tenant data sources).

export const softOneSchema = z.object({
  id: z.string().optional(),
  baseUrl: z
    .string()
    .trim()
    .transform((v) => (/^https?:\/\//.test(v) ? v : `https://${v}.oncloud.gr/s1services`).replace(/\/+$/, ""))
    .pipe(z.url("Μη έγκυρη διεύθυνση").refine((u) => u.startsWith("https://"), "Απαιτείται https://")),
  appId: z.string().trim().regex(/^\d+$/, "Αριθμητικό AppID"),
  username: z.string().trim().min(1, "Δώστε χρήστη"),
  password: z.string().max(256),
  company: z.string().trim().regex(/^\d*$/, "Αριθμός").default(""),
  branch: z.string().trim().regex(/^\d*$/, "Αριθμός").default(""),
  module: z.string().trim().regex(/^\d*$/, "Αριθμός").default(""),
  refId: z.string().trim().regex(/^\d*$/, "Αριθμός").default(""),
});

export type SoftOneInput = z.infer<typeof softOneSchema>;
type Field = keyof SoftOneInput;

export type SoftOneFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<Field, string>>;
  test?: { ok: true; objs: SoftOneLoginObj[]; authenticated: boolean } | { ok: false; error: string };
};

export function parseSoftOneForm(formData: FormData) {
  const get = (k: string) => (formData.get(k) as string | null) ?? "";
  return softOneSchema.safeParse({
    id: get("id") || undefined,
    baseUrl: get("baseUrl"),
    appId: get("appId"),
    username: get("username"),
    password: get("password"),
    company: get("company"),
    branch: get("branch"),
    module: get("module"),
    refId: get("refId"),
  });
}

export function softOneErrors(error: z.ZodError): SoftOneFormState["errors"] {
  const out: SoftOneFormState["errors"] = {};
  for (const issue of error.issues) out[issue.path[0] as Field] ??= issue.message;
  return out;
}

/**
 * Blank password on edit keeps the stored one — only for the same connection (scope + tenant)
 * and while URL and username are unchanged, so a stored password is never replayed elsewhere.
 */
export async function resolveSoftOnePassword(
  input: SoftOneInput,
  owner: { scope: "DGSOFT" } | { scope: "TENANT"; tenantId: string },
) {
  if (input.password) return input.password;
  if (!input.id) return null;
  const existing = await prisma.softOneConnection.findUnique({ where: { id: input.id } });
  if (!existing || existing.scope !== owner.scope) return null;
  if (owner.scope === "TENANT" && existing.tenantId !== owner.tenantId) return null;
  const creds = openSoftOneCredentials(existing.id, existing.credentialsEnc);
  return existing.baseUrl === input.baseUrl && creds.username === input.username ? creds.password : null;
}

export const PASSWORD_REQUIRED = "Δώστε κωδικό (απαιτείται όταν αλλάζει διεύθυνση ή χρήστης)";
