"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { extendSubscription, sendPaymentReceipt } from "@/lib/email";
import { postPaymentToSoftOne, type PostResult } from "@/lib/softone-billing";

const schema = z.object({
  tenantId: z.string().min(1),
  amount: z.coerce.number().positive("Θετικό ποσό").max(1_000_000),
  description: z.string().trim().min(3, "Δώστε περιγραφή").max(200),
  method: z.enum(["CARD", "BANK_TRANSFER", "CASH", "VIVA"]),
  paidAt: z.coerce.date(),
  postToSoftOne: z.boolean(),
  sendReceipt: z.boolean(),
});

export type PaymentFormState = {
  ok?: boolean;
  message?: string;
  errors?: Partial<Record<keyof z.infer<typeof schema>, string>>;
};

function refresh(tenantId: string) {
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/payments");
}

/** Manual payment entry (bank transfer, card terminal…). Viva payments arrive via webhook in Phase 3. */
export async function recordPayment(_prev: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const user = await requirePermission("tenant.billing.manage", String(formData.get("tenantId") ?? "") || undefined);
  const parsed = schema.safeParse({
    tenantId: formData.get("tenantId"),
    amount: String(formData.get("amount") ?? "").replace(",", "."),
    description: formData.get("description"),
    method: formData.get("method"),
    paidAt: formData.get("paidAt"),
    postToSoftOne: formData.get("postToSoftOne") === "on",
    sendReceipt: formData.get("sendReceipt") === "on",
  });
  if (!parsed.success) {
    const errors: PaymentFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as keyof typeof errors] ??= i.message;
    return { errors };
  }
  const input = parsed.data;
  const payment = await prisma.payment.create({
    data: {
      tenantId: input.tenantId,
      amount: input.amount.toFixed(2),
      description: input.description,
      method: input.method,
      paidAt: input.paidAt,
      status: "PAID",
      createdById: user.id,
    },
  });
  await audit({
    actorId: user.id,
    action: "payment.create",
    entity: "Payment",
    entityId: payment.id,
    tenantId: input.tenantId,
    meta: { amount: input.amount, method: input.method },
  });

  // A payment extends the tenant's subscription by one period (when a subscription is set).
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { subscriptionPeriod: true, subscriptionEndsAt: true },
  });
  let extended: Date | null = null;
  if (tenant?.subscriptionPeriod) {
    extended = extendSubscription(tenant.subscriptionEndsAt, tenant.subscriptionPeriod, input.paidAt);
    await prisma.tenant.update({ where: { id: input.tenantId }, data: { subscriptionEndsAt: extended } });
  }

  let message = "Η πληρωμή καταχωρήθηκε.";
  if (input.postToSoftOne) {
    const r = await postPaymentToSoftOne(payment.id);
    message = r.ok ? `Η πληρωμή καταχωρήθηκε και στάλθηκε στο SoftOne ${r.fincode ? `(${r.fincode})` : ""}.` : `Η πληρωμή καταχωρήθηκε, αλλά η αποστολή στο SoftOne απέτυχε: ${r.error}`;
  }
  if (extended) message += ` Η συνδρομή ισχύει έως ${extended.toLocaleDateString("el-GR")}.`;
  if (input.sendReceipt) {
    const r = await sendPaymentReceipt(payment.id);
    message += r.ok ? " Στάλθηκε αποδεικτικό με email." : r.skipped && !r.error ? "" : ` Το αποδεικτικό δεν στάλθηκε: ${r.error}`;
  }
  refresh(input.tenantId);
  return { ok: true, message };
}

export async function postPayment(paymentId: string): Promise<PostResult> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { tenantId: true } });
  if (!payment) return { ok: false, error: "Η πληρωμή δεν βρέθηκε." };
  const user = await requirePermission("tenant.billing.manage", payment.tenantId);
  const result = await postPaymentToSoftOne(paymentId);
  await audit({
    actorId: user.id,
    action: "payment.s1.post",
    entity: "Payment",
    entityId: paymentId,
    tenantId: payment.tenantId,
    meta: result.ok ? { findoc: result.findoc, fincode: result.fincode } : { error: result.error },
  });
  refresh(payment.tenantId);
  return result;
}
