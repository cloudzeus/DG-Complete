"use server";

import { lastEmailTo, suppress, verifyUnsubscribeToken } from "@/lib/email-tracking";

export async function confirmUnsubscribe(email: string, token: string) {
  if (!verifyUnsubscribeToken(email, token)) return { ok: false };
  const last = await lastEmailTo(email);
  await suppress(email, { reason: "unsubscribe", source: "link", template: last?.template, tenantId: last?.tenantId });
  return { ok: true };
}
