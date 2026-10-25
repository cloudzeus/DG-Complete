"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck, Boxes, ClipboardList, Disc3, FileClock, Gauge, KeyRound, LayoutDashboard, ListChecks,
  MonitorCog, Settings, TriangleAlert, Users, Waypoints, Webhook, type LucideIcon,
} from "lucide-react";
import { DgLogo } from "@/components/brand/dg-logo";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from "@/components/ui/sidebar";
import type { NavIcon, NavItem } from "./nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, targets: MonitorCog, recordings: Disc3, workflows: Waypoints, collections: Boxes,
  jobs: ClipboardList, runs: ListChecks, attention: TriangleAlert, approvals: BadgeCheck, keys: KeyRound,
  webhooks: Webhook, members: Users, audit: FileClock, usage: Gauge, settings: Settings,
};

// Mica sidebar, Sisyphus blue active item (product interior — docs/09 §1).
const ITEM =
  "h-8 text-sm text-sidebar-foreground [&>svg]:text-muted-foreground hover:bg-sisyphus-50/70 hover:text-sisyphus-700 data-active:bg-sisyphus-50 data-active:font-semibold data-active:text-sisyphus-700 data-active:[&>svg]:text-sisyphus-600";

export function TenantSidebar({
  base,
  groups,
  badges,
}: {
  base: string;
  groups: { label: string; items: NavItem[] }[];
  badges: { attention: number; approvals: number };
}) {
  const pathname = usePathname();
  const active = (i: NavItem) => {
    const href = base + i.href;
    return i.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-12 justify-center border-b border-sidebar-border">
        <Link href={base} className="flex items-center gap-2 px-1">
          <DgLogo className="size-7 shrink-0 text-dg-red-500" title="DGsoft" />
          <span className="truncate text-sm font-bold tracking-tight group-data-[collapsible=icon]:hidden">DG Complete</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-1">
        {groups.map((g) => (
          <SidebarGroup key={g.label} className="py-1">
            <SidebarGroupLabel className="text-2xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {g.items.map((i) => {
                  const Icon = ICONS[i.icon];
                  const count = i.badge ? badges[i.badge] : 0;
                  return (
                    <SidebarMenuItem key={i.href}>
                      <SidebarMenuButton asChild isActive={active(i)} tooltip={i.label} className={ITEM}>
                        <Link href={base + i.href}>
                          <Icon aria-hidden />
                          <span>{i.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge className="rounded-sm bg-warning-50 text-2xs font-semibold text-warning-500" aria-label={`${count} σε αναμονή`}>
                          {count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
