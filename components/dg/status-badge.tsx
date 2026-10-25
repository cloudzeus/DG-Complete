import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/labels";

// Status pill (docs/09 §5). Colour is never the only signal: the label is always shown.
const TONE: Record<StatusTone, { box: string; dot: string }> = {
  neutral: { box: "bg-muted text-foreground/80", dot: "bg-foreground/45" },
  info: { box: "bg-sisyphus-50 text-sisyphus-700", dot: "bg-sisyphus-500" },
  success: { box: "bg-success-50 text-success-500", dot: "bg-success-500" },
  danger: { box: "bg-danger-50 text-danger-500", dot: "bg-danger-500" },
  warning: { box: "bg-warning-50 text-warning-500", dot: "bg-warning-500" },
  muted: { box: "bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/60" },
};

export function StatusBadge({
  status,
  map,
  className,
}: {
  status: string;
  map: Record<string, { label: string; tone: StatusTone }>;
  className?: string;
}) {
  const s = map[status] ?? { label: status, tone: "neutral" as const };
  const t = TONE[s.tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1.5 rounded-sm px-2 text-xs font-semibold whitespace-nowrap",
        t.box,
        className,
      )}
    >
      {status === "NEEDS_ATTENTION" ? <AlertTriangle aria-hidden className="size-3.5" /> : <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />}
      {s.label}
    </span>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: StatusTone; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-2xs font-semibold", TONE[tone].box, className)}>{children}</span>;
}
