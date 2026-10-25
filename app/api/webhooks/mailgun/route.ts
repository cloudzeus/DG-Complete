import { NextResponse } from "next/server";
import { recordMailgunEvent, verifyMailgunSignature, type MailgunWebhook } from "@/lib/email-tracking";
import { getEmailSettings, openWebhookKey } from "@/lib/mailgun";

// Mailgun webhook (Ρυθμίσεις → Email → Στατιστικά registers it): deliveries, opens, failures,
// unsubscribes and spam complaints. The signature is checked before anything is stored.

export async function POST(request: Request) {
  const raw = await request.text();
  let body: MailgunWebhook;
  try {
    body = JSON.parse(raw) as MailgunWebhook;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const settings = await getEmailSettings();
  if (!settings.webhookKeyEnc) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!verifyMailgunSignature(body.signature, openWebhookKey(settings.webhookKeyEnc))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (!body["event-data"]) return NextResponse.json({ ok: true });
  try {
    return NextResponse.json({ ok: true, ...(await recordMailgunEvent(body["event-data"])) });
  } catch (err) {
    console.error("[mailgun webhook]", (err as Error).message);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
