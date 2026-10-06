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
  headers?: Record<string, string>;
  /** Custom variables, returned in every webhook event (user-variables). */
  variables?: Record<string, string>;
  trackOpens?: boolean;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
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
  for (const [k, v] of Object.entries(m.headers ?? {})) form.set(`h:${k}`, v);
  for (const [k, v] of Object.entries(m.variables ?? {})) form.set(`v:${k}`, v);
  // Opens only: click tracking would rewrite the password / welcome links through Mailgun.
  form.set("o:tracking-opens", m.trackOpens ? "yes" : "no");
  form.set("o:tracking-clicks", "no");
  for (const a of m.attachments ?? []) form.append("attachment", new Blob([a.content as BlobPart], { type: a.contentType }), a.filename);
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

// ───────────── Webhooks & suppressions ─────────────

export const sealWebhookKey = (key: string) => encrypt(key, `${AAD}:webhook`);
export const openWebhookKey = (enc: string) => decrypt(enc, `${AAD}:webhook`);

export const WEBHOOK_EVENTS = ["delivered", "opened", "clicked", "permanent_fail", "temporary_fail", "unsubscribed", "complained"] as const;

async function mg(cfg: MailgunConfig, path: string, init: RequestInit = {}) {
  const res = await fetch(`${apiBase(cfg.region)}${path}`, {
    ...init,
    headers: { Authorization: auth(cfg.apiKey) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return res;
}

/** Points every tracked event of the domain at our webhook URL (keeps other URLs already there). */
export async function registerWebhooks(cfg: MailgunConfig, url: string) {
  const d = encodeURIComponent(cfg.domain);
  const res = await mg(cfg, `/v3/domains/${d}/webhooks`);
  if (!res.ok) throw await mgError(res);
  const current = ((await res.json()) as { webhooks?: Record<string, { urls?: string[] }> }).webhooks ?? {};
  const changed: string[] = [];
  for (const id of WEBHOOK_EVENTS) {
    const urls = current[id]?.urls ?? [];
    if (urls.includes(url)) continue;
    const form = new FormData();
    for (const u of [...urls.slice(0, 2), url]) form.append("url", u);
    let r: Response;
    if (current[id]) {
      r = await mg(cfg, `/v3/domains/${d}/webhooks/${id}`, { method: "PUT", body: form });
    } else {
      form.set("id", id);
      r = await mg(cfg, `/v3/domains/${d}/webhooks`, { method: "POST", body: form });
    }
    if (!r.ok) throw await mgError(r);
    changed.push(id);
  }
  return { changed };
}

/** Unsubscribes + spam complaints stored in Mailgun for the domain. */
export async function mailgunSuppressions(cfg: MailgunConfig) {
  const out: { email: string; reason: "unsubscribe" | "complaint"; at: Date }[] = [];
  for (const [kind, reason] of [["unsubscribes", "unsubscribe"], ["complaints", "complaint"]] as const) {
    let path: string | null = `/v3/${encodeURIComponent(cfg.domain)}/${kind}?limit=1000`;
    for (let page = 0; path && page < 20; page++) {
      const res = await mg(cfg, path);
      if (!res.ok) throw await mgError(res);
      const body = (await res.json()) as { items?: { address: string; created_at?: string }[]; paging?: { next?: string } };
      const items = body.items ?? [];
      for (const i of items) out.push({ email: i.address.toLowerCase(), reason, at: i.created_at ? new Date(i.created_at) : new Date() });
      path = items.length && body.paging?.next ? body.paging.next.replace(/^https:\/\/[^/]+/, "") : null;
    }
  }
  return out;
}

/** Lets Mailgun deliver to the address again (no error if it was not listed). */
export async function removeMailgunSuppression(cfg: MailgunConfig, email: string) {
  for (const kind of ["unsubscribes", "complaints"]) {
    const res = await mg(cfg, `/v3/${encodeURIComponent(cfg.domain)}/${kind}/${encodeURIComponent(email)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw await mgError(res);
  }
}
