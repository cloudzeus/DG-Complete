"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { sendTemplate } from "@/lib/email";
import { sampleVars, templateDef } from "@/lib/email-templates";
import { checkMailgun, getEmailSettings, sealMailgunKey, sealWebhookKey } from "@/lib/mailgun";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type Field = "apiKey" | "webhookKey" | "domain" | "fromEmail" | "replyTo" | "bcc" | "reminderDays" | "overdueDays" | "fromName";
export type EmailFormState = { ok?: boolean; message?: string; errors?: Partial<Record<Field, string>> };

const days = z
  .string()
  .trim()
  .transform((s) => [...new Set(s.split(/[,\s]+/).filter(Boolean).map(Number))].sort((a, b) => b - a))
  .pipe(z.array(z.number().int().min(1).max(365)).max(5, "Έως 5 τιμές"));
const optEmail = z.union([z.literal(""), z.email("Μη έγκυρο email")]);

const schema = z.object({
  apiKey: z.string().trim().max(200).optional(),
  webhookKey: z
    .string()
    .trim()
    .regex(/^[\w-]{16,200}$/, "Δεν μοιάζει με έγκυρο signing key")
    .optional(),
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "π.χ. mg.dgsmart.gr"),
  region: z.enum(["EU", "US"]),
  fromName: z.string().trim().min(2, "Υποχρεωτικό").max(80),
  fromEmail: z.email("Μη έγκυρο email"),
  replyTo: optEmail,
  bcc: optEmail,
  reminderDays: days,
  overdueDays: days,
  enabled: z.boolean(),
});

const refresh = () => revalidatePath("/admin/settings/email");

export async function saveEmailSettings(_prev: EmailFormState, fd: FormData): Promise<EmailFormState> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = schema.safeParse({
    apiKey: fd.get("apiKey") || undefined,
    webhookKey: fd.get("webhookKey") || undefined,
    domain: fd.get("domain"),
    region: fd.get("region") || "EU",
    fromName: fd.get("fromName"),
    fromEmail: fd.get("fromEmail"),
    replyTo: fd.get("replyTo") ?? "",
    bcc: fd.get("bcc") ?? "",
    reminderDays: fd.get("reminderDays") ?? "",
    overdueDays: fd.get("overdueDays") ?? "",
    enabled: fd.get("enabled") === "on",
  });
  if (!parsed.success) {
    const errors: EmailFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as Field] ??= i.message;
    return { errors };
  }
  const v = parsed.data;
  const current = await getEmailSettings();
  const apiKey = v.apiKey || (current.apiKeyEnc ? decrypt(current.apiKeyEnc, "email_settings:default") : "");
  if (!apiKey) return { errors: { apiKey: "Δώστε το API key του Mailgun" } };

  // Key + domain + region are accepted only if Mailgun recognises them.
  let state = "";
  try {
    state = (await checkMailgun({ apiKey, domain: v.domain, region: v.region })).state;
  } catch (err) {
    return { errors: { apiKey: (err as Error).message.slice(0, 200) } };
  }

  await prisma.emailSettings.update({
    where: { id: "default" },
    data: {
      ...(v.apiKey ? { apiKeyEnc: sealMailgunKey(v.apiKey), keyHint: `…${v.apiKey.slice(-4)}` } : {}),
      ...(v.webhookKey ? { webhookKeyEnc: sealWebhookKey(v.webhookKey), webhookKeyHint: `…${v.webhookKey.slice(-4)}` } : {}),
      domain: v.domain,
      region: v.region,
      fromName: v.fromName,
      fromEmail: v.fromEmail.toLowerCase(),
      replyTo: v.replyTo || null,
      bcc: v.bcc || null,
      reminderDays: v.reminderDays,
      overdueDays: v.overdueDays,
      enabled: v.enabled,
      lastTestAt: new Date(),
      lastTestOk: true,
      lastTestError: null,
    },
  });
  await audit({ actorId: user.id, action: "email.settings", entity: "EmailSettings", entityId: "default", meta: { domain: v.domain, region: v.region, enabled: v.enabled, keyChanged: !!v.apiKey, webhookKeyChanged: !!v.webhookKey } });
  refresh();
  return {
    ok: true,
    message: `Αποθηκεύτηκε. Domain ${v.domain}: ${state === "active" ? "ενεργό" : `κατάσταση «${state}» — ελέγξτε τα DNS στο Mailgun`}.`,
  };
}

/** Sends a template with sample data to the signed-in admin (also while sending is disabled). */
export async function sendTestEmail(key: string, draft?: { subject: string; body: string }) {
  const user = await requirePermission("platform.settings.manage");
  const def = templateDef(key);
  if (!def) return { ok: false, message: "Άγνωστο πρότυπο." };
  const r = await sendTemplate({ template: key, to: [user.email], vars: sampleVars(def), force: true, override: draft });
  return r.ok ? { ok: true, message: `Στάλθηκε δοκιμαστικό στο ${user.email}.` } : { ok: false, message: r.error ?? "Η αποστολή απέτυχε." };
}

export async function saveTemplate(key: string, subject: string, body: string) {
  const user = await requirePermission("platform.settings.manage");
  if (!templateDef(key)) return { ok: false, message: "Άγνωστο πρότυπο." };
  const s = subject.trim().slice(0, 200);
  const b = body.trim().slice(0, 10_000);
  if (s.length < 3 || b.length < 10) return { ok: false, message: "Συμπληρώστε θέμα και κείμενο." };
  await prisma.emailTemplate.upsert({ where: { key }, update: { subject: s, body: b, updatedById: user.id }, create: { key, subject: s, body: b, updatedById: user.id } });
  await audit({ actorId: user.id, action: "email.template", entity: "EmailTemplate", entityId: key });
  refresh();
  return { ok: true, message: "Το πρότυπο αποθηκεύτηκε." };
}

export async function resetTemplate(key: string) {
  const user = await requirePermission("platform.settings.manage");
  await prisma.emailTemplate.deleteMany({ where: { key } });
  await audit({ actorId: user.id, action: "email.template.reset", entity: "EmailTemplate", entityId: key });
  refresh();
  return { ok: true, message: "Επανήλθε το αρχικό κείμενο." };
}
