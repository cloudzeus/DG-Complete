import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { openSoftOneCredentials, s1Authenticate, s1Login, sealSoftOneCredentials, type SoftOneLoginObj } from "@/lib/softone";

// Shared validation for SoftOne connection forms (DGsoft settings + tenant data sources).

export const softOneSchema = z.object({
  id: z.string().optional(),
  baseUrl: z
    .string()
    .trim()
    .transform((v) => (/^https?:\/\//.test(v) ? v : `https://${v}.oncloud.gr/s1services`).replace(/\/+$/, ""))
    // The Web Services endpoint is always /s1services; a bare host (https://xxxx.oncloud.gr) answers 404.
    .transform((v) => (/^https?:\/\/[^/]+$/.test(v) ? `${v}/s1services` : v))
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
  /** Company / branch / module / refid picked from the login when the form left Company blank. */
  resolved?: SoftOneIds;
  /** Stored, but not (yet) a working connection — the form stays open with the problems shown. */
  saved?: boolean;
  /** Id of the stored connection, so a second save of a new form updates it instead of adding one. */
  id?: string;
};

export type SoftOneIds = Pick<SoftOneInput, "company" | "branch" | "module" | "refId">;

/**
 * Company is optional in the form. Blank → taken from the account's login combinations:
 * one company → used automatically (with its branch/module/refid when that company has a single
 * combination); several → the super admin has to pick one from the list.
 */
export function resolveSoftOneIds(
  input: SoftOneIds,
  objs: SoftOneLoginObj[],
): { ok: true; ids: SoftOneIds; auto: boolean } | { ok: false; error: string } {
  // Only the four ids — callers spread `ids` into the database row (the full input carries the password).
  if (input.company) {
    return { ok: true, ids: { company: input.company, branch: input.branch, module: input.module, refId: input.refId }, auto: false };
  }
  const companies = [...new Set(objs.map((o) => String(o.COMPANY)))];
  if (companies.length === 0) return { ok: false, error: "Ο λογαριασμός δεν επέστρεψε εταιρείες — συμπληρώστε το Company." };
  if (companies.length > 1) {
    return { ok: false, error: `Ο λογαριασμός έχει ${companies.length} εταιρείες — επιλέξτε μία από τη λίστα.` };
  }
  const combos = objs.filter((o) => String(o.COMPANY) === companies[0]);
  const only = combos.length === 1 ? combos[0] : null;
  const pick = (entered: string, fromLogin: unknown) => entered || (only ? String(fromLogin ?? "") : "");
  return {
    ok: true,
    auto: true,
    ids: {
      company: companies[0],
      branch: pick(input.branch, only?.BRANCH),
      module: pick(input.module, only?.MODULE),
      refId: pick(input.refId, only?.REFID),
    },
  };
}

const formValues = (formData: FormData) => {
  const get = (k: string) => (formData.get(k) as string | null) ?? "";
  return {
    id: get("id") || undefined,
    baseUrl: get("baseUrl"),
    appId: get("appId"),
    username: get("username"),
    password: get("password"),
    company: get("company"),
    branch: get("branch"),
    module: get("module"),
    refId: get("refId"),
  };
};

export function parseSoftOneForm(formData: FormData) {
  return softOneSchema.safeParse(formValues(formData));
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

type Owner = { scope: "DGSOFT" } | { scope: "TENANT"; tenantId: string };

/**
 * Saves whatever the form holds — even incomplete or not (yet) working — so nothing has to be typed
 * again. When everything is filled in, the connection is verified (login → authenticate) and stored
 * as OK; otherwise as UNTESTED / FAILED with the reason. Only a verified connection is usable.
 */
export async function saveSoftOneDraft(formData: FormData, owner: Owner, name: string) {
  const raw = formValues(formData);
  const trimmed = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && k !== "password" ? v.trim() : v]));
  const strict = softOneSchema.safeParse(raw);
  const draft = {
    ...(trimmed as Required<Omit<SoftOneInput, "id">>),
    id: raw.id,
    // Serial → full URL, as the strict schema does, but never rejected.
    baseUrl: strict.success ? strict.data.baseUrl : (trimmed.baseUrl as string),
  };

  const existing = draft.id
    ? await prisma.softOneConnection.findFirst({
        where: owner.scope === "TENANT" ? { id: draft.id, scope: "TENANT", tenantId: owner.tenantId } : { id: draft.id, scope: "DGSOFT" },
        select: { id: true },
      })
    : owner.scope === "DGSOFT"
      ? await prisma.softOneConnection.findFirst({ where: { scope: "DGSOFT" }, select: { id: true } })
      : null;
  const id = existing?.id ?? randomUUID().replaceAll("-", "");
  const password = (await resolveSoftOnePassword({ ...draft, id: existing?.id }, owner)) ?? "";

  let ids: SoftOneIds = { company: draft.company, branch: draft.branch, module: draft.module, refId: draft.refId };
  let status: "OK" | "FAILED" | "UNTESTED" = "UNTESTED";
  let problem: string | null = null;
  const state: SoftOneFormState = {};
  if (!strict.success) {
    state.errors = softOneErrors(strict.error);
    problem = "Ελλιπή ή μη έγκυρα στοιχεία.";
  } else if (!password) {
    state.errors = { password: PASSWORD_REQUIRED };
    problem = "Λείπει ο κωδικός.";
  } else {
    try {
      const { clientID, objs } = await s1Login({ ...strict.data, password });
      const r = resolveSoftOneIds(strict.data, objs);
      if (!r.ok) {
        state.test = { ok: true, objs, authenticated: false };
        state.errors = { company: r.error };
        problem = r.error;
      } else {
        await s1Authenticate({ ...strict.data, ...r.ids, password }, clientID);
        ids = r.ids;
        if (r.auto) state.resolved = r.ids;
        status = "OK";
      }
    } catch (err) {
      problem = (err as Error).message.slice(0, 500);
      state.test = { ok: false, error: problem };
      status = "FAILED";
    }
  }

  const data = {
    name,
    baseUrl: draft.baseUrl,
    appId: draft.appId,
    company: ids.company,
    branch: ids.branch,
    module: ids.module,
    refId: ids.refId,
    credentialsEnc: sealSoftOneCredentials(id, { username: draft.username, password }),
    // Settings changed → drop the cached clientID.
    sessionEnc: null,
    sessionDate: null,
    lastTestedAt: status === "UNTESTED" ? null : new Date(),
    lastTestStatus: status,
    lastTestError: problem,
  };
  if (existing) await prisma.softOneConnection.update({ where: { id }, data });
  else {
    await prisma.softOneConnection.create({
      data: { id, scope: owner.scope, tenantId: owner.scope === "TENANT" ? owner.tenantId : null, ...data },
    });
  }

  state.id = id;
  if (status !== "OK") {
    state.saved = true;
    state.message = `Τα στοιχεία αποθηκεύτηκαν, αλλά η σύνδεση δεν ενεργοποιήθηκε: ${problem}`;
  }
  return { state, id, created: !existing, verified: status === "OK", ids, baseUrl: draft.baseUrl, passwordChanged: !!raw.password };
}
