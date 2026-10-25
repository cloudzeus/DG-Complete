"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  ChevronsUpDown,
  Contact,
  CreditCard,
  Database,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPinned,
  Package,
  PlugZap,
  ReceiptText,
  RefreshCcw,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { DgLogo } from "@/components/brand/dg-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { CollapsibleNavGroup } from "@/components/ui/collapsible-nav-group";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; superAdminOnly?: boolean };

const MAIN: { label: string; items: Item[] }[] = [
  {
    label: "Γενικά",
    items: [
      { href: "/admin", label: "Επισκόπηση", icon: LayoutDashboard, exact: true },
      { href: "/dashboards", label: "Dashboards", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Πελάτες",
    items: [
      { href: "/admin/tenants", label: "Tenants", icon: Building2 },
      { href: "/admin/customers", label: "Πελάτες SoftOne", icon: Contact },
      { href: "/admin/plans", label: "Πακέτα", icon: Package },
  { href: "/admin/payments", label: "Πληρωμές", icon: CreditCard },
    ],
  },
];

const SETTINGS: Item[] = [
  { href: "/admin/settings/users", label: "Χρήστες", icon: Users },
  { href: "/admin/settings/access", label: "Διαχείριση πρόσβασης", icon: ShieldCheck, superAdminOnly: true },
  { href: "/admin/settings/softone", label: "SoftOne DGsoft", icon: PlugZap, superAdminOnly: true },
  { href: "/admin/settings/sync", label: "Συγχρονισμοί", icon: RefreshCcw, superAdminOnly: true },
  { href: "/admin/settings/billing", label: "Τιμολόγηση", icon: ReceiptText, superAdminOnly: true },
  { href: "/admin/settings/ai", label: "AI · OpenRouter", icon: Bot, superAdminOnly: true },
  { href: "/admin/settings/email", label: "Email · Mailgun", icon: Mail, superAdminOnly: true },
  { href: "/admin/settings/geo", label: "Χάρτες · Mapbox", icon: MapPinned, superAdminOnly: true },
  { href: "/admin/settings/registry", label: "Μητρώο ΑΦΜ · ΚΑΔ", icon: Landmark, superAdminOnly: true },
  { href: "/admin/settings/cube", label: "Cube server", icon: Server, superAdminOnly: true },
  { href: "/admin/settings/connections", label: "Συνδέσεις δεδομένων", icon: Database },
  { href: "/admin/settings/logs", label: "Αρχεία καταγραφής", icon: ScrollText, superAdminOnly: true },
];

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Admin", USER: "Χρήστης" };

// White sidebar, DG Red icons; active item = soft red pill + red bar.
const ITEM = cn(
  "relative h-8 text-sm text-sidebar-foreground [&>svg]:text-dg-red-500",
  "hover:bg-dg-red-50/70 hover:text-dg-red-700 active:bg-dg-red-50 dark:hover:bg-white/5 dark:hover:text-white",
  "data-active:bg-dg-red-50 data-active:font-semibold data-active:text-dg-red-700 dark:data-active:bg-dg-red-900/40 dark:data-active:text-dg-red-200",
  "data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:-left-2 data-active:before:w-1 data-active:before:rounded-r-full data-active:before:bg-dg-red-500",
);
const SUB_ITEM = cn(
  "h-7 text-sidebar-foreground [&>svg]:text-dg-red-400!",
  "hover:bg-dg-red-50/70 hover:text-dg-red-700 dark:hover:bg-white/5",
  "data-active:bg-dg-red-50 data-active:font-semibold data-active:text-dg-red-700 data-active:[&>svg]:text-dg-red-500! dark:data-active:bg-dg-red-900/40 dark:data-active:text-dg-red-200",
);
const GROUP_LABEL = "text-2xs font-semibold tracking-wider text-muted-foreground/80 uppercase";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppSidebar({ user }: { user: { name: string; email: string; platformRole: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const isSuper = user.platformRole === "SUPER_ADMIN";
  const visible = (i: Item) => !i.superAdminOnly || isSuper;
  const isActive = (i: Item) => (i.exact ? pathname === i.href : pathname.startsWith(i.href));
  const settingsItems = SETTINGS.filter(visible);
  const settingsActive = settingsItems.some(isActive);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
              <Link href="/admin">
                <DgLogo className="size-8 shrink-0 text-dg-red-500" title="DGsoft" />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-bold tracking-tight">
                    DGsmart <span className="text-dg-red-500">BI</span>
                  </span>
                  <span className="text-2xs tracking-wide text-muted-foreground uppercase">Admin console</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {MAIN.map((group) => (
          <CollapsibleNavGroup
            key={group.label}
            id={`admin:${group.label}`}
            label={group.label}
            active={group.items.filter(visible).some(isActive)}
            labelClassName={GROUP_LABEL}
          >
              <SidebarMenu className="gap-0.5">
                {group.items.filter(visible).map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label} className={ITEM}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
          </CollapsibleNavGroup>
        ))}

        {settingsItems.length > 0 && (
          <CollapsibleNavGroup id="admin:Διαχείριση" label="Διαχείριση" active={settingsActive} labelClassName={GROUP_LABEL}>
              <SidebarMenu>
                {/* key resets the open state when navigating into/out of settings */}
                <Collapsible key={String(settingsActive)} asChild defaultOpen={settingsActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Ρυθμίσεις"
                        className={cn(ITEM, settingsActive && "font-semibold text-dg-red-700")}
                      >
                        <Settings />
                        <span>Ρυθμίσεις</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="mr-0 border-dg-red-100 pr-0 dark:border-white/10">
                        {settingsItems.map((item) => (
                          <SidebarMenuSubItem key={item.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActive(item)}
                              className={SUB_ITEM}
                            >
                              <Link href={item.href}>
                                <item.icon />
                                <span>{item.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
          </CollapsibleNavGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="hover:bg-dg-red-50/70 data-[state=open]:bg-dg-red-50 dark:hover:bg-white/5">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-linear-to-br from-dg-red-500 to-dg-red-700 text-xs font-semibold text-white">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    <span className="truncate text-2xs text-muted-foreground">{ROLE_LABEL[user.platformRole]}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut />
                  Αποσύνδεση
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
