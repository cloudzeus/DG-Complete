import { cn } from "@/lib/utils";

// Server-rendered table. On small screens each row becomes a stacked card (labels from `header`),
// so nothing scrolls sideways; from md up it is a regular dense table.
export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
  /** Hide on the mobile card (e.g. a column that repeats the title). */
  hideOnMobile?: boolean;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  caption?: string;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <ul className="divide-y divide-border/70 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
            {columns
              .filter((c) => !c.hideOnMobile)
              .map((c, i) =>
                i === 0 ? (
                  <div key={c.key} className="font-medium">
                    {c.cell(r)}
                  </div>
                ) : (
                  <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="shrink-0 text-xs text-muted-foreground">{c.header}</span>
                    <span className="min-w-0 text-right">{c.cell(r)}</span>
                  </div>
                ),
              )}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border/70">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn("h-9 px-3 text-left text-2xs font-semibold tracking-[0.08em] text-muted-foreground uppercase first:pl-0 last:pr-0", c.align === "right" && "text-right", c.className)}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-b border-border/50 transition-colors duration-150 last:border-0 hover:bg-muted/40">
                {columns.map((c) => (
                  <td key={c.key} className={cn("h-11 px-3 align-middle first:pl-0 last:pr-0", c.align === "right" && "text-right tabular-nums", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
