"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { SERVICE_KEYS, withRequirements } from "@/lib/services";
import { forgetTenantAccess } from "@/lib/tenant-services";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Δώστε όνομα").max(80),
  description: z.string().trim().max(500).optional(),
  services: z.array(z.enum(SERVICE_KEYS as [string, ...string[]])).min(1, "Επιλέξτε τουλάχιστον μία υπηρεσία"),
  period: z.enum(["MONTHLY", "YEARLY"]),
  price: z.number("Μη έγκυρη τιμή").min(0).max(1_000_000),
  active: z.boolean(),
});
export type PlanInput = z.input<typeof schema>;

const refresh = () => {
  revalidatePath("/admin/plans", "layout");
  revalidatePath("/admin/tenants", "layout");
};

export async function savePlan(input: PlanInput): Promise<{ ok: boolean; message: string; id?: string }> {
  const user = await requirePermission("platform.plans.manage");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const v = parsed.data;
  const data = {
    name: v.name,
    description: v.description || null,
    services: withRequirements(v.services),
    period: v.period,
    price: v.price.toFixed(2),
    active: v.active,
  };
  const plan = v.id ? await prisma.plan.update({ where: { id: v.id }, data }) : await prisma.plan.create({ data });
  forgetTenantAccess(); // tenants on this plan see the change within the request
  await audit({ actorId: user.id, action: v.id ? "plan.update" : "plan.create", entity: "Plan", entityId: plan.id, meta: { name: v.name, services: data.services, price: v.price } });
  refresh();
  return { ok: true, message: v.id ? "Το πακέτο ενημερώθηκε." : "Το πακέτο δημιουργήθηκε.", id: plan.id };
}

export async function deletePlan(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("platform.plans.manage");
  const inUse = await prisma.tenant.count({ where: { planId: id } });
  if (inUse) return { ok: false, message: `Το πακέτο έχουν ${inUse} πελάτες — απενεργοποιήστε το αντί να το διαγράψετε.` };
  await prisma.plan.delete({ where: { id } });
  await audit({ actorId: user.id, action: "plan.delete", entity: "Plan", entityId: id });
  refresh();
  return { ok: true, message: "Το πακέτο διαγράφηκε." };
}
