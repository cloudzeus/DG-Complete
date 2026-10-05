"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, ChartColumnBig, Scale, ShoppingCart } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "pnl", label: "Αποτελέσματα", icon: Scale },
  { slug: "sales", label: "Πωλήσεις", icon: ChartColumnBig },
  { slug: "purchases", label: "Αγορές", icon: ShoppingCart },
] as const;

/** Dashboard tabs (keep ?year) + tenant switcher for users with more than one tenant. */
export function DashboardNav({ tenantId, tenants }: { tenantId: string; tenants: { id: string; name: string; isDemo: boolean }[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const active = pathname.split("/")[3] ?? "pnl";
  const qs = search.get("year") ? `?year=${search.get("year")}` : "";
  const current = tenants.find((t) => t.id === tenantId);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Dashboards">
        {TABS.map((t) => (
          <Link
            key={t.slug}
            href={`/dashboards/${tenantId}/${t.slug}${qs}`}
            aria-current={active === t.slug ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active === t.slug ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </Link>
        ))}
      </nav>
      {tenants.length > 1 && (
        <Select value={tenantId} onValueChange={(id) => router.push(`/dashboards/${id}/${active}`)}>
          <SelectTrigger className="w-full sm:w-80" aria-label="Επιχείρηση">
            <Building2 className="text-dg-red-500" />
            <SelectValue>{current ? current.name : "Επιχείρηση"}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.isDemo ? " · demo" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** Year chips that keep the current dashboard. */
export function YearPicker({ years, year }: { years: number[]; year: number }) {
  const pathname = usePathname();
  if (years.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">Χρήση</span>
      {years.map((y) => (
        <Link
          key={y}
          href={`${pathname}?year=${y}`}
          scroll={false}
          aria-current={y === year ? "true" : undefined}
          className={cn(
            "inline-flex min-h-8 items-center rounded-md border px-2.5 text-xs tabular-nums transition-colors",
            y === year ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
          )}
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
