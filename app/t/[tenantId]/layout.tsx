import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { TenantSidebar } from "@/components/tenant/tenant-sidebar";
import { TenantSwitcher, UserMenu } from "@/components/tenant/topbar-menus";
import { NAV } from "@/components/tenant/nav";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { notifications, runs, workflows } from "@/lib/mock/data";
import { requireTenant, tenantsOf } from "@/lib/tenant";

// Tenant area shell (docs/09 §2): mica sidebar, acrylic topbar, white cards on the canvas.
export default async function TenantLayout({ children, params }: LayoutProps<"/t/[tenantId]">) {
  const { tenantId } = await params;
  const { user, tenant, access, role, staff } = await requireTenant(tenantId);
  const isAdmin = staff || role === "TENANT_ADMIN";
  const groups = NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => (!i.adminOnly || isAdmin) && (!i.service || tenant.isDemo || access.services.has(i.service as never))),
  })).filter((g) => g.items.length);
  const badges = {
    attention: runs.filter((r) => r.status === "NEEDS_ATTENTION").length,
    approvals: isAdmin ? workflows.filter((w) => w.status === "PENDING_APPROVAL").length : 0,
  };
  const tenants = await tenantsOf(user);
  const base = `/t/${tenant.id}`;

  return (
    <SidebarProvider>
      <TenantSidebar base={base} groups={groups} badges={badges} />
      <SidebarInset className="dg-canvas min-h-svh min-w-0">
        <header className="dg-acrylic sticky top-0 z-20 flex h-12 items-center gap-1 border-b border-border/60 px-2 sm:gap-2 sm:px-4">
          <SidebarTrigger className="size-8" aria-label="Εμφάνιση / απόκρυψη μενού" />
          <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-4 sm:block" />
          <TenantSwitcher current={{ id: tenant.id, name: tenant.name }} tenants={tenants} />
          <form action={`${base}/runs`} role="search" className="relative mx-auto hidden w-full max-w-md md:block">
            <label htmlFor="global-search" className="sr-only">
              Αναζήτηση εκτελέσεων
            </label>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="global-search"
              name="q"
              placeholder="Αναζήτηση εκτέλεσης, externalRef, μεθόδου"
              className="h-8 w-full rounded-sm border border-border/80 bg-card/80 pr-3 pl-8 text-sm outline-none focus-visible:border-sisyphus-500 focus-visible:ring-2 focus-visible:ring-sisyphus-500/30"
            />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={`${base}/notifications`}
              className="relative grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
              aria-label={`Ειδοποιήσεις (${notifications.length} νέες)`}
            >
              <Bell aria-hidden className="size-4" />
              {notifications.length > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-dg-red-500 ring-2 ring-card" />}
            </Link>
            <UserMenu name={user.name} email={user.email} staff={staff} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
