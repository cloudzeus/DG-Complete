import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboards/dashboard-sidebar";
import { KimonLauncher } from "@/components/kimon/kimon-launcher";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { dashboardTenants, requireDashboardTenant } from "@/lib/dashboards";
import { isPlatformStaff } from "@/lib/rbac";

export default async function DashboardsLayout({ children, params }: LayoutProps<"/dashboards/[tenantId]">) {
  const { tenantId } = await params;
  const { user, tenant, access } = await requireDashboardTenant(tenantId);
  const tenants = await dashboardTenants(user);
  const staff = isPlatformStaff(user);

  return (
    <SidebarProvider>
      <DashboardSidebar
        tenantId={tenant.id}
        tenants={tenants}
        user={{ name: user.name, email: user.email }}
        staff={staff}
        pages={[...access.pages]}
      />
      <SidebarInset className="dg-canvas min-h-svh min-w-0">
        <header className="dg-acrylic sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-border/60 px-4">
          <SidebarTrigger className="-ml-1 size-9" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="truncate text-xs font-medium text-muted-foreground">{tenant.name}</span>
          {tenant.isDemo && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-700 ring-1 ring-amber-200 ring-inset">Demo</span>
          )}
          {staff && (
            <nav aria-label="Διαχείριση πλατφόρμας" className="ml-auto flex shrink-0 items-center gap-1">
              <Link
                href={`/admin/tenants/${tenant.id}`}
                className="hidden min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
              >
                <Building2 className="size-3.5" /> Ο πελάτης στη διαχείριση
              </Link>
              <Link
                href="/admin"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-dg-red-50 px-2.5 text-xs font-medium text-dg-red-700 ring-1 ring-dg-red-200 ring-inset hover:bg-dg-red-100 dark:bg-white/5 dark:text-dg-red-200"
              >
                <ArrowLeft className="size-3.5" /> Διαχείριση
              </Link>
            </nav>
          )}
        </header>
        <main className="mx-auto w-full max-w-7xl min-w-0 space-y-5 px-4 pt-5 pb-24 has-[[data-kimon-page]]:pb-5 sm:px-6">{children}</main>
        {access.services.has("kimon") && <KimonLauncher tenantId={tenant.id} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
