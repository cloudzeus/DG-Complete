// Sales per month as tiny bars (oldest → this month); the last 3 months stand out, orange when
// demand is rising. With a forecast, the next months follow as outlined bars.
// Shared by the purchase orders and Προϊόντα → Κίνηση.

const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

export function MonthBars({ values, rising, forecast = [] }: { values: number[]; rising: boolean; forecast?: number[] }) {
  const max = Math.max(...values, ...forecast, 0);
  const now = new Date().getMonth();
  const label = (offset: number) => MONTHS[(now + offset + 24) % 12];
  const title = [
    ...values.map((v, i) => `${label(i - 11)}: ${v.toLocaleString("el-GR")}`),
    ...forecast.map((v, i) => `${label(i + 1)} (πρόβλεψη): ${v.toLocaleString("el-GR")}`),
  ].join(" · ");
  const h = (v: number) => (max > 0 ? Math.max((Math.max(v, 0) / max) * 26, v > 0 ? 2 : 0.75) : 0.75);
  const width = (values.length + forecast.length) * 10;
  return (
    <svg viewBox={`0 0 ${width} 28`} className={forecast.length ? "h-7 w-40" : "h-7 w-32"} role="img" aria-label={`Πωλήσεις ανά μήνα: ${title}`}>
      <title>{title}</title>
      {values.map((v, i) => (
        <rect
          key={i}
          x={i * 10 + 1}
          y={28 - h(v)}
          width={8}
          height={h(v)}
          rx={1}
          className={i >= values.length - 3 ? (rising ? "fill-orange-500" : "fill-sky-600") : "fill-slate-300 dark:fill-slate-600"}
        />
      ))}
      {forecast.map((v, i) => (
        <rect
          key={`f${i}`}
          x={(values.length + i) * 10 + 1.5}
          y={28 - h(v) + 0.5}
          width={7}
          height={Math.max(h(v) - 0.5, 0.5)}
          rx={1}
          className="fill-violet-200 stroke-violet-500 dark:fill-violet-900/40"
          strokeWidth={0.8}
          strokeDasharray="1.5 1"
        />
      ))}
    </svg>
  );
}
