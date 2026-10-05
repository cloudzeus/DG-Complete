"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { eurCompact, eurFull, pct } from "@/lib/format";

// Reusable dashboard charts on shadcn/ui charts (Recharts). Values are € unless `format` says otherwise.

export type ValueFormat = "eur" | "count" | "pct";
const fmtFull = (f: ValueFormat) => (v: number) =>
  f === "eur" ? eurFull(v) : f === "pct" ? pct(v) : v.toLocaleString("el-GR");
const axisCompact = new Intl.NumberFormat("el-GR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtAxis = (f: ValueFormat) => (v: number) =>
  f === "pct" ? `${Math.round(v)}%` : axisCompact.format(v);

function ValueTooltip({
  format = "eur",
  labelFormatter,
}: {
  format?: ValueFormat;
  labelFormatter?: (label: string) => string;
}) {
  const f = fmtFull(format);
  return (
    <ChartTooltip
      cursor={{ fillOpacity: 0.4 }}
      content={
        <ChartTooltipContent
          labelFormatter={
            labelFormatter ? (l) => labelFormatter(String(l)) : undefined
          }
          formatter={(value, name, item) => (
            <div className="flex w-full items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: item.color ?? item.payload?.fill }}
              />
              <span className="text-muted-foreground">{item.name ?? name}</span>
              <span className="ml-auto pl-3 font-mono font-medium text-foreground tabular-nums">
                {f(Number(value))}
              </span>
            </div>
          )}
        />
      }
    />
  );
}

export type Series = {
  key: string;
  label: string;
  color: string;
  type?: "bar" | "line" | "area";
  dashed?: boolean;
  stack?: string;
  rightAxis?: ValueFormat;
};

const configOf = (series: Series[]): ChartConfig =>
  Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

/** Bars + lines on a category axis (e.g. months). */
export function ComboChart({
  data,
  xKey,
  series,
  format = "eur",
  className,
  zeroLine = false,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  format?: ValueFormat;
  className?: string;
  zeroLine?: boolean;
}) {
  const right = series.find((s) => s.rightAxis);
  const axis = (s: Series) => (s.rightAxis ? "right" : "left");
  return (
    <ChartContainer
      config={configOf(series)}
      className={cn("aspect-auto h-72 w-full", className)}
    >
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={fmtAxis(format)}
        />
        {right && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={fmtAxis(right.rightAxis!)}
          />
        )}
        {zeroLine && (
          <ReferenceLine yAxisId="left" y={0} stroke="var(--border)" />
        )}
        <ValueTooltip format={format} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) =>
          s.type === "line" ? (
            <Line
              key={s.key}
              yAxisId={axis(s)}
              dataKey={s.key}
              name={s.label}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={false}
            />
          ) : s.type === "area" ? (
            <Area
              key={s.key}
              yAxisId={axis(s)}
              dataKey={s.key}
              name={s.label}
              type="monotone"
              fill={`var(--color-${s.key})`}
              fillOpacity={0.15}
              stroke={`var(--color-${s.key})`}
            />
          ) : (
            <Bar
              key={s.key}
              yAxisId={axis(s)}
              dataKey={s.key}
              name={s.label}
              fill={`var(--color-${s.key})`}
              radius={[4, 4, 0, 0]}
              stackId={s.stack}
              maxBarSize={28}
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}

/** Two series compared (this year vs last), as gradient areas. */
export function CompareAreaChart({
  data,
  xKey,
  current,
  previous,
  format = "eur",
  className,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  current: Series;
  previous: Series;
  format?: ValueFormat;
  className?: string;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <ChartContainer
      config={configOf([current, previous])}
      className={cn("aspect-auto h-72 w-full", className)}
    >
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor={`var(--color-${current.key})`}
              stopOpacity={0.45}
            />
            <stop
              offset="95%"
              stopColor={`var(--color-${current.key})`}
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={fmtAxis(format)}
        />
        <ValueTooltip format={format} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey={previous.key}
          name={previous.label}
          type="monotone"
          fill="transparent"
          stroke={`var(--color-${previous.key})`}
          strokeDasharray="5 4"
          strokeWidth={1.5}
          connectNulls
        />
        <Area
          dataKey={current.key}
          name={current.label}
          type="monotone"
          fill={`url(#g-${id})`}
          stroke={`var(--color-${current.key})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Running total lines (e.g. cumulative profit this year vs last). */
export function CumulativeChart({
  data,
  xKey,
  series,
  format = "eur",
  className,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  format?: ValueFormat;
  className?: string;
}) {
  return (
    <ChartContainer
      config={configOf(series)}
      className={cn("aspect-auto h-64 w-full", className)}
    >
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={fmtAxis(format)}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ValueTooltip format={format} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={s.dashed ? 1.5 : 2.5}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            dot={s.dashed ? false : { r: 2.5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#00a3a3",
  "#8a8886",
];

/** Donut with a total in the middle and a legend list. */
export function DonutChart({
  data,
  format = "eur",
  centerLabel,
  className,
}: {
  data: { name: string; value: number }[];
  format?: ValueFormat;
  centerLabel: string;
  className?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const rows = data.map((d, i) => ({
    ...d,
    key: `s${i}`,
    fill: PALETTE[i % PALETTE.length],
  }));
  const config: ChartConfig = Object.fromEntries(
    rows.map((r) => [r.key, { label: r.name, color: r.fill }]),
  );
  const f = fmtFull(format);
  return (
    <div
      className={cn(
        "grid items-center gap-4 sm:grid-cols-[minmax(0,13rem)_1fr]",
        className,
      )}
    >
      <ChartContainer
        config={config}
        className="mx-auto aspect-square w-full max-w-52"
      >
        <PieChart>
          <ValueTooltip format={format} />
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="95%"
            strokeWidth={2}
            paddingAngle={1}
          >
            {rows.map((r) => (
              <Cell key={r.key} fill={r.fill} />
            ))}
            <LabelList
              content={({ viewBox }) => {
                const vb = viewBox as { cx?: number; cy?: number } | undefined;
                if (!vb?.cx || !vb?.cy) return null;
                return (
                  <text
                    x={vb.cx}
                    y={vb.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={vb.cx}
                      y={vb.cy - 6}
                      className="fill-foreground text-base font-semibold"
                    >
                      {format === "eur"
                        ? eurCompact(total)
                        : fmtAxis(format)(total)}
                    </tspan>
                    <tspan
                      x={vb.cx}
                      y={vb.cy + 12}
                      className="fill-muted-foreground text-2xs"
                    >
                      {centerLabel}
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="space-y-1.5 text-xs">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: r.fill }}
            />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="font-mono tabular-nums">{f(r.value)}</span>
            <span className="hidden w-11 text-right text-muted-foreground tabular-nums sm:inline">
              {total ? pct((100 * r.value) / total, 0) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranking bars (top customers, suppliers …) with values at the bar end. */
export function RankingChart({
  data,
  color = "var(--chart-1)",
  label,
  format = "eur",
  className,
}: {
  data: { name: string; value: number }[];
  color?: string;
  label: string;
  format?: ValueFormat;
  className?: string;
}) {
  const config: ChartConfig = { value: { label, color } };
  const mobile = useIsMobile();
  const chars = mobile ? 16 : 23;
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height: `${Math.max(160, data.length * 30 + 16)}px` }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 64, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={mobile ? 118 : 210}
          tick={{ width: 400 }}
          tickFormatter={(v: string) =>
            v.length > chars ? `${v.slice(0, chars - 1)}…` : v
          }
        />
        <ValueTooltip format={format} />
        <Bar
          dataKey="value"
          name={label}
          fill="var(--color-value)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        >
          <LabelList
            dataKey="value"
            position="right"
            offset={6}
            className="fill-foreground tabular-nums"
            formatter={(v: unknown) =>
              format === "eur"
                ? eurCompact(Number(v))
                : fmtAxis(format)(Number(v))
            }
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function waterfallRows(
  steps: { name: string; value: number; total?: boolean }[],
) {
  const rows = [];
  let running = 0;
  for (const s of steps) {
    if (s.total) {
      running = s.value;
      rows.push({
        name: s.name,
        base: Math.min(0, s.value),
        up: Math.abs(s.value),
        down: 0,
        value: s.value,
        isTotal: 1,
      });
      continue;
    }
    const start = running;
    running += s.value;
    rows.push({
      name: s.name,
      base: Math.min(start, running),
      up: s.value >= 0 ? s.value : 0,
      down: s.value < 0 ? -s.value : 0,
      value: s.value,
      isTotal: 0,
    });
  }
  return rows;
}

/** From revenue to the bottom line: floating bars per step + subtotal bars. */
export function WaterfallChart({
  steps,
  className,
}: {
  steps: { name: string; value: number; total?: boolean }[];
  className?: string;
}) {
  const data = waterfallRows(steps);
  const config: ChartConfig = {
    up: { label: "Αύξηση", color: "var(--chart-3)" },
    down: { label: "Μείωση", color: "var(--chart-2)" },
    total: { label: "Σύνολο", color: "var(--chart-1)" },
  };
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <ChartContainer
        config={config}
        className={cn("aspect-auto h-80 w-full min-w-[640px]", className)}
      >
        <BarChart
          data={data}
          margin={{ top: 20, right: 8, left: 24, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={84}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={fmtAxis("eur")}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            cursor={{ fillOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                hideIndicator
                formatter={(_v, _n, item, index) =>
                  index === 0 ? (
                    <span className="font-mono font-medium tabular-nums">
                      {eurFull(
                        Number((item.payload as { value: number }).value),
                      )}
                    </span>
                  ) : null
                }
              />
            }
          />
          <Bar
            dataKey="base"
            stackId="w"
            fill="transparent"
            isAnimationActive={false}
          />
          <Bar
            dataKey="up"
            stackId="w"
            fill="var(--color-up)"
            radius={[3, 3, 0, 0]}
            maxBarSize={42}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.isTotal ? "var(--color-total)" : "var(--color-up)"}
              />
            ))}
          </Bar>
          <Bar
            dataKey="down"
            stackId="w"
            fill="var(--color-down)"
            radius={[3, 3, 0, 0]}
            maxBarSize={42}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Tiny trend line for KPI cards. */
export function Sparkline({
  values,
  color = "var(--chart-1)",
  className,
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ChartContainer
      config={{ v: { label: "", color } }}
      className={cn("aspect-auto h-10 w-full", className)}
    >
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient
            id={`spark-${color.replace(/[^a-z0-9]/gi, "")}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          dataKey="v"
          type="monotone"
          stroke="var(--color-v)"
          strokeWidth={1.75}
          fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, "")})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
