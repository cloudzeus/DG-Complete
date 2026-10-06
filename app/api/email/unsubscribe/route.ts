import { NextResponse } from "next/server";
import { lastEmailTo, suppress, verifyUnsubscribeToken } from "@/lib/email-tracking";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post): mail clients POST here directly.

export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!email || !verifyUnsubscribeToken(email, token)) return NextResponse.json({ error: "invalid link" }, { status: 400 });
  const last = await lastEmailTo(email);
  await suppress(email, { reason: "unsubscribe", source: "link", template: last?.template, tenantId: last?.tenantId });
  return NextResponse.json({ ok: true });
}
