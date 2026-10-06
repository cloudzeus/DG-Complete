"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

const schema = z.object({
  period: z.enum(["", "MONTHLY", "YEARLY"]),
  amount: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s.replace(",", "."))))
    .pipe(z.number("Μη έγκυρο ποσό").min(0).max(1_000_000).nullable()),
  endsAt: z.union([z.literal(""), z.iso.date()]),
  email: z.union([z.literal(""), z.email("Μη έγκυρο email")]),
});

export async function saveSubscription(tenantId: string, input: z.input<typeof schema>) {
  const user = await requirePermission("tenant.billing.manage", tenantId);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const v = parsed.data;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      subscriptionPeriod: v.period || null,
      subscriptionAmount: v.amount === null ? null : v.amount.toFixed(2),
      // End of that day, Athens (≈ 21:59 UTC) — reminders count calendar days in Athens.
      subscriptionEndsAt: v.endsAt ? new Date(`${v.endsAt}T21:59:00Z`) : null,
      email: v.email || null,
    },
  });
  await audit({ actorId: user.id, action: "tenant.subscription", entity: "Tenant", entityId: tenantId, tenantId, meta: v });
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true, message: "Η συνδρομή αποθηκεύτηκε." };
}
