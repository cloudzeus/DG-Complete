import { requireTenant } from "@/lib/tenant";

// Tenant area. The full shell (sidebar, IA of docs/09) comes with P01.
export default async function TenantLayout({ children, params }: LayoutProps<"/t/[tenantId]">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card px-4 py-3 sm:px-8">
        <span className="text-xs font-medium text-muted-foreground">DG Complete · {tenant.name}</span>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">{children}</main>
    </div>
  );
}
