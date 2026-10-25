import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/charts/bi-charts";
import { IconTile, type Tone } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pct } from "@/lib/format";

const SPARK: Record<Tone, string> = {
  blue: "var(--chart-1)",
  red: "var(--chart-2)",
  green: "var(--chart-3)",
  violet: "var(--chart-4)",
  amber: "var(--chart-5)",
  teal: "#00a3a3",
  slate: "#8a8886",
};

/** KPI with YoY change and a monthly sparkline. `inverse` = lower is better (costs). */
export function Kpi({
  label,
  value,
  change,
  hint,
  icon,
  tone,
  spark,
  inverse = false,
}: {
  label: string;
  value: string;
  change?: number | null;
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
  spark?: number[];
  inverse?: boolean;
}) {
  const good = change === null || change === undefined ? null : inverse ? change < 0 : change >= 0;
  return (
    <Card className="gap-2 py-4">
      <CardContent className="space-y-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums">{value}</p>
          </div>
          <IconTile icon={icon} tone={tone} />
        </div>
        <div className="flex items-center gap-1.5 text-2xs">
          {change !== null && change !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1 py-px font-semibold tabular-nums",
                good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              )}
            >
              {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {pct(Math.abs(change))}
            </span>
          )}
          {hint && <span className="truncate text-muted-foreground">{hint}</span>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} color={SPARK[tone]} />}
      </CardContent>
    </Card>
  );
}

export function ChartCard({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

export function DashboardErrors({ errors: all }: { errors: string[] }) {
  const errors = [...new Set(all)];
  if (!errors.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        Κάποια στοιχεία δεν φορτώθηκαν από τον Cube server:
        <ul className="mt-1 list-disc pl-4">
          {errors.map((e) => (
            <li key={e} className="break-all">
              {e}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function EmptyDashboard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-14 text-center">
        <p className="font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border bg-card" />
      <div className="h-80 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
