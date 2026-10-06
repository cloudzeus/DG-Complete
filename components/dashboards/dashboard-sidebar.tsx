"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  Building2,
  ChartColumnBig,
  ChevronsUpDown,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  Factory,
  LogOut,
  MapPinned,
  Scale,
  ShieldCheck,
  Package,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Warehouse,
  Webhook,
  type LucideIcon, Bell, Coins, RefreshCw, Target, TrendingUp, UserSearch } from "lucide-react";
import { DgLogo } from "@/components/brand/dg-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// Navigation of the BI workspace (tenant users and platform staff). Dashboards are grouped by
// business area; the period (?period/from/to) is kept when moving between them.

type NavItem = { slug: string; label: string; icon: LucideIcon };
const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Γενικά",
    items: [
      { slug: "", label: "Επισκόπηση", icon: LayoutDashboard },
      { slug: "kimon", label: "Κίμων — σύμβουλος", icon: Sparkles },
    ],
  },
  {
    label: "Οικονομικά",
    items: [
      { slug: "pnl", label: "Αποτελέσματα χρήσης", icon: Scale },
      { slug: "cash", label: "Ταμειακά", icon: Landmark },
      { slug: "working-capital", label: "Κεφάλαιο κίνησης", icon: RefreshCw },
      { slug: "planning", label: "Πρόβλεψη & στόχοι", icon: Target },
    ],
  },
  {
    label: "Πωλήσεις",
    items: [
      { slug: "live", label: "Σήμερα (live)", icon: Activity },
      { slug: "sales", label: "Πωλήσεις", icon: ChartColumnBig },
      { slug: "products", label: "Προϊόντα", icon: Package },
      { slug: "profitability", label: "Κερδοφορία", icon: TrendingUp },
      { slug: "customers", label: "Πελάτες", icon: Users },
      { slug: "customer-insights", label: "Ανάλυση πελατών", icon: UserSearch },
      { slug: "geo", label: "Γεωγραφία πωλήσεων", icon: MapPinned },
      { slug: "industry", label: "Κλάδοι πελατών", icon: Factory },
    ],
  },
  {
    label: "Αγορές & Αποθήκη",
    items: [
      { slug: "stock", label: "Αποθήκη & παραγγελίες", icon: Warehouse },
      { slug: "orders", label: "Παραγγελίες αγορών", icon: ClipboardList },
      { slug: "purchases", label: "Αγορές", icon: ShoppingCart },
      { slug: "suppliers", label: "Προμηθευτές", icon: Truck },
    ],
  },
  { label: "Ενσωμάτωση", items: [{ slug: "api", label: "Web services", icon: Webhook }] },
  {
    label: "Λογαριασμός",
    items: [
      { slug: "notifications", label: "Ειδοποιήσεις", icon: Bell },
      { slug: "ai-tokens", label: "AI tokens", icon: Coins },
    ],
  },
];

const ITEM = cn(
  "relative h-8 text-sidebar-foreground [&>svg]:text-dg-red-500",
  "hover:bg-dg-red-50/70 hover:text-dg-red-700 dark:hover:bg-white/5",
  "data-active:bg-dg-red-50 data-active:font-semibold data-active:text-dg-red-700 dark:data-active:bg-dg-red-900/40 dark:data-active:text-dg-red-200",
  "data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:-left-2 data-active:before:w-1 data-active:before:rounded-r-full data-active:before:bg-dg-red-500",
);
const GROUP_LABEL =
  "text-2xs font-semibold tracking-wider text-muted-foreground/80 uppercase";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function DashboardSidebar({
  tenantId,
  tenants,
  user,
  staff,
  pages,
}: {
  tenantId: string;
  tenants: { id: string; name: string; isDemo: boolean }[];
  user: { name: string; email: string };
  staff: boolean;
  /** Dashboard slugs the tenant's plan includes. */
  pages: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/dashboards/${tenantId}`;
  const current = pathname.slice(base.length).split("/")[1] ?? "";
  // Period/year are carried over from the URL at click time (no useSearchParams → no Suspense
  // boundary, which would hydrate the sidebar after the mobile check and mismatch the server).
  const keep = () => {
    if (typeof window === "undefined") return "";
    const sp = new URLSearchParams(window.location.search);
    return ["period", "from", "to", "year"]
      .map((k) => (sp.get(k) ? `${k}=${encodeURIComponent(sp.get(k)!)}` : null))
      .filter(Boolean)
      .join("&");
  };
  const withKeep = (path: string) => {
    const q = keep();
    return q ? `${path}?${q}` : path;
  };
  const go = (path: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(withKeep(path));
  };
  const href = (slug: string) => `${base}${slug ? `/${slug}` : ""}`;
  const tenant = tenants.find((t) => t.id === tenantId);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-2 border-b border-sidebar-border pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="hover:bg-transparent active:bg-transparent"
            >
              <Link href={base}>
                <DgLogo
                  className="size-8 shrink-0 text-dg-red-500"
                  title="DGsoft"
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-bold tracking-tight">
                    DGsmart <span className="text-dg-red-500">BI</span>
                  </span>
                  <span className="text-2xs tracking-wide text-muted-foreground uppercase">
                    Επιχειρηματική ευφυΐα
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={tenants.length < 2}>
                <SidebarMenuButton
                  size="lg"
                  tooltip={tenant?.name ?? "Επιχείρηση"}
                  className="border border-sidebar-border bg-card hover:bg-dg-red-50/60 data-[state=open]:bg-dg-red-50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-dg-red-50 text-dg-red-600">
                    <Building2 className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-xs font-semibold">
                      {tenant?.name ?? "Επιχείρηση"}
                    </span>
                    <span className="truncate text-2xs text-muted-foreground">
                      {tenant?.isDemo
                        ? "Demo"
                        : tenants.length > 1
                          ? `${tenants.length} επιχειρήσεις`
                          : "Η επιχείρησή σας"}
                    </span>
                  </span>
                  {tenants.length > 1 && (
                    <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-96 w-72 overflow-y-auto"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Επιλογή επιχείρησης
                </DropdownMenuLabel>
                {tenants.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onSelect={() =>
                      router.push(
                        withKeep(
                          `/dashboards/${t.id}${current ? `/${current}` : ""}`,
                        ),
                      )
                    }
                    className={cn(
                      "text-xs",
                      t.id === tenantId && "font-semibold text-dg-red-700",
                    )}
                  >
                    <ArrowLeftRight className="text-muted-foreground" />
                    <span className="truncate">{t.name}</span>
                    {t.isDemo && (
                      <span className="ml-auto text-2xs text-amber-600">
                        demo
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV.map((group) => ({
          ...group,
          items: group.items.filter((i) => pages.includes(i.slug)),
        }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className={GROUP_LABEL}>
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.slug}>
                      <SidebarMenuButton
                        asChild
                        isActive={current === item.slug || undefined}
                        tooltip={item.label}
                        className={ITEM}
                      >
                        <Link
                          href={href(item.slug)}
                          onClick={go(href(item.slug))}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="hover:bg-dg-red-50/70 data-[state=open]:bg-dg-red-50 dark:hover:bg-white/5"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-linear-to-br from-dg-red-500 to-dg-red-700 text-xs font-semibold text-white">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">
                      {user.name}
                    </span>
                    <span className="truncate text-2xs text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                {staff && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <ShieldCheck />
                        Διαχείριση πλατφόρμας
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/tenants/${tenantId}`}>
                        <ShieldCheck />
                        Ο πελάτης στη διαχείριση
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut />
                  Αποσύνδεση
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
