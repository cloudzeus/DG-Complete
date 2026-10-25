import Link from "next/link";
import { cn } from "@/lib/utils";

// Tabs as links (?tab=…): server-rendered, no client JS, deep-linkable.
export function LinkTabs({ base, tabs, active }: { base: string; tabs: { key: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Καρτέλες" className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border/70 px-1">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative inline-flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors duration-150",
              on ? "font-semibold text-sisyphus-700" : "text-muted-foreground hover:text-foreground",
              on && "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-sisyphus-500",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-sm bg-muted px-1.5 text-2xs tabular-nums">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
