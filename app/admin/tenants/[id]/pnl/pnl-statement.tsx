import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PnlPreview } from "@/lib/pnl";
import { SECTION_LABEL, SECTION_ORDER, SUBTOTALS } from "@/lib/pnl-templates";
import type { PnlSection } from "@/lib/generated/prisma/enums";

type Line = { code: string; name: string; section: PnlSection; sortOrder: number };

const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαϊ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
const eur = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("el-GR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const add = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] ?? 0));

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-muted-foreground">—</span>;
  const d = ((now - before) / Math.abs(before)) * 100;
  return <span className={cn(d >= 0 ? "text-emerald-600" : "text-red-600")}>{`${d >= 0 ? "+" : ""}${d.toFixed(1)}%`}</span>;
}

/** Monthly P&L statement: lines grouped by section, subtotals (Μικτό κέρδος, EBITDA …), vs previous year. */
export function PnlStatement({ lines, preview, hrefForYear }: { lines: Line[]; preview: PnlPreview; hrefForYear: (y: number) => string }) {
  const zero = Array(12).fill(0) as number[];
  let running = zero;
  let runningPrev = 0;
  const rows: React.ReactNode[] = [];

  for (const section of SECTION_ORDER) {
    const inSection = lines.filter((l) => l.section === section).sort((a, b) => a.sortOrder - b.sortOrder);
    if (inSection.length) {
      rows.push(
        <tr key={`h-${section}`} className="bg-muted/40">
          <td colSpan={16} className="sticky left-0 px-3 py-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
            {SECTION_LABEL[section]}
          </td>
        </tr>,
      );
      for (const l of inSection) {
        const m = preview.months[l.code] ?? zero;
        const prev = preview.previous[l.code] ?? 0;
        running = add(running, m);
        runningPrev += prev;
        rows.push(
          <tr key={l.code} className="border-b border-border/50 hover:bg-muted/30">
            <td className="sticky left-0 z-10 bg-card px-3 py-1.5 whitespace-nowrap">{l.name}</td>
            {m.map((v, i) => (
              <td key={i} className={cn("px-2 py-1.5 text-right", v < 0 && "text-red-700/90")}>
                {eur(v)}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-medium">{eur(sum(m))}</td>
            <td className="px-2 py-1.5 text-right text-muted-foreground">{eur(prev)}</td>
            <td className="px-2 py-1.5 text-right">
              <Delta now={sum(m)} before={prev} />
            </td>
          </tr>,
        );
      }
    }
    const subtotal = SUBTOTALS[section];
    if (subtotal && lines.some((l) => SECTION_ORDER.indexOf(l.section) <= SECTION_ORDER.indexOf(section))) {
      const total = sum(running);
      rows.push(
        <tr key={`s-${section}`} className="border-y border-border bg-primary/5 font-semibold">
          <td className="sticky left-0 z-10 bg-[color-mix(in_oklab,var(--card),var(--primary)_5%)] px-3 py-2 whitespace-nowrap">{subtotal}</td>
          {running.map((v, i) => (
            <td key={i} className={cn("px-2 py-2 text-right", v < 0 && "text-red-700")}>
              {eur(v)}
            </td>
          ))}
          <td className={cn("px-2 py-2 text-right", total < 0 && "text-red-700")}>{eur(total)}</td>
          <td className="px-2 py-2 text-right text-muted-foreground">{eur(runningPrev)}</td>
          <td className="px-2 py-2 text-right">
            <Delta now={total} before={runningPrev} />
          </td>
        </tr>,
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Χρήση</span>
        {preview.years.map((y) => (
          <Link
            key={y}
            href={hrefForYear(y)}
            scroll={false}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs tabular-nums transition-colors",
              y === preview.year ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {y}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1100px] text-xs tabular-nums">
          <thead>
            <tr className="border-b bg-muted/60 text-2xs text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium">Γραμμή</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Σύνολο {preview.year}</th>
              <th className="px-2 py-2 text-right font-medium">{preview.year - 1}</th>
              <th className="px-2 py-2 text-right font-medium">Δ%</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
      <p className="text-2xs text-muted-foreground">
        Ποσά σε € (καθαρή αξία). Έσοδα θετικά, έξοδα αρνητικά. Από τη Γενική Λογιστική λαμβάνονται οι περίοδοι 1–12 —
        οι εγγραφές απογραφής και κλεισίματος ισολογισμού εξαιρούνται.
      </p>
    </div>
  );
}
