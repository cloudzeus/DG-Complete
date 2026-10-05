"use client";

import { useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Column meta used by DataTable: a human label for the column picker and alignment.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    label?: string;
    align?: "left" | "right" | "center";
    /** Not listed in the column picker and never hidden (e.g. row actions). */
    fixed?: boolean;
    /** Takes the remaining width (default: the first visible column). */
    grow?: boolean;
  }
}

const PAGE_SIZES = [10, 20, 50, 100];

type Persisted = { visibility?: VisibilityState; sizing?: ColumnSizingState; pageSize?: number };

function readPersisted(key?: string): Persisted {
  if (!key || typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(`dt:${key}`) ?? "{}") as Persisted;
  } catch {
    return {};
  }
}

export function DataTable<TData>({
  columns,
  data,
  storageKey,
  searchPlaceholder = "Αναζήτηση…",
  toolbar,
  emptyMessage = "Δεν υπάρχουν εγγραφές.",
  initialSorting = [],
  initialPageSize = 20,
  initialHidden = [],
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Persists visible columns, widths and page size per viewer (localStorage). */
  storageKey?: string;
  searchPlaceholder?: string | null;
  toolbar?: React.ReactNode;
  emptyMessage?: React.ReactNode;
  initialSorting?: SortingState;
  initialPageSize?: number;
  initialHidden?: string[];
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    Object.fromEntries(initialHidden.map((id) => [id, false])),
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: initialPageSize });
  const [hydrated, setHydrated] = useState(false);

  // Restore per-viewer preferences after mount (localStorage is client-only).
  useEffect(() => {
    const saved = readPersisted(storageKey);
    if (saved.visibility) setColumnVisibility(saved.visibility);
    if (saved.sizing) setColumnSizing(saved.sizing);
    if (saved.pageSize && PAGE_SIZES.includes(saved.pageSize)) setPagination((p) => ({ ...p, pageSize: saved.pageSize! }));
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      localStorage.setItem(
        `dt:${storageKey}`,
        JSON.stringify({ visibility: columnVisibility, sizing: columnSizing, pageSize: pagination.pageSize } satisfies Persisted),
      );
    } catch {
      /* storage unavailable — preferences just aren't remembered */
    }
  }, [storageKey, hydrated, columnVisibility, columnSizing, pagination.pageSize]);

  // TanStack Table v8 returns non-memoizable functions; React Compiler skips this component by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility, columnSizing, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: (v) => {
      setGlobalFilter(String(v ?? ""));
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: setPagination,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    defaultColumn: { minSize: 60, size: 140, maxSize: 640 },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const pickable = table.getAllLeafColumns().filter((c) => c.getCanHide() && !c.columnDef.meta?.fixed);
  // One column stretches to fill the card; the others keep their (resizable) pixel widths.
  const visibleCols = table.getVisibleLeafColumns();
  const growId = (visibleCols.find((c) => c.columnDef.meta?.grow) ?? visibleCols.find((c) => !c.columnDef.meta?.fixed))?.id;
  const growUserSized = growId ? columnSizing[growId] !== undefined : false;
  const minTableWidth = visibleCols.reduce((sum, c) => sum + (c.id === growId && !growUserSized ? (c.columnDef.minSize ?? 160) : c.getSize()), 0);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {searchPlaceholder !== null && (
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8"
              aria-label="Αναζήτηση στον πίνακα"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 />
                Στήλες
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">Εμφανιζόμενες στήλες</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pickable.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {column.columnDef.meta?.label ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  table.resetColumnVisibility();
                  table.resetColumnSizing();
                }}
              >
                <RotateCcw />
                Επαναφορά
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/80">
        <table className="w-full table-fixed caption-bottom text-sm tabular-nums" style={{ minWidth: minTableWidth }}>
          <colgroup>
            {visibleCols.map((c) => (
              <col key={c.id} style={c.id === growId && !growUserSized ? undefined : { width: c.getSize() }} />
            ))}
          </colgroup>
          <thead className="bg-muted/70">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border/80">
                {hg.headers.map((header) => {
                  const col = header.column;
                  const sorted = col.getIsSorted();
                  const align = col.columnDef.meta?.align ?? "left";
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "group/th relative h-9 px-3 text-left align-middle text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase select-none",
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                      )}
                    >
                      {header.isPlaceholder ? null : col.getCanSort() ? (
                        <button
                          type="button"
                          onClick={col.getToggleSortingHandler()}
                          className={cn(
                            "-mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 uppercase hover:bg-background/80 hover:text-foreground",
                            sorted && "text-foreground",
                            align === "right" && "flex-row-reverse",
                          )}
                          title="Ταξινόμηση"
                        >
                          <span className="truncate">{flexRender(col.columnDef.header, header.getContext())}</span>
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3 shrink-0 text-dg-red-500" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3 shrink-0 text-dg-red-500" />
                          ) : (
                            <ChevronsUpDown className="size-3 shrink-0 opacity-40 group-hover/th:opacity-80" />
                          )}
                        </button>
                      ) : (
                        flexRender(col.columnDef.header, header.getContext())
                      )}
                      {col.getCanResize() && (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Αλλαγή πλάτους στήλης"
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => col.resetSize()}
                          className={cn(
                            "absolute top-1.5 right-0 bottom-1.5 w-1.5 cursor-col-resize touch-none rounded-full",
                            "after:absolute after:inset-y-0 after:right-0.5 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-dg-red-400",
                            col.getIsResizing() && "after:w-0.5 after:bg-dg-red-500",
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-10 text-center text-muted-foreground">
                  {globalFilter ? "Κανένα αποτέλεσμα για την αναζήτηση." : emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-sisyphus-50/60 dark:hover:bg-white/5"
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = cell.column.columnDef.meta?.align ?? "left";
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "truncate px-3 py-2 align-middle",
                          align === "right" && "text-right",
                          align === "center" && "text-center",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col-reverse items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <span>
          {from}–{to} από {total}
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            Ανά σελίδα
            <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger size="sm" className="w-18" aria-label="Εγγραφές ανά σελίδα">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
          <span className="tabular-nums">
            Σελίδα {table.getPageCount() === 0 ? 0 : pageIndex + 1} / {table.getPageCount()}
          </span>
          <span className="flex gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()} aria-label="Πρώτη σελίδα">
              <ChevronsLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Προηγούμενη σελίδα">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Επόμενη σελίδα">
              <ChevronRight />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()} aria-label="Τελευταία σελίδα">
              <ChevronsRight />
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
