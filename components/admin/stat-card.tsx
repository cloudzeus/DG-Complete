import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { IconTile, type Tone } from "@/components/admin/tone";
import { cn } from "@/lib/utils";

export function StatCard({
  href,
  label,
  value,
  hint,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-start gap-3 overflow-hidden rounded-lg border border-border/70 bg-card p-4 shadow-fluent-2",
        "transition-shadow duration-150 ease-fluent hover:shadow-fluent-8",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
