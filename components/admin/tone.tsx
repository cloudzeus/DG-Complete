import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Colour vocabulary of the admin UI. Every tone pairs a soft surface with a readable foreground.
export type Tone = "blue" | "red" | "green" | "amber" | "violet" | "teal" | "slate";

const TILE: Record<Tone, string> = {
  blue: "bg-linear-to-br from-sisyphus-400 to-sisyphus-600 text-white shadow-[0_6px_14px_-6px_rgb(0_120_212/0.6)]",
  red: "bg-linear-to-br from-dg-red-400 to-dg-red-600 text-white shadow-[0_6px_14px_-6px_rgb(227_30_42/0.55)]",
  green: "bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_6px_14px_-6px_rgb(16_124_16/0.5)]",
  amber: "bg-linear-to-br from-amber-400 to-amber-600 text-white shadow-[0_6px_14px_-6px_rgb(217_119_6/0.55)]",
  violet: "bg-linear-to-br from-violet-400 to-violet-600 text-white shadow-[0_6px_14px_-6px_rgb(124_92_196/0.55)]",
  teal: "bg-linear-to-br from-teal-400 to-teal-600 text-white shadow-[0_6px_14px_-6px_rgb(15_159_168/0.55)]",
  slate: "bg-linear-to-br from-slate-500 to-slate-700 text-white",
};

const SOFT: Record<Tone, string> = {
  blue: "bg-sisyphus-50 text-sisyphus-700 ring-sisyphus-200 dark:bg-sisyphus-900/40 dark:text-sisyphus-200 dark:ring-sisyphus-800",
  red: "bg-dg-red-50 text-dg-red-700 ring-dg-red-200 dark:bg-dg-red-900/40 dark:text-dg-red-200 dark:ring-dg-red-800",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:ring-violet-800",
  teal: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-900/40 dark:text-teal-200 dark:ring-teal-800",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
};

const DOT: Record<Tone, string> = {
  blue: "bg-sisyphus-500",
  red: "bg-dg-red-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  slate: "bg-slate-400",
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
      <Icon strokeWidth={2.2} />
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
