import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { PaymentsTable } from "@/components/admin/payments-table";
import { PaymentDialog } from "./payment-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";

export const metadata: Metadata = { title: "Πληρωμές" };

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const user = await requirePermission("tenants.read");
  const { s1 } = await searchParams;
  const onlyPending = s1 === "pending";
  const payments = await prisma.payment.findMany({
    where: onlyPending ? { status: "PAID", s1Status: { in: ["NOT_POSTED", "FAILED"] } } : undefined,
    orderBy: { paidAt: "desc" },
    take: 200,
    include: { tenant: { select: { id: true, name: true } } },
  });
  const canBill = can(user, "tenant.billing.manage");
  const tenants = canBill
    ? await prisma.tenant.findMany({ where: { status: { not: "CANCELED" } }, select: { id: true, name: true, s1Trdr: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <>
      <PageHeader
        title="Πληρωμές"
        description="Όλες οι πληρωμές συνδρομών και η καταχώρισή τους στο SoftOne της DGsoft."
        icon={CreditCard}
        tone="green"
        actions={
          <a href={onlyPending ? "/admin/payments" : "/admin/payments?s1=pending"} className="text-sm text-primary hover:underline">
            {onlyPending ? "Όλες" : "Μόνο εκκρεμείς προς SoftOne"}
          </a>
        }
      />
      <Card>
        <CardContent>
          <PaymentsTable
            canPost={canBill}
            payments={payments.map((p) => ({ ...p, paidAt: p.paidAt.toISOString(), amount: p.amount.toString() }))}
            toolbar={canBill ? <PaymentDialog tenants={tenants.map((t) => ({ id: t.id, name: t.name, linked: !!t.s1Trdr }))} /> : null}
          />
        </CardContent>
      </Card>
    </>
  );
}
