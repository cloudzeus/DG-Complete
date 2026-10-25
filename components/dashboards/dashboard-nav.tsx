"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
