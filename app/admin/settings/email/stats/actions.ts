"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { APP_URL } from "@/lib/email";
import { lastEmailTo, normEmail, suppress } from "@/lib/email-tracking";
import { mailgunConfig, mailgunSuppressions, registerWebhooks, removeMailgunSuppression, sealWebhookKey } from "@/lib/mailgun";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const PATH = "/admin/settings/email/stats";
export type ActionResult = { ok: boolean; message: string };

export async function saveTracking(input: { webhookKey: string; trackOpens: boolean }): Promise<ActionResult> {
  const user = await requirePermission("platform.settings.manage");
  const key = input.webhookKey.trim();
  if (key && !/^[\w-]{16,200}$/.test(key)) return { ok: false, message: "Το signing key δεν μοιάζει έγκυρο." };
  await prisma.emailSettings.update({
    where: { id: "default" },
    data: { trackOpens: input.trackOpens, ...(key ? { webhookKeyEnc: sealWebhookKey(key), webhookKeyHint: `…${key.slice(-4)}` } : {}) },
  });
  await audit({ actorId: user.id, action: "email.tracking", entity: "EmailSettings", entityId: "default", meta: { trackOpens: input.trackOpens, keyChanged: !!key } });
  revalidatePath(PATH);
  return { ok: true, message: "Αποθηκεύτηκε." };
}

/** Registers complete.dgsmart.gr/api/webhooks/mailgun for every tracked event of the sending domain. */
export async function registerMailgunWebhooks(): Promise<ActionResult> {
  const user = await requirePermission("platform.settings.manage");
  try {
    const cfg = await mailgunConfig();
    const { changed } = await registerWebhooks(cfg, `${APP_URL}/api/webhooks/mailgun`);
    await audit({ actorId: user.id, action: "email.webhooks", entity: "EmailSettings", entityId: "default", meta: { changed } });
    return { ok: true, message: changed.length ? `Καταχωρήθηκαν τα webhooks: ${changed.join(", ")}.` : "Τα webhooks ήταν ήδη καταχωρημένα." };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}

/** Copies Mailgun's unsubscribes and spam complaints into the local list. */
export async function importMailgunSuppressions(): Promise<ActionResult> {
  await requirePermission("platform.settings.manage");
  try {
    const cfg = await mailgunConfig();
    const items = await mailgunSuppressions(cfg);
    const existing = new Set((await prisma.emailSuppression.findMany({ select: { email: true } })).map((r) => r.email));
    let added = 0;
    for (const i of items) {
      if (existing.has(i.email)) continue;
      const last = await lastEmailTo(i.email);
      await prisma.emailSuppression.create({
        data: { email: i.email, reason: i.reason, source: "mailgun", template: last?.template ?? null, tenantId: last?.tenantId ?? null, createdAt: i.at },
      });
      existing.add(i.email);
      added++;
    }
    revalidatePath(PATH);
    return { ok: true, message: `Mailgun: ${items.length} διευθύνσεις, ${added} νέες στη λίστα.` };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}

export async function addSuppression(email: string): Promise<ActionResult> {
  const user = await requirePermission("platform.settings.manage");
  const parsed = z.email().safeParse(normEmail(email));
  if (!parsed.success) return { ok: false, message: "Μη έγκυρο email." };
  const last = await lastEmailTo(parsed.data);
  await suppress(parsed.data, { reason: "admin", source: "admin", template: last?.template, tenantId: last?.tenantId });
  await audit({ actorId: user.id, action: "email.suppression.add", entity: "EmailSuppression", entityId: parsed.data });
  revalidatePath(PATH);
  return { ok: true, message: `Το ${parsed.data} δεν θα λαμβάνει υπενθυμίσεις.` };
}

/** Re-subscribes an address: removed from the local list and from Mailgun's lists. */
export async function removeSuppression(email: string): Promise<ActionResult> {
  const user = await requirePermission("platform.settings.manage");
  const e = normEmail(email);
  try {
    await removeMailgunSuppression(await mailgunConfig(), e);
  } catch (err) {
    return { ok: false, message: `Mailgun: ${(err as Error).message.slice(0, 200)}` };
  }
  await prisma.emailSuppression.deleteMany({ where: { email: e } });
  await audit({ actorId: user.id, action: "email.suppression.remove", entity: "EmailSuppression", entityId: e });
  revalidatePath(PATH);
  return { ok: true, message: `Το ${e} θα λαμβάνει ξανά υπενθυμίσεις.` };
}
