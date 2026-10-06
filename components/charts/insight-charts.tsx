"use client";

import { CartesianGrid, Label, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis } from "recharts";
import { cn } from "@/lib/utils";

// Decision charts beyond bars and lines: a quadrant bubble chart, a treemap coloured by change,
// a heatmap and a gauge.

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

// ───────────── Quadrant bubbles ─────────────

export type Bubble = { name: string; x: number; y: number; size: number };

/**
 * Bubbles on two axes split into four quadrants at (xSplit, ySplit), e.g. stock days × ROI:
 * top-left = fast & profitable, bottom-right = capital asleep.
 */
export function QuadrantBubbles({
  data,
  xLabel,
  yLabel,
  xSplit,
  ySplit,
  quadrants,
  xUnit = "",
  yUnit = "",
  sizeLabel,
}: {
  data: Bubble[];
  xLabel: string;
  yLabel: string;
  /** Quadrant borders; default: the median of the data (relative to the others). */
  xSplit?: number;
  ySplit?: number;
  /** [top-left, top-right, bottom-left, bottom-right] */
  quadrants: [string, string, string, string];
  xUnit?: string;
  yUnit?: string;
  sizeLabel: string;
}) {
  const median = (v: number[]) => {
    const a = [...v].sort((p, q) => p - q);
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  };
  xSplit ??= median(data.map((d) => d.x));
  ySplit ??= median(data.map((d) => d.y));
  const xMax = Math.max(xSplit * 1.5, ...data.map((d) => d.x)) * 1.08;
  const yMax = Math.max(ySplit * 1.5, ...data.map((d) => d.y)) * 1.12;
  const yMin = Math.min(0, ...data.map((d) => d.y));
  const color = (d: Bubble) => (d.y >= ySplit ? (d.x <= xSplit ? "#16a34a" : "#2563eb") : d.x <= xSplit ? "#d97706" : "#dc2626");
  const corner = "pointer-events-none absolute z-10 rounded-md bg-background/80 px-2 py-0.5 text-2xs font-semibold backdrop-blur";
  return (
    <div className="relative h-96 w-full">
      <span className={cn(corner, "top-2 left-16 text-emerald-700")}>↖ {quadrants[0]}</span>
      <span className={cn(corner, "top-2 right-4 text-blue-700")}>{quadrants[1]} ↗</span>
      <span className={cn(corner, "bottom-12 left-16 text-amber-700")}>↙ {quadrants[2]}</span>
      <span className={cn(corner, "right-4 bottom-12 text-red-700")}>{quadrants[3]} ↘</span>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
          <ReferenceArea x1={0} x2={xSplit} y1={ySplit} y2={yMax} fill="#16a34a" fillOpacity={0.05} />
          <ReferenceArea x1={xSplit} x2={xMax} y1={yMin} y2={ySplit} fill="#dc2626" fillOpacity={0.05} />
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis type="number" dataKey="x" domain={[0, xMax]} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v)}`} fontSize={11}>
            <Label value={xLabel} position="insideBottom" offset={-16} fontSize={11} className="fill-muted-foreground" />
          </XAxis>
          <YAxis type="number" dataKey="y" domain={[yMin, yMax]} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => v.toLocaleString("el-GR", { maximumFractionDigits: 1 })} fontSize={11}>
            <Label value={yLabel} angle={-90} position="insideLeft" offset={14} fontSize={11} className="fill-muted-foreground" style={{ textAnchor: "middle" }} />
          </YAxis>
          <ZAxis type="number" dataKey="size" range={[60, 1400]} />
          <ReferenceLine x={xSplit} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          <ReferenceLine y={ySplit} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const d = payload?.[0]?.payload as Bubble | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-fluent-8">
                  <div className="mb-1 font-semibold">{d.name}</div>
                  <div>
                    {xLabel}: <b className="tabular-nums">{Math.round(d.x).toLocaleString("el-GR")}{xUnit}</b>
                  </div>
                  <div>
                    {yLabel}: <b className="tabular-nums">{d.y.toLocaleString("el-GR", { maximumFractionDigits: 2 })}{yUnit}</b>
                  </div>
                  <div>
                    {sizeLabel}: <b className="tabular-nums">{eur(d.size)}</b>
                  </div>
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            shape={(props: { cx?: number; cy?: number; size?: number; payload?: Bubble }) => {
              const r = Math.sqrt((props.size ?? 60) / Math.PI);
              const d = props.payload!;
              return (
                <g>
                  <circle cx={props.cx} cy={props.cy} r={r} fill={color(d)} fillOpacity={0.55} stroke={color(d)} strokeWidth={1.2} />
                  {r >= 13 && (
                    <text x={props.cx} y={props.cy} textAnchor="middle" dominantBaseline="middle" fontSize={10} className="pointer-events-none fill-foreground">
                      {d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name}
                    </text>
                  )}
                </g>
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────── Treemap coloured by change ─────────────

export type TreeItem = { name: string; value: number; change: number | null };

const changeColor = (c: number | null) => {
  if (c === null) return "hsl(215 20% 88%)";
  const v = Math.max(-50, Math.min(50, c)) / 50; // −1 … 1
  // Solid light tones (dark text stays readable): red falling → grey → green rising.
  return v >= 0 ? `hsl(142 ${35 + 30 * v}% ${88 - 30 * v}%)` : `hsl(0 ${45 + 30 * -v}% ${90 - 28 * -v}%)`;
};

export function ChangeTreemap({ data, valueLabel, changeLabel }: { data: TreeItem[]; valueLabel: string; changeLabel: string }) {
  const items = data.filter((d) => d.value > 0).map((d) => ({ ...d, fill: changeColor(d.change) }));
  return (
    <div className="space-y-2">
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={items}
            dataKey="value"
            nameKey="name"
            isAnimationActive={false}
            content={(props: { x?: number; y?: number; width?: number; height?: number; name?: string; fill?: string; value?: number; change?: number | null }) => {
              const { x = 0, y = 0, width = 0, height = 0 } = props;
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} rx={4} style={{ fill: props.fill }} stroke="var(--background)" strokeWidth={2} />
                  {width > 70 && height > 34 && (
                    <>
                      <text x={x + 6} y={y + 16} fontSize={11} fontWeight={600} fill="#1c1917">
                        {String(props.name).length > width / 7 ? `${String(props.name).slice(0, Math.floor(width / 7) - 1)}…` : props.name}
                      </text>
                      <text x={x + 6} y={y + 30} fontSize={10} fill="#44403c">
                        {eur(props.value ?? 0)}
                        {props.change !== null && props.change !== undefined && ` · ${props.change > 0 ? "+" : ""}${Math.round(props.change)}%`}
                      </text>
                    </>
                  )}
                </g>
              );
            }}
          >
            <Tooltip
              content={({ payload }) => {
                const d = payload?.[0]?.payload as TreeItem | undefined;
                if (!d) return null;
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-fluent-8">
                    <div className="font-semibold">{d.name}</div>
                    <div>
                      {valueLabel}: <b>{eur(d.value)}</b>
                    </div>
                    <div>
                      {changeLabel}: <b>{d.change === null ? "—" : `${d.change > 0 ? "+" : ""}${Math.round(d.change)}%`}</b>
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-2 text-2xs text-muted-foreground">
        <span>{changeLabel}:</span>
        <span className="h-2 w-28 rounded-full bg-linear-to-r from-red-400 via-slate-200 to-green-500" />
        <span>−50% … +50%</span>
      </div>
    </div>
  );
}

// ───────────── Heatmap ─────────────

/** Rows × columns of values, coloured from good (low) to bad (high) — e.g. days to pay back. */
export function Heatmap({
  rows,
  columns,
  values,
  good,
  bad,
  unit = "",
}: {
  rows: string[];
  columns: string[];
  values: (number | null)[][];
  good: number;
  bad: number;
  unit?: string;
}) {
  const color = (v: number | null) => {
    if (v === null) return undefined;
    const t = Math.max(0, Math.min(1, (v - good) / (bad - good)));
    const hue = 140 - 140 * t; // green → red
    return `hsl(${hue} 70% ${88 - 30 * t}%)`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-2xs">
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th key={c} className="px-1 pb-1 text-center font-medium whitespace-nowrap text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <th className="max-w-36 truncate pr-2 text-left font-medium" title={r}>
                {r}
              </th>
              {columns.map((c, j) => {
                const v = values[i][j];
                return (
                  <td
                    key={c}
                    className={cn("h-8 min-w-11 rounded text-center tabular-nums", v === null && "bg-muted/40 text-muted-foreground")}
                    style={{ background: color(v) }}
                    title={v === null ? "χωρίς αγορές" : `${r} · ${c}: ${Math.round(v)}${unit}`}
                  >
                    {v === null ? "·" : Math.round(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────── Gauge ─────────────

/** Half-circle gauge for a ratio around 1 (e.g. purchases ÷ cost of sales): green near 1. */
export function RatioGauge({ value, label, hint }: { value: number | null; label: string; hint?: string }) {
  const v = value ?? 0;
  const t = Math.max(0, Math.min(1, v / 2)); // 0 … 2 → 0 … 1
  const angle = Math.PI * (1 - t);
  const cx = 100;
  const cy = 100;
  const r = 80;
  const nx = cx + r * 0.85 * Math.cos(angle);
  const ny = cy - r * 0.85 * Math.sin(angle);
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-64" role="img" aria-label={`${label}: ${value === null ? "—" : v.toFixed(2)}`}>
        <path d={arc(0, 0.4)} stroke="#0284c7" strokeWidth={16} fill="none" />
        <path d={arc(0.4, 0.45)} stroke="#38bdf8" strokeWidth={16} fill="none" />
        <path d={arc(0.45, 0.55)} stroke="#16a34a" strokeWidth={16} fill="none" />
        <path d={arc(0.55, 0.65)} stroke="#f59e0b" strokeWidth={16} fill="none" />
        <path d={arc(0.65, 1)} stroke="#dc2626" strokeWidth={16} fill="none" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="var(--foreground)" />
        <text x={cx} y={cy - 22} textAnchor="middle" fontSize={22} fontWeight={700} className="fill-foreground">
          {value === null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: 2 })}
        </text>
      </svg>
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-center text-xs text-muted-foreground">{hint}</div>}
      <div className="mt-1 flex gap-3 text-2xs text-muted-foreground">
        <span>&lt;0,9 αδειάζει</span>
        <span className="text-emerald-700">≈1 ισορροπία</span>
        <span>&gt;1,1 γεμίζει</span>
      </div>
    </div>
  );
}
