"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// A sidebar menu group whose label expands/collapses it. The choice is remembered per browser;
// the group of the current page always opens, and in the icon-only sidebar every group shows.

const STORE = "dg.nav.collapsed";
const readCollapsed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "[]");
  } catch {
    return [];
  }
};
const writeCollapsed = (id: string, collapsed: boolean) => {
  try {
    const set = new Set(readCollapsed());
    if (collapsed) set.add(id);
    else set.delete(id);
    localStorage.setItem(STORE, JSON.stringify([...set]));
  } catch {}
};

export function CollapsibleNavGroup({
  id,
  label,
  active,
  labelClassName,
  children,
}: {
  /** Stable key for remembering the state (e.g. "bi:Πωλήσεις"). */
  id: string;
  label: string;
  /** The group contains the current page. */
  active: boolean;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  const { state, isMobile } = useSidebar();
  const [open, setOpen] = useState(true);
  // Saved state is applied after mount (the server renders everything open → no hydration mismatch).
  useEffect(() => {
    const t = setTimeout(() => setOpen(active || !readCollapsed().includes(id)), 0);
    return () => clearTimeout(t);
  }, [id, active]);
  const iconOnly = state === "collapsed" && !isMobile;

  return (
    <Collapsible
      open={iconOnly || open}
      onOpenChange={(v) => {
        setOpen(v);
        writeCollapsed(id, !v);
      }}
      className="group/navgroup"
    >
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild className={cn(labelClassName, "cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
          <CollapsibleTrigger>
            {label}
            <ChevronRight className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=open]/navgroup:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
