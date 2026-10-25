import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { withRequirements } from "@/lib/services";
import { PlanWizard } from "../plan-wizard";

export const metadata: Metadata = { title: "Πακέτο" };

export default async function PlanPage({ params }: PageProps<"/admin/plans/[id]">) {
  await requirePermission("platform.plans.manage");
  const { id } = await params;
  const plan = id === "new" ? null : await prisma.plan.findUnique({ where: { id }, include: { _count: { select: { tenants: true } } } });
  if (id !== "new" && !plan) notFound();

  return (
    <>
      <PageHeader eyebrow="Πακέτα" title={plan ? plan.name : "Νέο πακέτο"} icon={Package} tone="violet" />
      <PlanWizard
        tenants={plan?._count.tenants ?? 0}
        initial={
          plan
            ? {
                id: plan.id,
                name: plan.name,
                description: plan.description ?? "",
                services: withRequirements(plan.services),
                period: plan.period,
                price: plan.price.toString(),
                aiTokens: plan.aiTokensMonthly ? String(plan.aiTokensMonthly) : "",
                active: plan.active,
              }
            : { name: "", description: "", services: ["workflows"], period: "YEARLY", price: "", aiTokens: "", active: true }
        }
      />
    </>
  );
}
