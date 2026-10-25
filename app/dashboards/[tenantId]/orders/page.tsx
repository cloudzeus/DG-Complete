import type { Metadata } from "next";
import { DashboardErrors } from "@/components/dashboards/blocks";
import { OrderEditor } from "@/components/orders/order-editor";
import { OrdersTabs } from "@/components/orders/orders-tabs";
import { requireDashboardTenant } from "@/lib/dashboards";
import { orderBrands, orderSuppliers, orderTarget, type OrderBrand, type OrderSupplier } from "@/lib/purchase-orders";
import { can } from "@/lib/rbac";

export const metadata: Metadata = { title: "Παραγγελίες αγορών" };

export default async function OrdersPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/orders">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const initialBrand = Number(sp.brand) || null;
  const { user, access } = await requireDashboardTenant(tenantId, "orders");
  const canCreate = can(user, "tenant.orders.create", tenantId);
  let suppliers: OrderSupplier[] = [];
  let brands: OrderBrand[] = [];
  let error: string | null = null;
  try {
    [suppliers, brands] = await Promise.all([orderSuppliers(tenantId), orderBrands(tenantId)]);
  } catch (e) {
    error = (e as Error).message;
  }
  const target = canCreate ? await orderTarget(tenantId) : null;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Παραγγελίες αγορών</h1>
        <p className="text-xs text-muted-foreground">
          Οι προτάσεις παραγγελίας ανά κύριο προμηθευτή: είδη που το απόθεμά τους δεν καλύπτει τον χρόνο παράδοσης. Αναζητήστε οποιονδήποτε προμηθευτή ή μάρκα, δείτε όλα τα είδη του ή προσθέστε είδη, διορθώστε ποσότητες,
          αφαιρέστε γραμμές, κατεβάστε σε Excel ή δημιουργήστε την παραγγελία απευθείας στο SoftOne.
        </p>
      </div>
      <OrdersTabs tenantId={tenantId} active="editor" smart={access.pages.has("orders-smart")} />
      {error && <DashboardErrors errors={[error]} />}
      <OrderEditor tenantId={tenantId} suppliers={suppliers} brands={brands} initialBrand={initialBrand} canCreate={canCreate} problem={target?.problem ?? null} series={target?.series ?? []} />
    </>
  );
}
