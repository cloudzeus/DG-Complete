import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// KPI tile: eyebrow label, 32/600 tabular value, hint (docs/09 §1 — numbers not oversized).
export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: string; good: boolean };
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-card p-4 shadow-fluent-2">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow truncate">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 shrink-0 text-sisyphus-500" />}
      </div>
      <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {trend && <span className={cn("font-semibold", trend.good ? "text-success-500" : "text-danger-500")}>{trend.value}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
