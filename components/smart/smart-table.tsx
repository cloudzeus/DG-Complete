"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import type { BriefKind } from "@/app/dashboards/[tenantId]/smart/actions";
import { ExportButton } from "@/components/dashboards/export-button";
import { AiBrief } from "@/components/smart/ai-brief";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Table of the smart modules with serialisable columns (usable from server pages): search, sort,
// "show more", Excel export of all rows, and expandable rows with detail lines and an AI brief.

export type SmartColumn = {
  key: string;
  label: string;
  format?: "text" | "eur" | "pct" | "int" | "num" | "date";
  /** Colour positive green / negative red. */
  signed?: boolean;
  /** Hidden on the screen, kept in Excel. */
  excelOnly?: boolean;
  wide?: boolean;
};

const fmt = (v: unknown, f: SmartColumn["format"]) => {
  if (v === null || v === undefined || v === "") return "—";
  if (f === "eur") return `${Math.round(Number(v)).toLocaleString("el-GR")} €`;
  if (f === "pct") return `${Number(v).toLocaleString("el-GR", { maximumFractionDigits: 1 })}%`;
  if (f === "int") return Math.round(Number(v)).toLocaleString("el-GR");
  if (f === "num") return Number(v).toLocaleString("el-GR", { maximumFractionDigits: 2 });
  if (f === "date") return new Date(String(v)).toLocaleDateString("el-GR");
  return String(v);
};

export function SmartTable({
  tenantId,
  title,
  rows,
  columns,
  idKey,
  detailKey,
  brief,
  initialSort,
  pageSize = 25,
  searchPlaceholder = "Αναζήτηση…",
}: {
  tenantId: string;
  /** Excel file title. */
  title: string;
  rows: Record<string, unknown>[];
  columns: SmartColumn[];
  idKey: string;
  /** Row field with detail lines (string[]) shown when the row is expanded. */
  detailKey?: string;
  brief?: { kind: BriefKind; label?: string };
  initialSort?: { key: string; desc: boolean };
  pageSize?: number;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [shown, setShown] = useState(pageSize);
  const [open, setOpen] = useState<string | null>(null);
  const visible = columns.filter((c) => !c.excelOnly);
  const expandable = !!(detailKey || brief);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    let r = t ? rows.filter((x) => columns.some((c) => (c.format ?? "text") === "text" && String(x[c.key] ?? "").toLowerCase().includes(t))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const num = col?.format && col.format !== "text" && col.format !== "date";
      r = [...r].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        const c = num ? Number(x ?? -Infinity) - Number(y ?? -Infinity) : String(x ?? "").localeCompare(String(y ?? ""), "el");
        return sort.desc ? -c : c;
      });
    }
    return r;
  }, [rows, columns, q, sort]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-7 text-xs" />
        </div>
        <span className="text-xs text-muted-foreground">{list.length.toLocaleString("el-GR")} εγγραφές</span>
        <div className="ml-auto">
          <ExportButton
            tenantId={tenantId}
            title={title}
            sheets={[
              {
                name: title.slice(0, 30),
                columns: columns.map((c) => ({ key: c.key, label: c.label, format: c.format === "eur" ? "eur" : c.format === "pct" ? "pct" : c.format === "int" ? "int" : c.format === "num" ? "num" : c.format === "date" ? "date" : "text" })),
                rows: list.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null]))),
              },
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {expandable && <th className="w-6" />}
              {visible.map((c) => {
                const num = c.format && c.format !== "text";
                return (
                  <th key={c.key} className={cn("px-2 py-2 font-medium whitespace-nowrap", num ? "text-right" : "text-left")}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSort({ key: c.key, desc: sort?.key === c.key ? !sort.desc : !!num })}
                    >
                      {c.label}
                      {sort?.key === c.key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((r) => {
              const id = String(r[idKey]);
              const isOpen = open === id;
              return (
                <Fragment key={id}>
                  <tr className={cn("border-t", expandable && "cursor-pointer hover:bg-muted/40", isOpen && "bg-muted/40")} onClick={expandable ? () => setOpen(isOpen ? null : id) : undefined}>
                    {expandable && (
                      <td className="pl-2 text-muted-foreground">
                        <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                      </td>
                    )}
                    {visible.map((c) => {
                      const v = r[c.key];
                      const num = c.format && c.format !== "text";
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "px-2 py-1.5",
                            num ? "text-right whitespace-nowrap tabular-nums" : c.wide ? "min-w-48" : "max-w-64 truncate",
                            c.signed && Number(v) > 0 && "text-emerald-700 dark:text-emerald-400",
                            c.signed && Number(v) < 0 && "text-red-600",
                          )}
                          title={num ? undefined : String(v ?? "")}
                        >
                          {c.signed && Number(v) > 0 ? "+" : ""}
                          {fmt(v, c.format)}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/20">
                      <td colSpan={visible.length + 1} className="space-y-3 px-4 py-3">
                        {detailKey && Array.isArray(r[detailKey]) && (r[detailKey] as string[]).length > 0 && (
                          <ul className="list-disc space-y-0.5 pl-4 text-xs">
                            {(r[detailKey] as string[]).map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                        )}
                        {brief && <AiBrief tenantId={tenantId} kind={brief.kind} refId={id} label={brief.label} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={visible.length + 1} className="py-8 text-center text-muted-foreground">
                  Δεν βρέθηκαν εγγραφές.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {list.length > shown && (
        <Button size="sm" variant="ghost" onClick={() => setShown((s) => s + pageSize * 2)}>
          Περισσότερα ({(list.length - shown).toLocaleString("el-GR")})
        </Button>
      )}
    </div>
  );
}
