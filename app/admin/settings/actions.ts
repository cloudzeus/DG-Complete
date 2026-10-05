"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  getDgsoftConnection,
  s1GetTable,
  s1Authenticate,
  s1Login,
  sealSoftOneCredentials,
} from "@/lib/softone";
import {
  parseSoftOneForm,
  PASSWORD_REQUIRED,
  resolveSoftOnePassword,
  softOneErrors,
  type SoftOneFormState,
  type SoftOneInput,
} from "@/lib/softone-form";

const parse = parseSoftOneForm;
const errorsOf = softOneErrors;
const resolvePassword = (input: SoftOneInput) => resolveSoftOnePassword(input, { scope: "DGSOFT" });

export type { SoftOneFormState };

/** Login (and authenticate when company/branch/module/refid are filled) with the form values. */
export async function testSoftOneDraft(formData: FormData): Promise<SoftOneFormState> {
  await requirePermission("platform.settings.manage");
  const parsed = parse(formData);
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const input = parsed.data;
  const password = await resolvePassword(input);
  if (password === null) return { errors: { password: PASSWORD_REQUIRED } };
  try {
    const { clientID, objs } = await s1Login({ ...input, password });
    const full = !!input.company;
    if (full) await s1Authenticate({ ...input, password }, clientID);
    return { test: { ok: true, objs, authenticated: full } };
  } catch (err) {
    return { test: { ok: false, error: (err as Error).message.slice(0, 500) } };
  }
}

export async function saveSoftOne(_prev: SoftOneFormState, formData: FormData): Promise<SoftOneFormState> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = parse(formData);
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const input = parsed.data;
  if (!input.company) return { errors: { company: "Υποχρεωτικό" } };

  const password = await resolvePassword(input);
  if (password === null) return { errors: { password: PASSWORD_REQUIRED } };

  // Verify before storing: a saved connection is always a working one.
  try {
    const { clientID } = await s1Login({ ...input, password });
    await s1Authenticate({ ...input, password }, clientID);
  } catch (err) {
    return { test: { ok: false, error: (err as Error).message.slice(0, 500) }, message: "Η σύνδεση δεν αποθηκεύτηκε." };
  }

  const existing = await prisma.softOneConnection.findFirst({ where: { scope: "DGSOFT" }, select: { id: true } });
  const id = existing?.id ?? randomUUID().replaceAll("-", "");
  const data = {
    name: "SoftOne DGsoft",
    baseUrl: input.baseUrl,
    appId: input.appId,
    company: input.company,
    branch: input.branch,
    module: input.module,
    refId: input.refId,
    credentialsEnc: sealSoftOneCredentials(id, { username: input.username, password }),
    // Settings changed → drop the cached clientID.
    sessionEnc: null,
    sessionDate: null,
    lastTestedAt: new Date(),
    lastTestStatus: "OK" as const,
    lastTestError: null,
  };
  if (existing) await prisma.softOneConnection.update({ where: { id }, data });
  else await prisma.softOneConnection.create({ data: { id, scope: "DGSOFT", ...data } });

  await audit({
    actorId: user.id,
    action: existing ? "softone.update" : "softone.create",
    entity: "SoftOneConnection",
    entityId: id,
    meta: { baseUrl: input.baseUrl, appId: input.appId, company: input.company, passwordChanged: !!input.password },
  });
  revalidatePath("/admin/settings", "layout");
  return { ok: true, message: "Η σύνδεση με το SoftOne αποθηκεύτηκε." };
}

// ───────────── Subscription invoicing settings ─────────────

export type Lookup = { id: number; code: string; name: string };
export type BillingLookups = { ok: true; series: Lookup[]; services: Lookup[]; payments: Lookup[] } | { ok: false; error: string };

const SOSOURCE_SALDOC = 1351;
const SODTYPE_SERVICE = 52;

function toLookups(rows: Record<string, unknown>[], idField: string): Lookup[] {
  return rows
    .map((r) => ({ id: Number(r[idField]), code: String(r.CODE ?? ""), name: String(r.NAME ?? "") }))
    .filter((l) => Number.isInteger(l.id))
    .sort((a, b) => a.code.localeCompare(b.code, "el", { numeric: true }));
}

/** Reads series / services / payment methods from the SoftOne of DGsoft for the pickers. */
export async function loadBillingLookups(): Promise<BillingLookups> {
  await requirePermission("platform.settings.manage");
  const conn = await getDgsoftConnection();
  if (!conn) return { ok: false, error: "Αποθηκεύστε πρώτα τη σύνδεση SoftOne." };
  const company = /^\d+$/.test(conn.company) ? ` AND COMPANY=${conn.company}` : "";
  try {
    const [series, services, payments] = await Promise.all([
      s1GetTable(conn.id, "SERIES", ["SERIES", "CODE", "NAME"], `SOSOURCE=${SOSOURCE_SALDOC} AND ISACTIVE=1${company}`),
      s1GetTable(conn.id, "MTRL", ["MTRL", "CODE", "NAME"], `SODTYPE=${SODTYPE_SERVICE} AND ISACTIVE=1${company}`),
      s1GetTable(conn.id, "PAYMENT", ["PAYMENT", "CODE", "NAME"], `ISACTIVE=1${company}`),
    ]);
    return {
      ok: true,
      series: toLookups(series, "SERIES"),
      services: toLookups(services, "MTRL"),
      payments: toLookups(payments, "PAYMENT"),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 500) };
  }
}

const billingSchema = z.object({
  invoiceSeries: z.coerce.number().int().positive("Επιλέξτε σειρά"),
  serviceMtrl: z.coerce.number().int().positive("Επιλέξτε υπηρεσία"),
  paymentCode: z.coerce.number().int().positive().optional(),
  vatRate: z.coerce.number().min(0).max(100),
  pricesIncludeVat: z.boolean(),
});

export type BillingFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<keyof z.infer<typeof billingSchema>, string>>;
};

export async function saveBilling(_prev: BillingFormState, formData: FormData): Promise<BillingFormState> {
  const user = await requirePermission("platform.settings.manage");
  const conn = await getDgsoftConnection();
  if (!conn) return { message: "Αποθηκεύστε πρώτα τη σύνδεση SoftOne." };
  const parsed = billingSchema.safeParse({
    invoiceSeries: formData.get("invoiceSeries"),
    serviceMtrl: formData.get("serviceMtrl"),
    paymentCode: formData.get("paymentCode") || undefined,
    vatRate: formData.get("vatRate"),
    pricesIncludeVat: formData.get("pricesIncludeVat") === "on",
  });
  if (!parsed.success) {
    const errors: BillingFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as keyof typeof errors] ??= i.message;
    return { errors };
  }
  await prisma.softOneConnection.update({
    where: { id: conn.id },
    data: { ...parsed.data, paymentCode: parsed.data.paymentCode ?? null },
  });
  await audit({ actorId: user.id, action: "softone.billing.update", entity: "SoftOneConnection", entityId: conn.id, meta: parsed.data });
  revalidatePath("/admin/settings", "layout");
  return { ok: true, message: "Οι ρυθμίσεις τιμολόγησης αποθηκεύτηκαν." };
}
