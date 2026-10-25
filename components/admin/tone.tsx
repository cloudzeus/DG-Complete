import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Colour vocabulary of the admin UI. Every tone pairs a soft surface with a readable foreground.
export type Tone = "blue" | "red" | "green" | "amber" | "violet" | "teal" | "slate";

// DG product interior: soft solid tiles, no gradients/glow; violet & teal are not in the system,
// so they fall back to Sisyphus blue / neutral (kept as names for cherry-picks from dgsmartbi).
const TILE: Record<Tone, string> = {
  blue: "bg-sisyphus-50 text-sisyphus-600 ring-1 ring-sisyphus-100 ring-inset",
  red: "bg-dg-red-50 text-dg-red-600 ring-1 ring-dg-red-100 ring-inset",
  green: "bg-success-50 text-success-500 ring-1 ring-success-500/15 ring-inset",
  amber: "bg-warning-50 text-warning-500 ring-1 ring-warning-500/15 ring-inset",
  violet: "bg-sisyphus-50 text-sisyphus-700 ring-1 ring-sisyphus-100 ring-inset",
  teal: "bg-muted text-foreground/75 ring-1 ring-border ring-inset",
  slate: "bg-muted text-muted-foreground ring-1 ring-border ring-inset",
};

const SOFT: Record<Tone, string> = {
  blue: "bg-sisyphus-50 text-sisyphus-700 ring-sisyphus-200",
  red: "bg-danger-50 text-danger-500 ring-danger-500/20",
  green: "bg-success-50 text-success-500 ring-success-500/20",
  amber: "bg-warning-50 text-warning-500 ring-warning-500/20",
  violet: "bg-sisyphus-50 text-sisyphus-700 ring-sisyphus-200",
  teal: "bg-muted text-foreground/80 ring-border",
  slate: "bg-muted text-muted-foreground ring-border",
};

const DOT: Record<Tone, string> = {
  blue: "bg-sisyphus-500",
  red: "bg-danger-500",
  green: "bg-success-500",
  amber: "bg-warning-500",
  violet: "bg-sisyphus-500",
  teal: "bg-foreground/50",
  slate: "bg-muted-foreground/60",
};

export function IconTile({
  icon: Icon,
  tone = "blue",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = { sm: "size-7 rounded-md [&_svg]:size-3.5", md: "size-9 rounded-lg [&_svg]:size-4", lg: "size-11 rounded-xl [&_svg]:size-5" }[size];
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center", box, TILE[tone], className)}>
      <Icon strokeWidth={1.75} />
    </span>
  );
}

/** Soft coloured pill with a status dot — colour is never the only signal (text always present). */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center gap-1.5 rounded-full px-2 text-2xs font-semibold whitespace-nowrap ring-1 ring-inset",
        SOFT[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

export function softTone(tone: Tone) {
  return SOFT[tone];
}
