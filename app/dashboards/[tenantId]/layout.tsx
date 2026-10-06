import { DashboardSidebar } from "@/components/dashboards/dashboard-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { dashboardTenants, requireDashboardTenant } from "@/lib/dashboards";
import { isPlatformStaff } from "@/lib/rbac";

export default async function DashboardsLayout({ children, params }: LayoutProps<"/dashboards/[tenantId]">) {
  const { tenantId } = await params;
  const { user, tenant } = await requireDashboardTenant(tenantId);
  const tenants = await dashboardTenants(user);

  return (
    <SidebarProvider>
      <DashboardSidebar
        tenantId={tenant.id}
        tenants={tenants}
        user={{ name: user.name, email: user.email }}
        staff={isPlatformStaff(user)}
      />
      <SidebarInset className="dg-canvas min-h-svh min-w-0">
        <header className="dg-acrylic sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-border/60 px-4">
          <SidebarTrigger className="-ml-1 size-9" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="truncate text-xs font-medium text-muted-foreground">{tenant.name}</span>
          {tenant.isDemo && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-700 ring-1 ring-amber-200 ring-inset">Demo</span>
          )}
        </header>
        <main className="mx-auto w-full max-w-7xl min-w-0 space-y-5 px-4 py-5 sm:px-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
