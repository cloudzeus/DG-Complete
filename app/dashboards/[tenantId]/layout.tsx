import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { DgLogo } from "@/components/brand/dg-logo";
import { DashboardNav } from "@/components/dashboards/dashboard-nav";
import { dashboardTenants, requireDashboardTenant } from "@/lib/dashboards";
import { isPlatformStaff } from "@/lib/rbac";

export default async function DashboardsLayout({ children, params }: LayoutProps<"/dashboards/[tenantId]">) {
  const { tenantId } = await params;
  const { user, tenant } = await requireDashboardTenant(tenantId);
  const tenants = await dashboardTenants(user);
  const staff = isPlatformStaff(user);

  return (
    <div className="dg-canvas min-h-svh">
      <header className="dg-acrylic sticky top-0 z-20 border-b border-border/60">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboards" className="flex items-center gap-2">
            <DgLogo className="size-7 text-dg-red-500" title="DGsoft" />
            <span className="text-sm font-semibold tracking-tight">
              DGsmart <span className="text-dg-red-500">BI</span>
            </span>
          </Link>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {tenant.name}</span>
          {tenant.isDemo && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-700 ring-1 ring-amber-200 ring-inset">Demo</span>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {staff && (
              <Link href={`/admin/tenants/${tenant.id}`} className="inline-flex min-h-9 items-center gap-1 hover:text-foreground">
                <ArrowLeft className="size-3.5" /> Διαχείριση
              </Link>
            )}
            <span className="hidden sm:inline">{user.name}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl min-w-0 space-y-5 px-4 py-5 sm:px-6">
        <Suspense>
          <DashboardNav tenantId={tenant.id} tenants={tenants} />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
