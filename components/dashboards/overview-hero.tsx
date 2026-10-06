import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChartColumnBig,
  ClipboardList,
  FileBarChart,
  Landmark,
  Package,
  Radar,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  UserSearch,
  type LucideIcon,
} from "lucide-react";
import { eurCompact, pct } from "@/lib/format";
import type { Kpis } from "@/lib/insights";
import { cn } from "@/lib/utils";

// Home dashboard building blocks: the headline band (revenue, profit, trend), the business health
// score (0–100 from growth, margin, collections, overdue, stock, customers) and a module launcher.

const change = (now: number, prev: number) => (prev ? ((now - prev) / Math.abs(prev)) * 100 : null);
const clamp = (v: number) => Math.max(0, Math.min(100, v));
/** Linear score: `bad` → 0, `good` → 100 (either direction). */
const score = (v: number, bad: number, good: number) => clamp(((v - bad) / (good - bad)) * 100);

export type HealthAxis = { key: string; label: string; value: number; detail: string };

export function healthAxes(k: Kpis): HealthAxis[] {
  const g = change(k.revenue.now, k.revenue.prev) ?? 0;
  const c = change(k.customers.now, k.customers.prev) ?? 0;
  const overdueShare = k.receivables > 0 ? (k.overdue90 / k.receivables) * 100 : 0;
  const deadShare = k.stockValue > 0 ? (k.deadStock / k.stockValue) * 100 : 0;
  // Axes without data (e.g. no balances synced, or a Cube error) are left out, not scored as perfect.
  return [
    k.revenue.prev > 0 && { key: "growth", label: "Ανάπτυξη", value: score(g, -20, 20), detail: `τζίρος ${g >= 0 ? "+" : ""}${Math.round(g)}% έναντι πέρσι` },
    k.revenue.now > 0 && { key: "margin", label: "Κερδοφορία", value: score(k.marginPct.now, 10, 35), detail: `περιθώριο ${pct(k.marginPct.now)}` },
    k.receivables > 0 && k.dso > 0 && { key: "collect", label: "Εισπράξεις", value: score(k.dso, 120, 30), detail: `πληρώνουν σε ~${Math.round(k.dso)} ημέρες` },
    k.receivables > 0 && { key: "overdue", label: "Ληξιπρόθεσμα", value: score(overdueShare, 40, 0), detail: `${Math.round(overdueShare)}% του υπολοίπου > 90 ημ.` },
    k.stockValue > 0 && { key: "stock", label: "Απόθεμα", value: score(deadShare, 50, 0), detail: `${Math.round(deadShare)}% χωρίς κίνηση` },
    k.customers.prev > 0 && { key: "customers", label: "Πελατειακή βάση", value: score(c, -20, 15), detail: `ενεργοί πελάτες ${c >= 0 ? "+" : ""}${Math.round(c)}%` },
  ].filter((a): a is HealthAxis => Boolean(a));
}

export const healthScore = (axes: HealthAxis[]) => Math.round(axes.reduce((a, x) => a + x.value, 0) / Math.max(1, axes.length));
const scoreTone = (s: number) => (s >= 70 ? { text: "text-emerald-600", stroke: "#16a34a", label: "Καλή κατάσταση" } : s >= 45 ? { text: "text-amber-600", stroke: "#d97706", label: "Θέλει προσοχή" } : { text: "text-red-600", stroke: "#dc2626", label: "Χρειάζεται δράση" });

/** White area sparkline for the dark hero band. */
function HeroSpark({ values, previous }: { values: number[]; previous: (number | null)[] }) {
  if (values.length < 2) return null;
  const all = [...values, ...previous.filter((v): v is number => v !== null)];
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const W = 320;
  const H = 96;
  const x = (i: number, n: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * (H - 6) - 3;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i, values.length).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const prevPts = previous.map((v, i) => (v === null ? null : `${x(i, previous.length).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      {prevPts.length > 1 && <polyline points={prevPts.join(" ")} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#hero-fill)" />
      <path d={line} fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Delta({ v }: { v: number | null }) {
  if (v === null) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold", v >= 0 ? "bg-emerald-400/20 text-emerald-100" : "bg-red-950/40 text-red-100")}>
      {v >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(Math.round(v))}%
    </span>
  );
}

export function OverviewHero({
  tenantName,
  periodLabel,
  k,
  points,
  counts,
}: {
  tenantName: string;
  periodLabel: string;
  k: Kpis;
  points: { current: number; previous: number | null }[];
  counts: { bad: number; warn: number; good: number };
}) {
  const r = change(k.revenue.now, k.revenue.prev);
  const m = change(k.margin.now, k.margin.prev);
  const hour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Europe/Athens" });
  const greet = Number(hour) < 12 ? "Καλημέρα" : Number(hour) < 18 ? "Καλό απόγευμα" : "Καλησπέρα";

  return (
    <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-dg-red-600 via-dg-red-700 to-neutral-900 p-5 text-white shadow-fluent-16 sm:p-6">
      <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-dg-red-400/20 blur-3xl" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_minmax(16rem,24rem)] lg:items-end">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-white/70">
              {greet} · {tenantName}
            </p>
            <p className="text-sm text-white/80">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="text-xs tracking-wide text-white/70 uppercase">Τζίρος</div>
              <div className="flex items-center gap-2">
                <span className="text-[length:var(--fs-40)] leading-none font-bold tracking-tight tabular-nums">{eurCompact(k.revenue.now)}</span>
                <Delta v={r} />
              </div>
              <div className="mt-1 text-xs text-white/60">πέρσι {eurCompact(k.revenue.prev)}</div>
            </div>
            <div>
              <div className="text-xs tracking-wide text-white/70 uppercase">Μικτό κέρδος</div>
              <div className="flex items-center gap-2">
                <span className="text-[length:var(--fs-24)] leading-none font-semibold tabular-nums">{eurCompact(k.margin.now)}</span>
                <Delta v={m} />
              </div>
              <div className="mt-1 text-xs text-white/60">περιθώριο {pct(k.marginPct.now)}</div>
            </div>
            <div>
              <div className="text-xs tracking-wide text-white/70 uppercase">Ταμείο</div>
              <div className="text-[length:var(--fs-24)] leading-none font-semibold tabular-nums">{k.cash ? eurCompact(k.cash) : "—"}</div>
              <div className="mt-1 text-xs text-white/60">απαιτήσεις {eurCompact(k.receivables)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {counts.bad > 0 && <span className="rounded-full bg-white/15 px-2.5 py-1">● {counts.bad} θέματα προσοχής</span>}
            {counts.warn > 0 && <span className="rounded-full bg-white/15 px-2.5 py-1">● {counts.warn} προτάσεις δράσης</span>}
            {counts.good > 0 && <span className="rounded-full bg-white/15 px-2.5 py-1">● {counts.good} θετικά</span>}
          </div>
        </div>
        <div>
          <HeroSpark values={points.map((p) => p.current)} previous={points.map((p) => p.previous)} />
          <div className="mt-1 flex justify-end gap-3 text-2xs text-white/60">
            <span>— φέτος</span>
            <span>- - πέρσι</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Circular score with the six axes as bars. */
export function HealthCard({ axes }: { axes: HealthAxis[] }) {
  if (axes.length < 3) return <p className="py-8 text-center text-sm text-muted-foreground">Δεν υπάρχουν ακόμα αρκετά δεδομένα για βαθμολογία.</p>;
  const s = healthScore(axes);
  const tone = scoreTone(s);
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="relative mx-auto size-36 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" className="stroke-muted" strokeWidth="10" />
          <circle cx="60" cy="60" r={R} fill="none" stroke={tone.stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(s / 100) * C} ${C}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold tabular-nums", tone.text)}>{s}</span>
          <span className="text-2xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn("text-sm font-semibold", tone.text)}>{tone.label}</p>
        {axes.map((a) => (
          <div key={a.key} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{a.label}</span>
              <span className="truncate text-muted-foreground">{a.detail}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", a.value >= 70 ? "bg-emerald-500" : a.value >= 45 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.max(3, a.value)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MODULES: { slug: string; label: string; text: string; icon: LucideIcon; tone: string }[] = [
  { slug: "kimon", label: "Κίμων", text: "Ρωτήστε σε φυσική γλώσσα", icon: Sparkles, tone: "from-violet-500 to-fuchsia-500" },
  { slug: "pnl", label: "Αποτελέσματα", text: "Έσοδα, έξοδα, EBITDA", icon: Scale, tone: "from-sky-500 to-blue-600" },
  { slug: "sales", label: "Πωλήσεις", text: "Τάσεις, μάρκες, πωλητές", icon: ChartColumnBig, tone: "from-blue-500 to-indigo-600" },
  { slug: "profitability", label: "Κερδοφορία", text: "Από πού έρχεται το κέρδος", icon: TrendingUp, tone: "from-emerald-500 to-teal-600" },
  { slug: "customer-insights", label: "Ανάλυση πελατών", text: "CLV, cohorts, κίνδυνος", icon: UserSearch, tone: "from-teal-500 to-cyan-600" },
  { slug: "products", label: "Προϊόντα", text: "Κίνηση και προβλέψεις", icon: Package, tone: "from-amber-500 to-orange-600" },
  { slug: "stock-health", label: "Απόθεμα 360°", text: "Χαμένες πωλήσεις, νεκρό απόθεμα", icon: Radar, tone: "from-orange-500 to-red-600" },
  { slug: "orders", label: "Παραγγελίες", text: "Προτάσεις ανά μάρκα", icon: ClipboardList, tone: "from-rose-500 to-pink-600" },
  { slug: "cash", label: "Ταμειακά", text: "Ρευστότητα και ροές", icon: Landmark, tone: "from-slate-500 to-slate-700" },
  { slug: "planning", label: "Πρόβλεψη & στόχοι", text: "Κλείσιμο χρήσης, budget", icon: Target, tone: "from-indigo-500 to-violet-600" },
  { slug: "reports", label: "Αναφορές", text: "Pivot, γραφήματα, Excel", icon: FileBarChart, tone: "from-dg-red-500 to-dg-red-700" },
];

export function ModuleLauncher({ base, pages, q }: { base: string; pages: Set<string>; q: string }) {
  const items = MODULES.filter((m) => pages.has(m.slug));
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Εξερευνήστε</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {items.map((m) => (
          <Link
            key={m.slug}
            href={`${base}/${m.slug}${q ? `?${q}` : ""}`}
            className="group relative flex min-h-24 flex-col justify-between overflow-hidden rounded-xl border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-fluent-8"
          >
            <span className={cn("flex size-9 items-center justify-center rounded-lg bg-linear-to-br text-white shadow-sm", m.tone)}>
              <m.icon className="size-4.5" />
            </span>
            <span>
              <span className="flex items-center gap-1 text-sm font-semibold">
                {m.label}
                <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="block text-2xs text-muted-foreground">{m.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
