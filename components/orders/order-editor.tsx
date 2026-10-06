"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send, Trash2, TrendingDown, TrendingUp, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { loadSupplierLines, submitPurchaseOrder } from "@/app/dashboards/[tenantId]/orders/actions";
import { ExportButton } from "@/components/dashboards/export-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrderLine, OrderSupplier } from "@/lib/purchase-orders";
import { cn } from "@/lib/utils";

// Order suggestions per supplier: pick a supplier, adjust quantities or drop lines, export to
// Excel, and create the purchase order in SoftOne (item + quantity; SoftOne prices it).

type Line = OrderLine & { qty: number; removed: boolean };

const URGENCY = {
  critical: { label: "Επείγον", plural: "επείγοντα", badge: "bg-red-50 text-red-700 ring-red-200", row: "border-l-red-500 bg-red-50/40 dark:bg-red-950/20" },
  urgent: { label: "Σύντομα", plural: "για σύντομα", badge: "bg-amber-50 text-amber-800 ring-amber-200", row: "border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10" },
  normal: { label: "Κανονικό", plural: "κανονικά", badge: "bg-muted text-muted-foreground ring-border", row: "border-l-transparent" },
} as const;

const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

/** Sales per month as 12 tiny bars (oldest → this month); the last 3 months stand out. */
function MonthBars({ values, rising }: { values: number[]; rising: boolean }) {
  const max = Math.max(...values, 0);
  const now = new Date().getMonth();
  const title = values.map((v, i) => `${MONTHS[(now - 11 + i + 24) % 12]}: ${v.toLocaleString("el-GR")}`).join(" · ");
  return (
    <svg viewBox="0 0 120 28" className="h-7 w-32" role="img" aria-label={`Πωλήσεις ανά μήνα: ${title}`}>
      <title>{title}</title>
      {values.map((v, i) => {
        const h = max > 0 ? Math.max((Math.max(v, 0) / max) * 26, v > 0 ? 2 : 0.75) : 0.75;
        const recent = i >= 9;
        return (
          <rect
            key={i}
            x={i * 10 + 1}
            y={28 - h}
            width={8}
            height={h}
            rx={1}
            className={recent ? (rising ? "fill-orange-500" : "fill-sky-600") : "fill-slate-300 dark:fill-slate-600"}
          />
        );
      })}
    </svg>
  );
}

const num = (v: number | null, digits = 0) => (v === null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: digits }));

export function OrderEditor({
  tenantId,
  suppliers,
  canCreate,
  problem,
  series: allowedSeries,
}: {
  tenantId: string;
  suppliers: OrderSupplier[];
  canCreate: boolean;
  /** Series the order may be written to (domestic / EU / third country …). */
  series: { id: number; label: string }[];
  /** Why orders can't be sent right now (no series, no connection …), or null. */
  problem: string | null;
}) {
  const [supplier, setSupplier] = useState<OrderSupplier | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [confirm, setConfirm] = useState<null | { duplicate?: string }>(null);
  // Per supplier: preselected from their latest order in SoftOne; must be chosen when unknown.
  const [series, setSeries] = useState<number | null>(null);
  const [created, setCreated] = useState<{ supplier: string; fincode: string } | null>(null);

  function pick(s: OrderSupplier) {
    if (s.trdr === null) return;
    setSupplier(s);
    setCreated(null);
    startLoad(async () => {
      const r = await loadSupplierLines(tenantId, s.trdr!);
      setLines(r.lines.map((l) => ({ ...l, qty: l.suggested, removed: false })));
      setSeries(r.series);
    });
  }

  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const active = lines.filter((l) => !l.removed && l.qty > 0);
  const shown = onlyUrgent ? lines.filter((l) => l.urgency !== "normal") : lines;
  const rising = lines.filter((l) => !l.removed && l.trendPct !== null && l.trendPct >= 20).length;
  const update = (mtrl: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.mtrl === mtrl ? { ...l, ...patch } : l)));

  function send(force = false) {
    if (!supplier?.trdr || !series) return;
    startSend(async () => {
      const r = await submitPurchaseOrder({
        tenantId,
        trdr: supplier.trdr!,
        series,
        supplierName: supplier.name,
        lines: active.map((l) => ({ mtrl: l.mtrl, qty: l.qty })),
        force,
      });
      if (r.ok) {
        setConfirm(null);
        setCreated({ supplier: supplier.name, fincode: r.fincode });
        toast.success(`Η παραγγελία ${r.fincode} δημιουργήθηκε στο SoftOne (${r.lines} γραμμές).`);
      } else if (r.duplicate) setConfirm({ duplicate: r.error });
      else {
        setConfirm(null);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-xl border bg-card">
        <div className="border-b px-3 py-2 text-sm font-medium">Προμηθευτές με προτάσεις</div>
        <div className="max-h-[60svh] overflow-y-auto p-1.5 lg:max-h-[calc(100svh-14rem)]">
          {suppliers.length === 0 && <p className="p-3 text-sm text-muted-foreground">Δεν υπάρχουν προτάσεις παραγγελίας αυτή τη στιγμή.</p>}
          {suppliers.map((s) => (
            <button
              key={s.trdr ?? "none"}
              type="button"
              disabled={s.trdr === null}
              onClick={() => pick(s)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                s.trdr === null ? "cursor-not-allowed text-muted-foreground" : "hover:bg-muted",
                supplier?.trdr === s.trdr && s.trdr !== null && "bg-dg-red-50/70 text-dg-red-700 dark:bg-white/5",
              )}
              title={s.trdr === null ? "Ορίστε κύριο προμηθευτή στα είδη αυτά στο SoftOne" : undefined}
            >
              <span className="min-w-0 truncate">{s.name}</span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums">{s.items}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 space-y-3">
        {!supplier ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Επιλέξτε προμηθευτή για να δείτε την πρόταση παραγγελίας.</div>
        ) : (
          <div className="rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{supplier.name}</div>
                <div className="text-xs text-muted-foreground">
                  {active.length.toLocaleString("el-GR")} γραμμές προς παραγγελία
                  {lines.length !== active.length && ` · ${lines.length - active.length} εκτός`}
                  {canCreate && allowedSeries.length > 0 && !loading && (
                    <> · σειρά: {series ? (allowedSeries.find((x) => x.id === series)?.label ?? series) : "δεν έχει οριστεί — επιλέξτε τη στη δημιουργία"}</>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ExportButton
                  tenantId={tenantId}
                  title={`Παραγγελία ${supplier.name}`}
                  sheets={[
                    {
                      name: "Παραγγελία",
                      columns: [
                        { key: "code", label: "Κωδικός" },
                        { key: "name", label: "Είδος" },
                        { key: "urgencyLabel", label: "Προτεραιότητα" },
                        { key: "why", label: "Γιατί" },
                        { key: "stock", label: "Απόθεμα", format: "num" },
                        { key: "coverNow", label: "Κάλυψη τώρα (ημ.)", format: "num" },
                        { key: "leadDays", label: "Παράδοση (ημ.)", format: "int" },
                        { key: "qty90d", label: "Πωλήσεις 3μ (τεμ.)", format: "num" },
                        { key: "qty12m", label: "Πωλήσεις 12μ (τεμ.)", format: "num" },
                        { key: "qtyPrev12m", label: "Προηγ. 12μ (τεμ.)", format: "num" },
                        { key: "trendPct", label: "Τάση 3μ %", format: "pct" },
                        { key: "qty", label: "Ποσότητα παραγγελίας", format: "num" },
                      ],
                      rows: active.map((l) => ({ ...l, urgencyLabel: URGENCY[l.urgency].label, why: l.reasons.join(" · ") })),
                    },
                  ]}
                />
                {canCreate && (
                  <Button type="button" size="sm" disabled={!!problem || !active.length || sending || loading} onClick={() => setConfirm({})}>
                    <Send className="size-3.5" />
                    Δημιουργία παραγγελίας στο SoftOne
                  </Button>
                )}
              </div>
            </div>

            {problem && canCreate && (
              <Alert className="m-4 w-auto">
                <AlertTitle>Η αποστολή στο SoftOne δεν είναι διαθέσιμη</AlertTitle>
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}
            {created && (
              <Alert className="m-4 w-auto border-emerald-200 bg-emerald-50/60">
                <CheckCircle2 className="text-emerald-600" />
                <AlertTitle>Η παραγγελία {created.fincode} δημιουργήθηκε</AlertTitle>
                <AlertDescription>Θα τη βρείτε στο SoftOne στις παραγγελίες αγορών του προμηθευτή {created.supplier}.</AlertDescription>
              </Alert>
            )}

            {!loading && lines.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
                {(["critical", "urgent"] as const).map((u) => {
                  const count = lines.filter((l) => l.urgency === u && !l.removed).length;
                  return count ? (
                    <span key={u} className={cn("rounded-full px-2 py-0.5 font-medium ring-1 ring-inset", URGENCY[u].badge)}>
                      {count} {URGENCY[u].plural}
                    </span>
                  ) : null;
                })}
                {rising > 0 && (
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 font-medium text-orange-700 ring-1 ring-orange-200 ring-inset">
                    {rising} με αυξημένη ζήτηση
                  </span>
                )}
                <label className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 text-muted-foreground">
                  <input type="checkbox" className="size-4" checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)} />
                  Μόνο τα επείγοντα
                </label>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Φόρτωση…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Είδος · γιατί</th>
                      <th className="px-3 py-2 text-left font-medium">Κίνηση 12 μηνών</th>
                      <th className="px-3 py-2 text-right font-medium">Τάση 3μ</th>
                      <th className="px-3 py-2 text-right font-medium">Απόθεμα</th>
                      <th className="px-3 py-2 text-right font-medium" title="Ημέρες που φτάνει το απόθεμα με τον τρέχοντα ρυθμό πωλήσεων">
                        Κάλυψη / παράδοση
                      </th>
                      <th className="w-28 px-3 py-2 text-right font-medium">Ποσότητα</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((l) => {
                      const up = l.trendPct !== null && l.trendPct >= 20;
                      const down = l.trendPct !== null && l.trendPct <= -20;
                      return (
                        <tr
                          key={l.mtrl}
                          className={cn(
                            "border-t border-l-4 align-top",
                            l.removed ? "border-l-transparent text-muted-foreground opacity-60" : URGENCY[l.urgency].row,
                          )}
                        >
                          <td className="max-w-96 min-w-64 px-3 py-2">
                            <div className={cn("flex items-start gap-2", l.removed && "line-through")}>
                              <span className="min-w-0 flex-1 font-medium">{l.name}</span>
                              {l.urgency !== "normal" && !l.removed && (
                                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset", URGENCY[l.urgency].badge)}>
                                  {URGENCY[l.urgency].label}
                                </span>
                              )}
                            </div>
                            <div className="text-2xs text-muted-foreground">
                              {l.code}
                              {l.abc && ` · τάξη ${l.abc}`}
                            </div>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {l.reasons.map((r) => (
                                <li key={r} className={cn(r.startsWith("Ζήτηση ↑") && "font-medium text-orange-700")}>
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="px-3 py-2">
                            <MonthBars values={l.monthly} rising={up} />
                            <div className="mt-1 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
                              3μ {num(l.qty90d)} · 12μ {num(l.qty12m)} · πέρσι {num(l.qtyPrev12m)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {l.trendPct === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                                  up ? "bg-orange-100 text-orange-700" : down ? "bg-slate-100 text-slate-600" : "text-muted-foreground",
                                )}
                              >
                                {up ? <TrendingUp className="size-3" /> : down ? <TrendingDown className="size-3" /> : null}
                                {l.trendPct > 0 ? "+" : ""}
                                {l.trendPct}%
                              </span>
                            )}
                          </td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", l.stock <= 0 && "font-semibold text-red-600")}>{num(l.stock, 2)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                            <span className={cn(l.urgency === "critical" && "font-semibold text-red-600", l.urgency === "urgent" && "font-semibold text-amber-700")}>
                              {num(l.coverNow, 0)}
                            </span>
                            <span className="text-muted-foreground"> / {num(l.leadDays)} ημ.</span>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={Number.isFinite(l.qty) ? l.qty : ""}
                              disabled={l.removed}
                              onChange={(e) => update(l.mtrl, { qty: e.target.value === "" ? 0 : Number(e.target.value) })}
                              className="h-9 text-right tabular-nums"
                              aria-label={`Ποσότητα ${l.name}`}
                            />
                            {l.qty !== l.suggested && !l.removed && (
                              <div className="mt-0.5 text-right text-2xs text-muted-foreground">πρόταση {num(l.suggested)}</div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              onClick={() => update(l.mtrl, { removed: !l.removed })}
                              aria-label={l.removed ? "Επαναφορά γραμμής" : "Διαγραφή γραμμής"}
                            >
                              {l.removed ? <Undo2 className="size-4" /> : <Trash2 className="size-4" />}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !sending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.duplicate ? "Δεύτερη παραγγελία;" : "Δημιουργία παραγγελίας στο SoftOne"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.duplicate
                ? `${confirm.duplicate} Θέλετε σίγουρα να δημιουργηθεί και δεύτερη;`
                : `Θα δημιουργηθεί παραγγελία αγοράς προς «${supplier?.name}» με ${active.length} γραμμές (είδος και ποσότητα· τις τιμές τις βάζει το SoftOne).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!confirm?.duplicate && (
            <div className="space-y-1.5">
              <label htmlFor="po-series" className="text-sm font-medium">
                Σειρά παραστατικού
              </label>
              <select
                id="po-series"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={series ?? ""}
                onChange={(e) => setSeries(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Επιλέξτε σειρά —</option>
                {allowedSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending || !series}
              onClick={(e) => {
                e.preventDefault();
                send(!!confirm?.duplicate);
              }}
            >
              {sending && <Loader2 className="size-4 animate-spin" />}
              {confirm?.duplicate ? "Ναι, και δεύτερη" : "Δημιουργία"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
