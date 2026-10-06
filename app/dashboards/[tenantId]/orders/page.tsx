import type { Metadata } from "next";
import { DashboardErrors } from "@/components/dashboards/blocks";
import { OrderEditor } from "@/components/orders/order-editor";
import { requireDashboardTenant } from "@/lib/dashboards";
import { orderSuppliers, orderTarget, type OrderSupplier } from "@/lib/purchase-orders";
import { can } from "@/lib/rbac";

export const metadata: Metadata = { title: "Παραγγελίες αγορών" };

export default async function OrdersPage({ params }: PageProps<"/dashboards/[tenantId]/orders">) {
  const { tenantId } = await params;
  const { user } = await requireDashboardTenant(tenantId);
  const canCreate = can(user, "tenant.orders.create", tenantId);
  let suppliers: OrderSupplier[] = [];
  let error: string | null = null;
  try {
    suppliers = await orderSuppliers(tenantId);
  } catch (e) {
    error = (e as Error).message;
  }
  const target = canCreate ? await orderTarget(tenantId) : null;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Παραγγελίες αγορών</h1>
        <p className="text-xs text-muted-foreground">
          Οι προτάσεις παραγγελίας ανά κύριο προμηθευτή: είδη που το απόθεμά τους δεν καλύπτει τον χρόνο παράδοσης. Διορθώστε ποσότητες,
          αφαιρέστε γραμμές, κατεβάστε σε Excel ή δημιουργήστε την παραγγελία απευθείας στο SoftOne.
        </p>
      </div>
      {error && <DashboardErrors errors={[error]} />}
      <OrderEditor tenantId={tenantId} suppliers={suppliers} canCreate={canCreate} problem={target?.problem ?? null} series={target?.series ?? []} />
    </>
  );
}
