"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { fieldLabel, INTERNAL_ID_FIELDS } from "@/lib/softone-labels";

type Row = Record<string, unknown>;

const NUMERIC = /^(PRICE|PRICER|PRICEW|SUMAMNT|NETAMNT|VATAMNT|LINEVAL|QTY1|PERCNT|DISC1PRC)$/;
const BOOLEAN = /^(ISACTIVE|ISCANCEL)$/;

function formatValue(field: string, v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  if (BOOLEAN.test(field)) return String(v) === "1" ? "Ναι" : "Όχι";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) {
    const d = new Date(v.replace(" ", "T"));
    if (!isNaN(d.getTime())) return d.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" });
  }
  if (NUMERIC.test(field)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toLocaleString("el-GR", { maximumFractionDigits: 4 });
  }
  return String(v);
}

/**
 * Generic viewer of a sync job's mirrored rows: Greek column labels, internal ids never shown,
 * foreign keys displayed by name (lookups built on the server from the other mirrored tables).
 */
export function RecordsTable({
  jobId,
  table,
  fields,
  keyField,
  rows,
  lookups,
}: {
  jobId: string;
  table: string;
  fields: string[];
  keyField: string;
  rows: Row[];
  lookups: Record<string, Record<string, string>>;
}) {
  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => {
    const keys = new Set(keyField.split(","));
    const visible = fields.filter((f) => {
      if (lookups[f]) return true; // FK shown by name
      if (keys.has(f)) return false; // the table's own id
      return !INTERNAL_ID_FIELDS.has(f); // other raw ids we cannot resolve
    });
    const nameField = visible.find((f) => f === "NAME") ?? visible.find((f) => f === "FINCODE") ?? visible[0];
    const display = (r: Row, f: string) => {
      const v = r[f];
      if (lookups[f]) return v === null || v === undefined || v === "" ? null : (lookups[f][String(v)] ?? null);
      return formatValue(f, v);
    };
    return visible.map((f) => ({
      id: f,
      accessorFn: (r: Row) => {
        if (NUMERIC.test(f)) return Number(r[f] ?? 0);
        return display(r, f) ?? "";
      },
      header: fieldLabel(table, f),
      size: f === nameField ? 280 : NUMERIC.test(f) ? 120 : BOOLEAN.test(f) ? 90 : 150,
      meta: { label: fieldLabel(table, f), grow: f === nameField, align: NUMERIC.test(f) ? "right" : "left" },
      cell: ({ row }) => {
        const text = display(row.original, f);
        return text === null ? <span className="text-muted-foreground">—</span> : <span className={f === "CODE" ? "font-mono" : undefined}>{text}</span>;
      },
    }));
  }, [fields, keyField, lookups, table]);

  const first = columns.find((c) => c.meta?.grow)?.id;

  return (
    <DataTable
      storageKey={`sync-records:${jobId}`}
      columns={columns}
      data={rows}
      searchPlaceholder="Αναζήτηση στα δεδομένα…"
      initialSorting={first ? [{ id: first, desc: false }] : []}
      initialPageSize={50}
      emptyMessage="Δεν υπάρχουν δεδομένα ακόμα — εκτελέστε τον συγχρονισμό."
    />
  );
}
