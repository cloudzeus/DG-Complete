import { cn } from "@/lib/utils";

// Placeholder for an artifact screenshot (real images come from signed Bunny URLs — never public).
// Draws a schematic page with the failing element highlighted in DG red (docs/09 §1).
export function Screenshot({ alt, highlight = true, className }: { alt: string; highlight?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label={alt} className={cn("w-full rounded-lg border border-border/70 bg-muted/40", className)}>
      <rect x="0" y="0" width="160" height="10" className="fill-muted" />
      <rect x="8" y="18" width="60" height="4" rx="1" className="fill-foreground/15" />
      {[30, 44, 58].map((y) => (
        <g key={y}>
          <rect x="8" y={y} width="30" height="3" rx="1" className="fill-foreground/20" />
          <rect x="8" y={y + 5} width="70" height="7" rx="1" className="fill-card stroke-border" strokeWidth="0.5" />
        </g>
      ))}
      <rect x="8" y="78" width="28" height="9" rx="1.5" className="fill-sisyphus-500" />
      {highlight && (
        <>
          <rect x="6" y="47" width="74" height="11" rx="1.5" fill="none" className="stroke-dg-red-500" strokeWidth="1.2" />
          <rect x="84" y="48" width="56" height="9" rx="1.5" className="fill-danger-50 stroke-danger-500" strokeWidth="0.5" />
          <rect x="88" y="51.5" width="46" height="2" rx="1" className="fill-danger-500/70" />
        </>
      )}
    </svg>
  );
}
