"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { tokenPackages } from "@/lib/ai-tokens";
import { APP_URL, sendTemplate } from "@/lib/email";
import { getAiSettings } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { can, requireUser } from "@/lib/rbac";

type Result = { ok: boolean; message: string };

/** A tenant asks for a token pack; we invoice it and approve it when paid. */
export async function requestTokenPack(tenantId: string, tokens: number): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "tenant.billing.manage", tenantId)) return { ok: false, message: "Μόνο ο διαχειριστής της εταιρείας μπορεί να ζητήσει tokens." };
  const pack = (await tokenPackages()).find((p) => p.tokens === tokens);
  if (!pack) return { ok: false, message: "Το πακέτο δεν είναι διαθέσιμο." };
  if (await prisma.aiTokenRequest.count({ where: { tenantId, status: "PENDING" } })) {
    return { ok: false, message: "Υπάρχει ήδη αίτημα σε αναμονή." };
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const r = await prisma.aiTokenRequest.create({ data: { tenantId, tokens: pack.tokens, priceEur: pack.priceEur.toFixed(2), requestedById: user.id } });
  await audit({ actorId: user.id, action: "ai.tokens.request", entity: "AiTokenRequest", entityId: r.id, tenantId, meta: pack });
  const settings = await getAiSettings();
  if (settings.alertEmail) {
    await sendTemplate({
      template: "ai_token_request",
      to: [settings.alertEmail],
      force: true,
      dedupeKey: `ai-token-request:${r.id}`,
      vars: {
        tenant: tenant?.name ?? tenantId,
        amount: `${pack.priceEur.toLocaleString("el-GR", { minimumFractionDigits: 2 })} €`,
        name: user.name ?? user.email,
        description: `${pack.tokens.toLocaleString("el-GR")} tokens`,
        link: `${APP_URL}/admin`,
      },
    }).catch(() => undefined);
  }
  revalidatePath(`/dashboards/${tenantId}/ai-tokens`);
  return { ok: true, message: "Το αίτημα στάλθηκε. Θα λάβετε παραστατικό και τα tokens θα προστεθούν με την πληρωμή." };
}

export async function cancelTokenRequest(tenantId: string, id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user, "tenant.billing.manage", tenantId)) return { ok: false, message: "Δεν έχετε δικαίωμα." };
  const r = await prisma.aiTokenRequest.updateMany({ where: { id, tenantId, status: "PENDING" }, data: { status: "CANCELED", decidedById: user.id, decidedAt: new Date() } });
  revalidatePath(`/dashboards/${tenantId}/ai-tokens`);
  return r.count ? { ok: true, message: "Το αίτημα ακυρώθηκε." } : { ok: false, message: "Το αίτημα δεν είναι σε αναμονή." };
}
