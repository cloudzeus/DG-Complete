import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightLeft, Clock, ExternalLink, PackageCheck, ShieldAlert, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { DashboardErrors } from "@/components/dashboards/blocks";
import { MonthBars } from "@/components/dashboards/month-bars";
import { OrdersTabs } from "@/components/orders/orders-tabs";
import { AiJudge } from "./ai-judge";
import { brandPlan, brandSummaries, type BrandPlan, type BrandSummary } from "@/lib/brand-orders";
import { requireDashboardTenant } from "@/lib/dashboards";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Προτάσεις παραγγελίας ανά μάρκα" };

const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const num = (v: number | null, d = 0) => (v === null ? "—" : v.toLocaleString("el-GR", { maximumFractionDigits: d }));
const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];

function Trend({ v }: { v: number | null }) {
  if (v === null) return null;
  const up = v >= 10;
  const down = v <= -10;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-2xs font-semibold tabular-nums", up ? "text-emerald-700" : down ? "text-red-600" : "text-muted-foreground")}>
      {up ? <TrendingUp className="size-3" /> : down ? <TrendingDown className="size-3" /> : null}
      {v > 0 ? "+" : ""}
      {v}%
    </span>
  );
}

export default async function BrandOrdersPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/orders/brands">) {
  const { tenantId } = await params;
  await requireDashboardTenant(tenantId, "orders-smart");
  const sp = await searchParams;
  let brands: BrandSummary[] = [];
  let plan: BrandPlan | null = null;
  let error: string | null = null;
  try {
    brands = await brandSummaries(tenantId);
    const selected = Number(sp.brand) || brands[0]?.mtrmark;
    if (selected) plan = await brandPlan(tenantId, selected);
  } catch (e) {
    error = (e as Error).message;
  }
  const base = `/dashboards/${tenantId}/orders`;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Προτάσεις παραγγελίας ανά μάρκα</h1>
        <p className="text-xs text-muted-foreground">
          Τι χρειάζεται κάθε μάρκα και γιατί: εξάντληση αποθέματος σε σχέση με τον μετρημένο χρόνο παράδοσης του προμηθευτή, πρόβλεψη ζήτησης
          (είδος × μάρκα × κατηγορία, με εποχικότητα) και εναλλακτικά είδη άλλων μαρκών της ίδιας κατηγορίας και ομάδας με καλύτερα στοιχεία.
        </p>
      </div>
      <OrdersTabs tenantId={tenantId} active="brands" smart />
      {error && <DashboardErrors errors={[error]} />}

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="Μάρκες" className="rounded-xl border bg-card">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            {brands.length} μάρκες με προτάσεις · πρώτα όσες έχουν εξαντλημένα είδη τάξης Α
          </div>
          <div className="max-h-[60svh] overflow-y-auto p-1.5 lg:max-h-[calc(100svh-15rem)]">
            {brands.map((b) => {
              const active = plan?.brand.mtrmark === b.mtrmark;
              return (
                <Link
                  key={b.mtrmark}
                  href={`?brand=${b.mtrmark}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn("block rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted", active && "bg-dg-red-50/70 text-dg-red-700 dark:bg-white/5")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{b.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {b.critical > 0 && <span className="rounded-full bg-red-50 px-1.5 text-2xs font-semibold text-red-700 ring-1 ring-red-200 ring-inset">{b.critical}</span>}
                      <span className="rounded-full bg-muted px-1.5 text-2xs tabular-nums">{b.items}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-2xs text-muted-foreground">
                    <span className="tabular-nums">{eur(b.value)}</span>
                    {b.leadDays !== null && <span>· {b.leadDays} ημ.</span>}
                    <Trend v={b.quarterPct} />
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        <section className="min-w-0 space-y-3">
          {!plan ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Δεν υπάρχουν προτάσεις παραγγελίας.</div>
          ) : (
            <>
              <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-2xs text-muted-foreground">Μάρκα</div>
                  <div className="text-lg font-semibold">{plan.brand.name}</div>
                  {plan.brand.trend && (
                    <div className="flex flex-wrap gap-x-2 text-xs">
                      <span>τρίμηνο</span>
                      <Trend v={plan.brand.trend.quarterPct} />
                      <span>· έτος</span>
                      <Trend v={plan.brand.trend.yoyPct} />
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                    <Truck className="size-3" /> Προμηθευτής
                  </div>
                  <div className="text-sm font-medium">{plan.supplier.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.supplier.lead
                      ? `Παράδοση: διάμεσος ${plan.supplier.lead.median} ημ. · μέσος όρος ${num(plan.supplier.lead.avg, 1)} ημ. · ${plan.supplier.lead.deliveries} παραλαβές (24μ)`
                      : "Χωρίς μετρημένες παραλαβές — εκτίμηση 30 ημ."}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                    <PackageCheck className="size-3" /> Πρόταση
                  </div>
                  <div className="text-lg font-semibold tabular-nums">{eur(plan.value)}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.lines.length} είδη · {plan.lines.filter((l) => l.alternatives.length).length} με εναλλακτική πρόταση
                  </div>
                </div>
                <div className="flex flex-col items-start justify-between gap-2">
                  {plan.brand.trend && plan.brand.trend.peaks.length > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Αιχμή μάρκας: </span>
                      {plan.brand.trend.peaks.map((m) => MONTHS[m]).join(", ")}
                    </div>
                  )}
                  <Link
                    href={`${base}?brand=${plan.brand.mtrmark}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-sisyphus-500 px-3 text-sm font-medium text-white hover:bg-sisyphus-600"
                  >
                    <ExternalLink className="size-3.5" /> Άνοιγμα στην παραγγελία
                  </Link>
                </div>
              </div>

              <AiJudge tenantId={tenantId} mtrmark={plan.brand.mtrmark} pending={plan.pendingAi} />
              <ol className="space-y-2">
                {plan.lines.map((l) => {
                  const urgent = l.stock <= 0 || (l.stockoutDays !== null && l.stockoutDays <= (plan!.supplier.lead?.median ?? l.leadDays ?? 30));
                  return (
                    <li key={l.mtrl} className={cn("rounded-xl border bg-card p-3", urgent && "border-l-4 border-l-red-500")}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <span className="font-medium">{l.name}</span>
                            {urgent && <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Επείγον" />}
                          </div>
                          <div className="text-2xs text-muted-foreground">
                            {[l.code, l.category && `κατηγορία ${l.category}`, l.group && `ομάδα ${l.group}`, l.abc && `τάξη ${l.abc}`, l.supplier && `από ${l.supplier}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <MonthBars values={l.monthly} rising={l.trendPct !== null && l.trendPct >= 20} forecast={l.forecast} />
                            <div className="text-2xs text-muted-foreground tabular-nums">
                              απόθ. {num(l.stock, 1)} · 12μ {num(l.qty12m)} · 3μ {num(l.qty90d)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xs text-muted-foreground">Πρόταση</div>
                            <div className="text-lg font-semibold tabular-nums">{num(l.suggested)}</div>
                            {l.unitCost !== null && <div className="text-2xs text-muted-foreground tabular-nums">{eur(l.suggested * l.unitCost)}</div>}
                          </div>
                        </div>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {l.why.map((w) => (
                          <li key={w} className="flex gap-1.5">
                            <Clock className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                      {l.alternatives.length > 0 && (
                        <div className="mt-2 rounded-lg border border-dashed border-sisyphus-300 bg-sisyphus-50/40 p-2 dark:bg-white/5">
                          <div className="mb-1 flex items-center gap-1 text-2xs font-semibold text-sisyphus-700 dark:text-sisyphus-300">
                            <ArrowRightLeft className="size-3" /> Εναλλακτικά από άλλη μάρκα (ίδια κατηγορία / ομάδα, παρόμοια τιμή) · % = συμφωνία ως υποκατάστατο
                          </div>
                          <ul className="space-y-1">
                            {l.alternatives.map((a) => (
                              <li key={a.mtrl} className="text-xs">
                                <span
                                  className={cn(
                                    "mr-1.5 inline-flex rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ring-1 ring-inset",
                                    a.match >= 85 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200",
                                  )}
                                  title={`${a.matchSource === "ai" ? "Κρίση AI" : "Από τις περιγραφές"}: ${a.matchReason}`}
                                >
                                  {a.matchSource === "ai" ? "AI " : ""}
                                  {a.match}%
                                </span>
                                <span className="font-medium">{a.name}</span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {[a.brand, a.group ?? a.category, a.avgPrice !== null && `~${eur(a.avgPrice)}`, a.supplier].filter(Boolean).join(" · ")}
                                </span>
                                <div className="text-2xs text-emerald-700 dark:text-emerald-400">✓ {a.better.join(" · ")}</div>
                                {a.matchSource === "ai" && a.matchReason && <div className="text-2xs text-muted-foreground italic">AI: {a.matchReason}</div>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      </div>
    </>
  );
}
