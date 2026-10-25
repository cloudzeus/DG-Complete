"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ComboChart, DonutChart, type Series } from "@/components/charts/bi-charts";
import type { MetaField } from "@/lib/kimon/catalog";
import type { ReportDefinition } from "@/lib/report-types";
import { cn } from "@/lib/utils";

// The result of a report: pivot table (cells shaded by value, totals), flat table (sortable) or
// chart. Also flattens the pivot for the Excel export.

const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
const PALETTE = ["#2563eb", "#e31e2a", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

export const resultKey = (f: string) => {
  const [name, g] = f.split("@");
  return g ? `${name}.${g}` : name;
};
const granularity = (f: string) => f.split("@")[1] as string | undefined;

export type FieldFormat = "eur" | "pct" | "num" | "int";
export function formatOfField(f: MetaField | undefined): FieldFormat {
  const n = (f?.name ?? "").split(".").pop() ?? "";
  const t = (f?.title ?? "").toLowerCase();
  if (/pct|percent|ratio|share/.test(n) || t.includes("%")) return "pct";
  if (/revenue|margin|cost|amount|balance|overdue|price|value|spend|net|gross|vat|invoiced|paid|open_|inflow|outflow|profit|cogs|opex|ebitda/.test(n)) return "eur";
  if (/count|documents|customers|items|qty|quantity|invoices|suppliers/.test(n)) return "int";
  return "num";
}
export const fmt = (v: number | null | undefined, f: FieldFormat) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (f === "eur") return `${v.toLocaleString("el-GR", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 })} €`;
  if (f === "pct") return `${v.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`;
  if (f === "int") return Math.round(v).toLocaleString("el-GR");
  return v.toLocaleString("el-GR", { maximumFractionDigits: 2 });
};
/** Ratios and averages cannot be added up in totals. */
const additive = (f: MetaField | undefined) => !/pct|percent|avg|price|ratio|days|dso|dpo|score|share/.test(f?.name ?? "") && formatOfField(f) !== "pct";

export function labelOf(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const g = granularity(field);
  if (g) {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    if (g === "year") return String(d.getFullYear());
    if (g === "quarter") return `Τ${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    if (g === "month") return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return d.toLocaleDateString("el-GR", { day: "numeric", month: "numeric", year: "2-digit" });
  }
  if (field.endsWith(".weekday")) return ["", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"][Number(value)] ?? String(value);
  return String(value);
}

export type Pivot = {
  rowKeys: string[][];
  colKeys: string[][];
  cells: Map<string, number[]>;
  rowTotals: Map<string, number[]>;
  colTotals: Map<string, number[]>;
  grand: number[];
};

const K = (a: unknown[]) => JSON.stringify(a);

export function buildPivot(def: ReportDefinition, rows: Record<string, unknown>[]): Pivot {
  const rk = def.rows.map(resultKey);
  const ck = def.columns.map(resultKey);
  const vk = def.values;
  const cells = new Map<string, number[]>();
  const rowTotals = new Map<string, number[]>();
  const colTotals = new Map<string, number[]>();
  const grand = vk.map(() => 0);
  const rowSet = new Map<string, string[]>();
  const colSet = new Map<string, string[]>();
  const rowSize = new Map<string, number>();
  for (const r of rows) {
    const rkey = rk.map((k) => String(r[k] ?? ""));
    const ckey = ck.map((k) => String(r[k] ?? ""));
    const vals = vk.map((k) => Number(r[k] ?? 0));
    rowSet.set(K(rkey), rkey);
    colSet.set(K(ckey), ckey);
    const cellKey = `${K(rkey)}|${K(ckey)}`;
    const prev = cells.get(cellKey);
    cells.set(cellKey, prev ? prev.map((p, i) => p + vals[i]) : vals);
    const rt = rowTotals.get(K(rkey)) ?? vk.map(() => 0);
    rowTotals.set(K(rkey), rt.map((p, i) => p + vals[i]));
    const ct = colTotals.get(K(ckey)) ?? vk.map(() => 0);
    colTotals.set(K(ckey), ct.map((p, i) => p + vals[i]));
    vals.forEach((v, i) => (grand[i] += v));
    rowSize.set(K(rkey), (rowSize.get(K(rkey)) ?? 0) + Math.abs(vals[0] ?? 0));
  }
  const timeRow = def.rows.some((f) => granularity(f));
  const timeCol = def.columns.some((f) => granularity(f));
  const rowKeys = [...rowSet.values()].sort((a, b) => (timeRow ? K(a).localeCompare(K(b)) : (rowSize.get(K(b)) ?? 0) - (rowSize.get(K(a)) ?? 0)));
  const colSize = (c: string[]) => Math.abs(colTotals.get(K(c))?.[0] ?? 0);
  const colKeys = [...colSet.values()].sort((a, b) => (timeCol || def.columns.some((f) => /weekday|hour/.test(f)) ? K(a).localeCompare(K(b), undefined, { numeric: true }) : colSize(b) - colSize(a)));
  return { rowKeys, colKeys, cells, rowTotals, colTotals, grand };
}

/** Rows for Excel: one row per pivot row, one column per column × value. */
export function flattenPivot(def: ReportDefinition, p: Pivot, fields: Map<string, MetaField>) {
  const columns: { key: string; label: string; format?: "text" | "eur" | "int" | "num" | "pct" }[] = def.rows.map((r, i) => ({ key: `r${i}`, label: fields.get(r.split("@")[0])?.title ?? r }));
  const cols = p.colKeys.length && def.columns.length ? p.colKeys : [[]];
  cols.forEach((c, ci) =>
    def.values.forEach((v, vi) => {
      const f = fields.get(v);
      const head = c.length ? c.map((x, i) => labelOf(def.columns[i], x)).join(" · ") : "";
      columns.push({ key: `c${ci}v${vi}`, label: [head, def.values.length > 1 || !head ? (f?.title ?? v) : ""].filter(Boolean).join(" — "), format: formatOfField(f) });
    }),
  );
  const out = p.rowKeys.map((r) => {
    const o: Record<string, unknown> = {};
    r.forEach((x, i) => (o[`r${i}`] = labelOf(def.rows[i], x)));
    cols.forEach((c, ci) => {
      const v = p.cells.get(`${K(r)}|${K(c)}`);
      def.values.forEach((_, vi) => (o[`c${ci}v${vi}`] = v?.[vi] ?? null));
    });
    return o;
  });
  return { columns, rows: out };
}

export function ReportResult({ def, rows, fields }: { def: ReportDefinition; rows: Record<string, unknown>[]; fields: Map<string, MetaField> }) {
  const pivot = useMemo(() => buildPivot(def, rows), [def, rows]);
  if (!rows.length) return <p className="py-10 text-center text-sm text-muted-foreground">Δεν υπάρχουν δεδομένα για αυτά τα κριτήρια.</p>;
  if (def.view === "pivot") return <PivotTable def={def} p={pivot} fields={fields} />;
  if (def.view === "table") return <FlatTable def={def} rows={rows} fields={fields} />;
  return <ReportChart def={def} p={pivot} fields={fields} />;
}

function PivotTable({ def, p, fields }: { def: ReportDefinition; p: Pivot; fields: Map<string, MetaField> }) {
  const cols = def.columns.length ? p.colKeys.slice(0, 60) : [[]];
  const vf = def.values.map((v) => fields.get(v));
  // Shade cells by value (first value) — a heatmap that shows where the numbers are.
  const max = Math.max(1, ...[...p.cells.values()].map((v) => Math.abs(v[0] ?? 0)));
  const shade = (v: number | undefined, vi: number) => (vi === 0 && def.columns.length && v ? `rgba(37, 99, 235, ${Math.min(0.55, (Math.abs(v) / max) * 0.55)})` : undefined);
  const showTotals = vf.map(additive);
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          {def.columns.length > 0 && (
            <tr>
              {def.rows.map((r) => (
                <th key={r} className="border-b bg-muted px-2 py-1.5" />
              ))}
              {cols.map((c) => (
                <th key={K(c)} colSpan={def.values.length} className="border-b border-l px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                  {c.map((x, i) => labelOf(def.columns[i], x)).join(" · ")}
                </th>
              ))}
              {showTotals.some(Boolean) && (
                <th colSpan={def.values.length} className="border-b border-l bg-muted px-2 py-1.5 text-center font-semibold">
                  Σύνολο
                </th>
              )}
            </tr>
          )}
          <tr>
            {def.rows.map((r) => (
              <th key={r} className="sticky left-0 border-b bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                {fields.get(r.split("@")[0])?.title ?? r}
              </th>
            ))}
            {[...cols, ...(def.columns.length && showTotals.some(Boolean) ? [null] : [])].map((c, ci) =>
              def.values.map((v, vi) => (
                <th key={`${ci}-${v}`} className={cn("border-b px-2 py-1.5 text-right font-medium whitespace-nowrap text-muted-foreground", vi === 0 && "border-l")}>
                  {def.values.length > 1 || !def.columns.length ? (fields.get(v)?.title ?? v) : c === null ? "" : ""}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {p.rowKeys.slice(0, 1000).map((r) => (
            <tr key={K(r)} className="hover:bg-muted/40">
              {r.map((x, i) => (
                <th key={i} className="sticky left-0 max-w-64 truncate border-b bg-card px-2 py-1 text-left font-medium" title={labelOf(def.rows[i], x)}>
                  {labelOf(def.rows[i], x)}
                </th>
              ))}
              {cols.map((c) => {
                const v = p.cells.get(`${K(r)}|${K(c)}`);
                return def.values.map((_, vi) => (
                  <td key={`${K(c)}-${vi}`} className={cn("border-b px-2 py-1 text-right whitespace-nowrap tabular-nums", vi === 0 && "border-l")} style={{ background: shade(v?.[vi], vi) }}>
                    {v ? fmt(v[vi], formatOfField(vf[vi])) : ""}
                  </td>
                ));
              })}
              {def.columns.length > 0 &&
                showTotals.some(Boolean) &&
                def.values.map((_, vi) => (
                  <td key={`t${vi}`} className={cn("border-b bg-muted/40 px-2 py-1 text-right font-semibold whitespace-nowrap tabular-nums", vi === 0 && "border-l")}>
                    {showTotals[vi] ? fmt(p.rowTotals.get(K(r))?.[vi], formatOfField(vf[vi])) : ""}
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
        {showTotals.some(Boolean) && (
          <tfoot className="sticky bottom-0 bg-muted font-semibold">
            <tr>
              <th colSpan={Math.max(1, def.rows.length)} className="sticky left-0 border-t bg-muted px-2 py-1.5 text-left">
                Σύνολο
              </th>
              {cols.map((c) =>
                def.values.map((_, vi) => (
                  <td key={`${K(c)}-${vi}`} className={cn("border-t px-2 py-1.5 text-right whitespace-nowrap tabular-nums", vi === 0 && "border-l")}>
                    {showTotals[vi] ? fmt(def.columns.length ? p.colTotals.get(K(c))?.[vi] : p.grand[vi], formatOfField(vf[vi])) : ""}
                  </td>
                )),
              )}
              {def.columns.length > 0 &&
                def.values.map((_, vi) => (
                  <td key={`g${vi}`} className={cn("border-t px-2 py-1.5 text-right whitespace-nowrap tabular-nums", vi === 0 && "border-l")}>
                    {showTotals[vi] ? fmt(p.grand[vi], formatOfField(vf[vi])) : ""}
                  </td>
                ))}
            </tr>
          </tfoot>
        )}
      </table>
      {(p.rowKeys.length > 1000 || p.colKeys.length > 60) && <p className="p-2 text-xs text-muted-foreground">Εμφανίζονται οι 1.000 γραμμές / 60 στήλες με τις μεγαλύτερες τιμές — όλες στο Excel.</p>}
    </div>
  );
}

function FlatTable({ def, rows, fields }: { def: ReportDefinition; rows: Record<string, unknown>[]; fields: Map<string, MetaField> }) {
  const cols = [...def.rows, ...def.columns, ...def.values];
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const k = resultKey(sort.key);
    return [...rows].sort((a, b) => {
      const x = a[k];
      const y = b[k];
      const nx = Number(x);
      const ny = Number(y);
      const c = !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""), "el");
      return sort.desc ? -c : c;
    });
  }, [rows, sort]);
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {cols.map((c) => {
              const isValue = def.values.includes(c);
              return (
                <th key={c} className={cn("px-2 py-1.5 font-semibold whitespace-nowrap", isValue ? "text-right" : "text-left")}>
                  <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => setSort({ key: c, desc: sort?.key === c ? !sort.desc : isValue })}>
                    {fields.get(c.split("@")[0])?.title ?? c}
                    {sort?.key === c && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 2000).map((r, i) => (
            <tr key={i} className="border-t hover:bg-muted/40">
              {cols.map((c) =>
                def.values.includes(c) ? (
                  <td key={c} className="px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {fmt(Number(r[c] ?? 0), formatOfField(fields.get(c)))}
                  </td>
                ) : (
                  <td key={c} className="max-w-72 truncate px-2 py-1" title={labelOf(c, r[resultKey(c)])}>
                    {labelOf(c, r[resultKey(c)])}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportChart({ def, p, fields }: { def: ReportDefinition; p: Pivot; fields: Map<string, MetaField> }) {
  const vf = def.values.map((v) => fields.get(v));
  const labelRow = (r: string[]) => r.map((x, i) => labelOf(def.rows[i], x)).join(" · ") || "Σύνολο";
  const labelCol = (c: string[]) => c.map((x, i) => labelOf(def.columns[i], x)).join(" · ") || "Σύνολο";
  if (def.view === "pie") {
    const data = p.rowKeys.map((r) => ({ name: labelRow(r), value: Math.round(p.rowTotals.get(K(r))?.[0] ?? 0) })).filter((d) => d.value > 0);
    const top = data.slice(0, 8);
    const rest = data.slice(8).reduce((a, d) => a + d.value, 0);
    return <DonutChart data={rest > 0 ? [...top, { name: "Λοιπά", value: rest }] : top} centerLabel={vf[0]?.title ?? ""} />;
  }
  const type: Series["type"] = def.view === "line" ? "line" : def.view === "area" ? "area" : "bar";
  const stack = type === "bar" || type === "area" ? "s" : undefined;
  const f0 = formatOfField(vf[0]);
  const format = f0 === "eur" ? "eur" : f0 === "pct" ? "pct" : "count";

  if (def.columns.length) {
    // Two dimensions: time goes on the x-axis (whichever side it is on); the other side becomes
    // the series — the 7 biggest plus «Λοιπά».
    const timeInCols = def.columns.some((f) => f.includes("@")) && !def.rows.some((f) => f.includes("@"));
    const xs = timeInCols ? p.colKeys : p.rowKeys.slice(0, def.rows.some((f) => f.includes("@")) ? undefined : 25);
    const ss = timeInCols ? p.rowKeys : p.colKeys;
    const top = ss.slice(0, 7);
    const rest = ss.slice(7);
    const val = (x: string[], s: string[]) => p.cells.get(timeInCols ? `${K(s)}|${K(x)}` : `${K(x)}|${K(s)}`)?.[0] ?? 0;
    const series: Series[] = [
      ...top.map((s, i) => ({ key: `s${i}`, label: timeInCols ? labelRow(s) : labelCol(s), color: PALETTE[i], type, stack })),
      ...(rest.length ? [{ key: "rest", label: `Λοιπά (${rest.length})`, color: "#94a3b8", type, stack }] : []),
    ];
    const data = xs.map((x) => {
      const o: Record<string, string | number> = { x: timeInCols ? labelCol(x) : labelRow(x) };
      top.forEach((s, i) => (o[`s${i}`] = val(x, s)));
      if (rest.length) o.rest = rest.reduce((a, s) => a + val(x, s), 0);
      return o;
    });
    return <ComboChart data={data} xKey="x" series={series} format={format} className="h-[26rem]" />;
  }

  const rowsForChart = def.rows.some((f) => f.includes("@")) ? p.rowKeys : p.rowKeys.slice(0, 25);
  const series: Series[] = def.values.map((v, i) => ({
    key: `s${i}`,
    label: fields.get(v)?.title ?? v,
    color: PALETTE[i % PALETTE.length],
    type,
    rightAxis: i > 0 && formatOfField(vf[i]) !== f0 ? (formatOfField(vf[i]) === "pct" ? "pct" : "count") : undefined,
  }));
  const data = rowsForChart.map((r) => {
    const o: Record<string, string | number> = { x: labelRow(r) };
    def.values.forEach((_, i) => (o[`s${i}`] = p.rowTotals.get(K(r))?.[i] ?? 0));
    return o;
  });
  return <ComboChart data={data} xKey="x" series={series} format={format} className="h-[26rem]" />;
}
