// Stacked bars (succeeded / failed) as server-rendered SVG — no chart JS in the browser.
export function StackedBars({
  data,
  label,
}: {
  data: { label: string; succeeded: number; failed: number }[];
  label: string;
}) {
  const max = Math.max(...data.map((d) => d.succeeded + d.failed), 1);
  const w = 100 / data.length;
  return (
    <figure className="space-y-2">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label} className="h-44 w-full">
        {[10, 20, 30].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-border" strokeWidth="0.15" />
        ))}
        {data.map((d, i) => {
          const hs = (d.succeeded / max) * 38;
          const hf = (d.failed / max) * 38;
          const x = i * w + w * 0.18;
          return (
            <g key={d.label}>
              <title>{`${d.label}: ${d.succeeded.toLocaleString("el-GR")} επιτυχίες, ${d.failed.toLocaleString("el-GR")} αποτυχίες`}</title>
              <rect x={x} width={w * 0.64} y={40 - hs - hf} height={hs} className="fill-sisyphus-500" rx="0.4" />
              <rect x={x} width={w * 0.64} y={40 - hf} height={hf} className="fill-danger-500" />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-2xs text-muted-foreground tabular-nums" aria-hidden>
        {data.map((d, i) => (
          <span key={d.label} className={i % 2 ? "hidden sm:inline" : undefined}>
            {d.label}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-xs bg-sisyphus-500" /> Επιτυχίες
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-xs bg-danger-500" /> Αποτυχίες
        </span>
      </figcaption>
    </figure>
  );
}
