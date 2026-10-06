import "server-only";
import { randomBytes } from "node:crypto";
import { renderEmail, templateDef, type Vars } from "@/lib/email-templates";
import { getEmailSettings, mailgunConfig, mailgunSend } from "@/lib/mailgun";
import { prisma } from "@/lib/prisma";

// Sends the platform's emails (Mailgun) from the editable templates, logs every attempt in
// email_log, and sends each reminder only once (dedupeKey).

export const APP_URL = (process.env.BETTER_AUTH_URL ?? "https://bi.dgsmart.gr").replace(/\/+$/, "");
const LOGIN_URL = `${APP_URL}/login`;

const eur = (v: unknown) => `${Number(v ?? 0).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const day = (d: Date) => d.toLocaleDateString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "numeric" });
const PERIOD = { MONTHLY: "μηνιαία", YEARLY: "ετήσια" } as const;
const METHOD: Record<string, string> = { BANK_TRANSFER: "Τραπεζική μεταφορά", CARD: "Κάρτα", CASH: "Μετρητά", VIVA: "Viva Wallet", OTHER: "Άλλο" };

export type SendResult = { ok: boolean; skipped?: boolean; error?: string; messageId?: string };

/** Subject + body of a template: the edited copy if any, else the built-in default. */
export async function templateText(key: string) {
  const def = templateDef(key);
  if (!def) throw new Error(`Άγνωστο πρότυπο ${key}`);
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  return { def, subject: row?.subject ?? def.subject, body: row?.body ?? def.body, edited: !!row };
}

export async function sendTemplate(opts: {
  template: string;
  to: string[];
  vars: Vars;
  tenantId?: string | null;
  dedupeKey?: string;
  /** Test sends go out even while sending is disabled. */
  force?: boolean;
  /** Unsaved text from the template editor (test sends). */
  override?: { subject: string; body: string };
}): Promise<SendResult> {
  const to = [...new Set(opts.to.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  if (!to.length) return { ok: false, skipped: true, error: "Δεν υπάρχει παραλήπτης." };
  if (opts.dedupeKey && (await prisma.emailLog.findUnique({ where: { dedupeKey: opts.dedupeKey }, select: { id: true } }))) {
    return { ok: true, skipped: true };
  }
  const settings = await getEmailSettings();
  if (!settings.enabled && !opts.force) return { ok: false, skipped: true, error: "Η αποστολή email είναι απενεργοποιημένη." };

  const { subject: s, body } = opts.override ?? (await templateText(opts.template));
  const msg = renderEmail({ subject: s, body }, opts.vars);
  let result: SendResult;
  try {
    const cfg = await mailgunConfig();
    if (!settings.fromEmail) throw new Error("Δεν έχει οριστεί email αποστολέα.");
    const messageId = await mailgunSend(cfg, {
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: settings.replyTo,
      bcc: opts.force ? null : settings.bcc,
      tags: [opts.template],
    });
    result = { ok: true, messageId };
  } catch (err) {
    result = { ok: false, error: (err as Error).message.slice(0, 500) };
  }
  await prisma.emailLog.create({
    data: {
      template: opts.template,
      to: to.join(", "),
      subject: msg.subject,
      ok: result.ok,
      messageId: result.messageId ?? null,
      error: result.error ?? null,
      tenantId: opts.tenantId ?? null,
      // Only a successful send blocks a retry of the same reminder.
      dedupeKey: result.ok ? (opts.dedupeKey ?? null) : null,
    },
  });
  return result;
}

// ───────────── Account emails ─────────────

/** Better Auth hook: «Ξεχάσατε τον κωδικό;». */
export async function sendPasswordResetEmail(user: { email: string; name: string }, url: string) {
  return sendTemplate({ template: "password_reset", to: [user.email], vars: { name: user.name, email: user.email, link: url } });
}

/**
 * Welcome email with a link to set the password (a Better Auth reset token, valid 7 days), so no
 * password ever travels by email.
 */
export async function sendWelcomeEmail(userId: string, tenantId: string) {
  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  if (!user || !tenant) return { ok: false, error: "Ο χρήστης δεν βρέθηκε." };
  const token = randomBytes(24).toString("base64url");
  await prisma.verification.create({
    data: { identifier: `reset-password:${token}`, value: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) },
  });
  return sendTemplate({
    template: "welcome",
    to: [user.email],
    tenantId,
    vars: { name: user.name, email: user.email, tenant: tenant.name, link: `${APP_URL}/reset-password?token=${token}&welcome=1`, loginUrl: LOGIN_URL },
  });
}

// ───────────── Billing emails ─────────────

/** Billing contacts of a tenant: its email + its active tenant admins. */
async function billingRecipients(tenantId: string) {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { email: true, memberships: { where: { role: "TENANT_ADMIN", user: { active: true } }, select: { user: { select: { email: true } } } } },
  });
  return [...(t?.email ? [t.email] : []), ...(t?.memberships.map((m) => m.user.email) ?? [])];
}

export async function sendPaymentReceipt(paymentId: string) {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { tenant: { select: { id: true, name: true, subscriptionEndsAt: true } } },
  });
  if (!p) return { ok: false, error: "Η πληρωμή δεν βρέθηκε." };
  return sendTemplate({
    template: "payment_receipt",
    to: await billingRecipients(p.tenantId),
    tenantId: p.tenantId,
    dedupeKey: `receipt:${p.id}`,
    vars: {
      tenant: p.tenant.name,
      amount: eur(p.amount),
      date: day(p.paidAt),
      method: METHOD[p.method] ?? p.method,
      description: p.description,
      invoice: p.s1Fincode ?? "",
      endsAt: p.tenant.subscriptionEndsAt ? day(p.tenant.subscriptionEndsAt) : "",
    },
  });
}

/** One period on from the later of today and the current end. */
export function extendSubscription(endsAt: Date | null, period: "MONTHLY" | "YEARLY", paidAt: Date) {
  const base = endsAt && endsAt > paidAt ? new Date(endsAt) : new Date(paidAt);
  if (period === "YEARLY") base.setFullYear(base.getFullYear() + 1);
  else base.setMonth(base.getMonth() + 1);
  return base;
}

const DAY = 24 * 3600_000;
const athensMidnight = (d: Date) => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(d));

/** Renewal reminders before the end and overdue reminders after it — each one once per cycle. */
export async function runSubscriptionReminders() {
  const settings = await getEmailSettings();
  if (!settings.enabled) return { sent: 0, skipped: "disabled" };
  const tenants = await prisma.tenant.findMany({
    where: { isDemo: false, status: { not: "CANCELED" }, subscriptionEndsAt: { not: null } },
    select: { id: true, name: true, subscriptionEndsAt: true, subscriptionAmount: true, subscriptionPeriod: true },
  });
  const today = athensMidnight(new Date()).getTime();
  let sent = 0;
  for (const t of tenants) {
    const end = t.subscriptionEndsAt!;
    const daysLeft = Math.round((athensMidnight(end).getTime() - today) / DAY);
    const cycle = end.toISOString().slice(0, 10);
    const vars = {
      tenant: t.name,
      endsAt: day(end),
      amount: t.subscriptionAmount ? eur(t.subscriptionAmount) : "",
      period: t.subscriptionPeriod ? PERIOD[t.subscriptionPeriod] : "",
    };
    // The closest threshold not yet passed: 14 → 3 → … (only the most relevant one is sent).
    const before = [...settings.reminderDays].sort((a, b) => a - b).find((d) => daysLeft > 0 && daysLeft <= d);
    const after = [...settings.overdueDays].sort((a, b) => b - a).find((d) => daysLeft <= -d);
    const job =
      before !== undefined
        ? { template: "renewal_reminder", key: `renewal:${t.id}:${cycle}:${before}`, extra: { daysLeft } }
        : after !== undefined
          ? { template: "payment_overdue", key: `overdue:${t.id}:${cycle}:${after}`, extra: {} }
          : null;
    if (!job) continue;
    const r = await sendTemplate({ template: job.template, to: await billingRecipients(t.id), tenantId: t.id, dedupeKey: job.key, vars: { ...vars, ...job.extra } });
    if (r.ok && !r.skipped) sent++;
  }
  return { sent };
}
