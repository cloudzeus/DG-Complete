import Link from "next/link";
import { cn } from "@/lib/utils";

/** Tabs between the lists of a dashboard (?tab=…), keeping the other query params. */
export function ListTabs({
  tabs,
  active,
  basePath,
  query,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  basePath: string;
  query: Record<string, string | undefined>;
}) {
  const href = (tab: string) => {
    const sp = new URLSearchParams(Object.entries({ ...query, tab }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Λίστες">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
            t.key === active ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-2xs tabular-nums", t.key === active ? "bg-white/20" : "bg-muted")}>{t.count.toLocaleString("el-GR")}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
