"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ComboChart, DonutChart, type ValueFormat } from "@/components/charts/bi-charts";
import { ExportButton } from "@/components/dashboards/export-button";
import { Button } from "@/components/ui/button";
import type { KimonArtifact, KimonChart, KimonFormat, KimonTable } from "@/lib/kimon/types";
import { MONTHS_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";

// What Κίμων shows under an answer: tables (with Excel export), charts and links to the lists.

const NUMERIC = new Set<KimonFormat>(["eur", "int", "num", "pct"]);

function fmt(v: unknown, f?: KimonFormat, key?: string) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  switch (f) {
    case "eur":
      return Number.isFinite(n) ? `${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : String(v);
    case "int":
      return Number.isFinite(n) ? Math.round(n).toLocaleString("el-GR") : String(v);
    case "num":
      return Number.isFinite(n) ? n.toLocaleString("el-GR", { maximumFractionDigits: 2 }) : String(v);
    case "pct":
      return Number.isFinite(n) ? `${n.toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : String(v);
    case "date":
      return dateLabel(String(v), key);
    default:
      return String(v);
  }
}

/** A time value as the granularity of its member suggests (…date.month → «Μαΐ 26»). */
function dateLabel(v: string, key?: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const g = key?.split(".")[2];
  if (g === "year") return String(d.getFullYear());
  if (g === "quarter") return `Τ${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  if (g === "month") return `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return d.toLocaleDateString("el-GR");
}

function TableArtifact({ a, tenantId }: { a: KimonTable; tenantId: string }) {
  const [all, setAll] = useState(false);
  const rows = all ? a.rows : a.rows.slice(0, 12);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 truncate text-sm font-medium">{a.title}</div>
        <ExportButton
          tenantId={tenantId}
          title={a.title}
          size="xs"
          sheets={[
            {
              name: a.title.slice(0, 31),
              columns: a.columns,
              ...(a.query ? { query: { ...a.query, limit: 50_000 } } : { rows: a.rows }),
            },
          ]}
        />
      </div>
      <div className={cn("overflow-auto", all && "max-h-[28rem]")}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              {a.columns.map((c) => (
                <th key={c.key} className={cn("px-3 py-1.5 font-medium whitespace-nowrap text-muted-foreground", NUMERIC.has(c.format ?? "text") ? "text-right" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                {a.columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-1.5", NUMERIC.has(c.format ?? "text") ? "text-right whitespace-nowrap tabular-nums" : "max-w-72 truncate")}>
                    {fmt(r[c.key], c.format, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.rows.length > 12 && (
        <div className="border-t px-3 py-1.5 text-right">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAll((x) => !x)}>
            {all ? "Λιγότερες γραμμές" : `Όλες οι ${a.rows.length.toLocaleString("el-GR")} γραμμές${a.truncated ? "+" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}

const valueFormat = (f?: KimonFormat): ValueFormat => (f === "eur" ? "eur" : f === "pct" ? "pct" : "count");
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function ChartArtifact({ a }: { a: KimonChart }) {
  const label = (v: unknown) => (a.xFormat === "date" ? dateLabel(String(v), a.x) : v === null || v === undefined ? "—" : String(v));
  // Time series read left to right; Cube may return them newest first.
  const rows = a.xFormat === "date" ? [...a.rows].sort((p, q) => String(p[a.x]).localeCompare(String(q[a.x]))) : a.rows;
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 text-sm font-medium">{a.title}</div>
      {a.kind === "pie" ? (
        <DonutChart
          data={rows.map((r) => ({ name: label(r[a.x]), value: Math.max(0, Number(r[a.series[0].key] ?? 0)) }))}
          format={valueFormat(a.series[0].format)}
          centerLabel={a.series[0].label}
          className="h-64"
        />
      ) : (
        <ComboChart
          data={rows.map((r) => ({
            x: label(r[a.x]),
            ...Object.fromEntries(a.series.map((s, i) => [`s${i}`, Number(r[s.key] ?? 0)])),
          }))}
          xKey="x"
          format={valueFormat(a.series[0].format)}
          className="h-64"
          zeroLine
          series={a.series.map((s, i) => ({ key: `s${i}`, label: s.label, color: COLORS[i % COLORS.length], type: a.kind === "pie" ? "bar" : a.kind }))}
        />
      )}
    </div>
  );
}

export function KimonArtifacts({ artifacts, tenantId }: { artifacts: KimonArtifact[]; tenantId: string }) {
  if (!artifacts.length) return null;
  const links = artifacts.filter((a) => a.type === "link");
  return (
    <div className="space-y-3">
      {artifacts.map((a) =>
        a.type === "table" ? <TableArtifact key={a.id} a={a} tenantId={tenantId} /> : a.type === "chart" ? <ChartArtifact key={a.id} a={a} /> : null,
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Button key={l.id} asChild variant="outline" size="sm" className="h-auto min-h-9 py-1.5 text-left whitespace-normal">
              <Link href={l.href}>
                {l.label}
                <ArrowRight className="size-3.5 shrink-0" />
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
