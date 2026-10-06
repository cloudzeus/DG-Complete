"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { ExportButton, type ExportSheetSpec } from "@/components/dashboards/export-button";
import { cn } from "@/lib/utils";

export type ListColumn = {
  key: string;
  label: string;
  format?: "text" | "eur" | "int" | "num" | "pct" | "date" | "badge";
  size?: number;
  grow?: boolean;
  /** badge: value → tone class */
  tones?: Record<string, string>;
  /** Makes the cell a link: a path with {member} placeholders, e.g. "/dashboards/x/customers/{customers.customer_code}". */
  link?: string;
  /** red when below / above */
  warnBelow?: number;
  warnAbove?: number;
};

type Row = Record<string, unknown>;

const fmt = (v: unknown, f: ListColumn["format"]) => {
  if (v === null || v === undefined || v === "") return null;
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
    case "date": {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("el-GR");
    }
    default:
      return String(v);
  }
};

const NUMERIC = new Set(["eur", "int", "num", "pct"]);

/** A business list from Cube rows: sortable/resizable DataTable + Excel export of the same query. */
export function CubeTable({
  tenantId,
  rows,
  columns,
  storageKey,
  title,
  query,
  searchPlaceholder = "Αναζήτηση…",
  emptyMessage = "Δεν υπάρχουν εγγραφές.",
  initialSort,
}: {
  tenantId: string;
  rows: Row[];
  columns: ListColumn[];
  storageKey: string;
  title: string;
  query: Record<string, unknown>;
  searchPlaceholder?: string;
  emptyMessage?: string;
  initialSort?: { id: string; desc: boolean };
}) {
  const defs = useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        accessorFn: (r: Row) => (NUMERIC.has(c.format ?? "") ? Number(r[c.key] ?? 0) : String(r[c.key] ?? "")),
        header: c.label,
        size: c.size ?? (c.grow ? 260 : NUMERIC.has(c.format ?? "") ? 120 : 140),
        meta: { label: c.label, grow: c.grow, align: NUMERIC.has(c.format ?? "") ? "right" : "left" },
        cell: ({ row }) => {
          const v = row.original[c.key];
          const text = fmt(v, c.format === "badge" ? "text" : c.format);
          if (text === null) return <span className="text-muted-foreground">—</span>;
          if (c.format === "badge") {
            return <span className={cn("rounded px-1.5 py-px text-2xs font-semibold", c.tones?.[String(v)] ?? "bg-muted text-foreground")}>{text}</span>;
          }
          const n = Number(v);
          const warn = (c.warnBelow !== undefined && n < c.warnBelow) || (c.warnAbove !== undefined && n > c.warnAbove);
          if (c.link) {
            const href = c.link.replace(/\{([^}]+)\}/g, (_, k: string) => encodeURIComponent(String(row.original[k] ?? "")));
            return (
              <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
                {text}
              </Link>
            );
          }
          return <span className={cn(NUMERIC.has(c.format ?? "") && "tabular-nums", warn && "font-medium text-red-600", c.grow && "font-medium")}>{text}</span>;
        },
      })),
    [columns],
  );

  const sheet: ExportSheetSpec = {
    name: title.slice(0, 31),
    columns: columns.map((c) => ({ key: c.key, label: c.label, format: c.format === "badge" ? "text" : c.format })),
    query: { ...query, limit: 50_000 },
  };

  return (
    <DataTable
      storageKey={storageKey}
      columns={defs}
      data={rows}
      searchPlaceholder={searchPlaceholder}
      initialSorting={initialSort ? [initialSort] : []}
      initialPageSize={50}
      emptyMessage={emptyMessage}
      toolbar={<ExportButton tenantId={tenantId} title={title} sheets={[sheet]} />}
    />
  );
}
