"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { addTokens } from "@/lib/ai-tokens";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

type Result = { ok: boolean; message: string };
const refresh = (tenantId?: string) => {
  revalidatePath("/admin/settings/ai");
  revalidatePath("/admin");
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`);
};

/** Approve a token pack request (when paid): the tokens are added to the tenant. */
export async function approveTokenRequest(id: string): Promise<Result> {
  const user = await requirePermission("platform.settings.manage");
  const r = await prisma.aiTokenRequest.findUnique({ where: { id } });
  if (!r || r.status !== "PENDING") return { ok: false, message: "Το αίτημα δεν είναι σε αναμονή." };
  const claimed = await prisma.aiTokenRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date() } });
  if (!claimed.count) return { ok: false, message: "Το αίτημα έχει ήδη διεκπεραιωθεί." };
  await addTokens(r.tenantId, r.tokens, { kind: "topup", note: `Πακέτο ${r.tokens.toLocaleString("el-GR")} tokens · ${Number(r.priceEur).toLocaleString("el-GR")} €`, by: user.id, requestId: r.id });
  await audit({ actorId: user.id, action: "ai.tokens.approve", entity: "AiTokenRequest", entityId: id, tenantId: r.tenantId, meta: { tokens: r.tokens, priceEur: Number(r.priceEur) } });
  refresh(r.tenantId);
  return { ok: true, message: `Προστέθηκαν ${r.tokens.toLocaleString("el-GR")} tokens.` };
}

export async function rejectTokenRequest(id: string): Promise<Result> {
  const user = await requirePermission("platform.settings.manage");
  const r = await prisma.aiTokenRequest.findUnique({ where: { id }, select: { tenantId: true, status: true } });
  if (!r || r.status !== "PENDING") return { ok: false, message: "Το αίτημα δεν είναι σε αναμονή." };
  await prisma.aiTokenRequest.update({ where: { id }, data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date() } });
  await audit({ actorId: user.id, action: "ai.tokens.reject", entity: "AiTokenRequest", entityId: id, tenantId: r.tenantId });
  refresh(r.tenantId);
  return { ok: true, message: "Το αίτημα απορρίφθηκε." };
}

/** Manual change of a tenant's tokens (+ add, − remove), with a note. */
export async function adjustTenantTokens(tenantId: string, tokens: number, note: string): Promise<Result> {
  const user = await requirePermission("platform.settings.manage");
  if (!Number.isInteger(tokens) || tokens === 0 || Math.abs(tokens) > 2_000_000_000) return { ok: false, message: "Δώστε αριθμό tokens." };
  await addTokens(tenantId, tokens, { kind: tokens > 0 ? "topup" : "adjust", note: note.trim().slice(0, 200) || (tokens > 0 ? "Προσθήκη από διαχειριστή" : "Αφαίρεση από διαχειριστή"), by: user.id });
  await audit({ actorId: user.id, action: "ai.tokens.adjust", entity: "Tenant", entityId: tenantId, tenantId, meta: { tokens, note } });
  refresh(tenantId);
  return { ok: true, message: `${tokens > 0 ? "Προστέθηκαν" : "Αφαιρέθηκαν"} ${Math.abs(tokens).toLocaleString("el-GR")} tokens.` };
}
