import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Email statistics and unsubscribes: Mailgun webhook events (delivered / opened / failed /
// unsubscribed / complained) are stored per sent email, and reminders are not sent to addresses
// on the suppression list. The unsubscribe link is signed per address, so it cannot be forged.

const APP_URL = (process.env.BETTER_AUTH_URL ?? "https://complete.dgsmart.gr").replace(/\/+$/, "");

const secret = () => {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
};

export const normEmail = (e: string) => e.trim().toLowerCase();

const unsubscribeToken = (email: string) => createHmac("sha256", secret()).update(`unsubscribe:${normEmail(email)}`).digest("base64url").slice(0, 32);

export function verifyUnsubscribeToken(email: string, token: string) {
  const a = Buffer.from(unsubscribeToken(email));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const query = (email: string) => `e=${encodeURIComponent(normEmail(email))}&t=${unsubscribeToken(email)}`;
/** Page with a confirm button (link scanners only GET, so they never unsubscribe anyone). */
export const unsubscribePageUrl = (email: string) => `${APP_URL}/unsubscribe?${query(email)}`;
/** RFC 8058 one-click target for the List-Unsubscribe header (POST). */
export const unsubscribeOneClickUrl = (email: string) => `${APP_URL}/api/email/unsubscribe?${query(email)}`;

export async function suppressedSet(emails: string[]) {
  const rows = await prisma.emailSuppression.findMany({ where: { email: { in: emails.map(normEmail) } }, select: { email: true } });
  return new Set(rows.map((r) => r.email));
}

export async function suppress(email: string, data: { reason: string; source: string; template?: string | null; tenantId?: string | null }) {
  const e = normEmail(email);
  await prisma.emailSuppression.upsert({
    where: { email: e },
    update: {},
    create: { email: e, reason: data.reason, source: data.source, template: data.template ?? null, tenantId: data.tenantId ?? null },
  });
}

/** Tenant + template of the latest email to this address (shown in the unsubscribe list). */
export async function lastEmailTo(email: string) {
  return prisma.emailLog.findFirst({ where: { to: normEmail(email) }, orderBy: { createdAt: "desc" }, select: { tenantId: true, template: true } });
}

// ───────────── Mailgun webhooks ─────────────

export type MailgunWebhook = {
  signature?: { timestamp?: string; token?: string; signature?: string };
  "event-data"?: MailgunEvent;
};

type MailgunEvent = {
  id?: string;
  event?: string;
  severity?: string;
  timestamp?: number;
  recipient?: string;
  reason?: string;
  url?: string;
  "user-variables"?: Record<string, unknown>;
  "client-info"?: { "client-name"?: string; "device-type"?: string; "client-os"?: string };
  geolocation?: { country?: string; city?: string };
  "delivery-status"?: { message?: string; description?: string; code?: number };
};

/** HMAC-SHA256(timestamp + token) with the HTTP webhook signing key; rejects signatures older than 1h. */
export function verifyMailgunSignature(sig: MailgunWebhook["signature"], key: string) {
  if (!sig?.timestamp || !sig.token || !sig.signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(sig.timestamp)) > 3600) return false;
  const expected = Buffer.from(createHmac("sha256", key).update(sig.timestamp + sig.token).digest("hex"));
  const given = Buffer.from(sig.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const EVENT_NAMES: Record<string, string> = { failed: "failed", delivered: "delivered", opened: "opened", clicked: "clicked", unsubscribed: "unsubscribed", complained: "complained" };

/** Stores one event (once per Mailgun event id) and updates the email's delivery / open state. */
export async function recordMailgunEvent(ev: MailgunEvent) {
  const event = EVENT_NAMES[ev.event ?? ""];
  if (!ev.id || !event || !ev.recipient) return { stored: false };
  const at = ev.timestamp ? new Date(ev.timestamp * 1000) : new Date();
  const recipient = normEmail(ev.recipient);
  const logId = typeof ev["user-variables"]?.logId === "string" ? (ev["user-variables"].logId as string) : null;
  const log = logId ? await prisma.emailLog.findUnique({ where: { id: logId }, select: { id: true, tenantId: true, template: true, deliveredAt: true, openedAt: true, failedAt: true } }) : null;
  const ci = ev["client-info"];
  const client = [ci?.["client-name"], ci?.["device-type"], ci?.["client-os"]].filter((v) => v && v !== "unknown").join(" · ") || null;
  const ds = ev["delivery-status"];
  const reason = (ds?.description || ds?.message || ev.reason || "").slice(0, 300) || null;

  try {
    await prisma.emailEvent.create({
      data: {
        id: ev.id.slice(0, 100),
        logId: log?.id ?? null,
        event,
        severity: ev.severity ?? null,
        recipient,
        at,
        client: client?.slice(0, 120) ?? null,
        country: ev.geolocation?.country?.slice(0, 8) ?? null,
        city: ev.geolocation?.city?.slice(0, 80) ?? null,
        url: ev.url?.slice(0, 500) ?? null,
        reason,
      },
    });
  } catch (err) {
    // Same event delivered again by Mailgun.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { stored: false, duplicate: true };
    throw err;
  }

  if (log) {
    if (event === "delivered" && !log.deliveredAt) await prisma.emailLog.update({ where: { id: log.id }, data: { deliveredAt: at } });
    if (event === "opened") {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { openCount: { increment: 1 }, lastOpenedAt: at, ...(log.openedAt ? {} : { openedAt: at }) },
      });
    }
    if (event === "failed" && ev.severity === "permanent" && !log.failedAt) {
      await prisma.emailLog.update({ where: { id: log.id }, data: { failedAt: at, failReason: reason } });
    }
  }
  if (event === "unsubscribed" || event === "complained") {
    const last = log ?? (await lastEmailTo(recipient));
    await suppress(recipient, { reason: event === "complained" ? "complaint" : "unsubscribe", source: "mailgun", template: last?.template, tenantId: last?.tenantId });
  }
  return { stored: true };
}
