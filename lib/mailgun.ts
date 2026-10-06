import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

// Mailgun HTTP API (EU region by default: api.eu.mailgun.net). The API key is stored encrypted in
// email_settings; every message is sent as multipart form data with HTML + plain-text parts.

const AAD = "email_settings:default";

export async function getEmailSettings() {
  return (
    (await prisma.emailSettings.findUnique({ where: { id: "default" } })) ?? (await prisma.emailSettings.create({ data: { id: "default" } }))
  );
}

export const sealMailgunKey = (key: string) => encrypt(key, AAD);

const apiBase = (region: string) => (region === "US" ? "https://api.mailgun.net" : "https://api.eu.mailgun.net");

export type MailgunConfig = { apiKey: string; domain: string; region: string };

export async function mailgunConfig(): Promise<MailgunConfig & { settings: Awaited<ReturnType<typeof getEmailSettings>> }> {
  const settings = await getEmailSettings();
  if (!settings.apiKeyEnc || !settings.domain) throw new Error("Δεν έχει ρυθμιστεί το Mailgun (Ρυθμίσεις → Email).");
  return { apiKey: decrypt(settings.apiKeyEnc, AAD), domain: settings.domain, region: settings.region, settings };
}

const auth = (key: string) => `Basic ${Buffer.from(`api:${key}`).toString("base64")}`;

async function mgError(res: Response) {
  const text = await res.text();
  let msg = text.slice(0, 300);
  try {
    msg = (JSON.parse(text) as { message?: string }).message ?? msg;
  } catch {}
  return new Error(`Mailgun ${res.status}: ${msg}`);
}

/** Checks key + domain (GET /v4/domains/{domain}); returns the domain state (active / unverified …). */
export async function checkMailgun(cfg: MailgunConfig) {
  const res = await fetch(`${apiBase(cfg.region)}/v4/domains/${encodeURIComponent(cfg.domain)}`, {
    headers: { Authorization: auth(cfg.apiKey) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await mgError(res);
  const body = (await res.json()) as { domain?: { state?: string } };
  return { state: body.domain?.state ?? "unknown" };
}

export type OutgoingMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  bcc?: string | null;
  tags?: string[];
};

export async function mailgunSend(cfg: MailgunConfig, m: OutgoingMessage): Promise<string> {
  const form = new FormData();
  form.set("from", m.from);
  for (const to of m.to) form.append("to", to);
  if (m.bcc) form.set("bcc", m.bcc);
  form.set("subject", m.subject);
  form.set("html", m.html);
  form.set("text", m.text);
  if (m.replyTo) form.set("h:Reply-To", m.replyTo);
  for (const t of m.tags ?? []) form.append("o:tag", t);
  const res = await fetch(`${apiBase(cfg.region)}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
    method: "POST",
    headers: { Authorization: auth(cfg.apiKey) },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw await mgError(res);
  return ((await res.json()) as { id?: string }).id ?? "";
}
