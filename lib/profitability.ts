import "server-only";
import type { Client } from "pg";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";

// Profitability: why gross profit changed vs the same period last year (volume, mix, selling prices,
// purchase costs, new and lost items), and how much is given away below the list price (discount
// leakage) or sold below cost — by customer, category and brand.
//
// Bridge per item continuing in both periods (q > 0), with unit price p, unit cost c, unit margin u:
//   Σq1u1 − Σq0u0 = Σ(q1−q0)u0  [volume + mix]  + Σq1(p1−p0)  [prices]  − Σq1(c1−c0)  [costs]
//   volume = (Σq1p0 ÷ Σq0p0 − 1) × Σq0u0 ; mix = the rest of Σ(q1−q0)u0.

const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
const eur = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;

export type BridgeStep = { name: string; value: number; total?: boolean };
export type Driver = { code: string | null; name: string; brand: string | null; effect: number; detail: string };
export type LeakRow = { name: string; list: number; actual: number; leak: number; leakPct: number; belowCost: number };
export type ProfitFinding = { level: "risk" | "warning" | "opportunity" | "info"; title: string; detail: string };

export type Profitability = {
  period: { from: string; to: string; prevFrom: string; prevTo: string };
  margin: number;
  marginPrev: number;
  revenue: number;
  revenuePrev: number;
  marginPct: number | null;
  marginPctPrev: number | null;
  steps: BridgeStep[];
  priceUp: Driver[];
  priceDown: Driver[];
  costNotPassed: Driver[];
  leak: { available: boolean; coveragePct: number; list: number; actual: number; leak: number; leakPct: number; belowCost: number; belowCostLines: number };
  leakByCustomer: LeakRow[];
  leakByCategory: LeakRow[];
  leakByBrand: LeakRow[];
  findings: ProfitFinding[];
};

const has = async (db: Client, s: string, t: string) => !!(await db.query("SELECT to_regclass($1) AS t", [`${s}.${t}`])).rows[0]?.t;
const col = async (db: Client, schema: string, t: string, c: string) =>
  !!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3", [schema, t, c])).rowCount;

export async function profitability(tenantId: string): Promise<Profitability> {
  const schema = schemaName(tenantId);
  const s = qi(schema);
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = `${now.getFullYear()}-01-01`;
  const to = iso(new Date(now.getTime() + 86_400_000)); // exclusive (today included)
  const prevFrom = `${now.getFullYear() - 1}-01-01`;
  const prevTo = iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1));

  return withWarehouse(async (db) => {
    const brands = await has(db, s, "brands");
    const cats = await has(db, s, "item_categories");

    // ── Per item, both periods.
    const r = await db.query(
      `SELECT f.mtrl, i.code, i.name, ${brands ? "b.name" : "NULL"} AS brand,
              SUM(CASE WHEN f.trndate >= $1 AND f.trndate < $2 THEN f.qty ELSE 0 END)::float AS q1,
              SUM(CASE WHEN f.trndate >= $1 AND f.trndate < $2 THEN f.net ELSE 0 END)::float AS r1,
              SUM(CASE WHEN f.trndate >= $1 AND f.trndate < $2 THEN COALESCE(f.cost, 0) ELSE 0 END)::float AS c1,
              SUM(CASE WHEN f.trndate >= $3 AND f.trndate < $4 THEN f.qty ELSE 0 END)::float AS q0,
              SUM(CASE WHEN f.trndate >= $3 AND f.trndate < $4 THEN f.net ELSE 0 END)::float AS r0,
              SUM(CASE WHEN f.trndate >= $3 AND f.trndate < $4 THEN COALESCE(f.cost, 0) ELSE 0 END)::float AS c0
       FROM ${s}.f_sales_lines f LEFT JOIN ${s}.items i ON i.mtrl = f.mtrl
       ${brands ? `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark` : ""}
       WHERE (f.trndate >= $1 AND f.trndate < $2) OR (f.trndate >= $3 AND f.trndate < $4)
       GROUP BY 1, 2, 3, 4`,
      [from, to, prevFrom, prevTo],
    );
    let margin = 0;
    let marginPrev = 0;
    let revenue = 0;
    let revenuePrev = 0;
    let volMix = 0;
    let price = 0;
    let cost = 0;
    let newItems = 0;
    let lostItems = 0;
    let other = 0;
    let atOldPrices = 0;
    let revContPrev = 0;
    let marginContPrev = 0;
    const drivers: { code: string | null; name: string; brand: string | null; price: number; cost: number; dp: number; dc: number; p0: number; c0: number }[] = [];
    for (const x of r.rows) {
      const [q1, r1, c1, q0, r0, c0] = [x.q1, x.r1, x.c1, x.q0, x.r0, x.c0].map(Number);
      margin += r1 - c1;
      marginPrev += r0 - c0;
      revenue += r1;
      revenuePrev += r0;
      const m1 = r1 - c1;
      const m0 = r0 - c0;
      const p0 = q0 > 0 ? r0 / q0 : 0;
      const p1 = q1 > 0 ? r1 / q1 : 0;
      const uc0 = q0 > 0 ? c0 / q0 : 0;
      const uc1 = q1 > 0 ? c1 / q1 : 0;
      const sane = (a: number, b: number) => a > 0 && b > 0 && b / a >= 0.2 && b / a <= 5;
      // Continuing items with believable unit prices / costs go through the bridge; value-only credit
      // notes, returns and cost errors (0,01 € → 50 €) are kept apart so the bridge always adds up.
      if (q1 > 0 && q0 > 0 && sane(p0, p1) && (c0 === 0 || c1 === 0 || sane(uc0, uc1))) {
        const u0 = p0 - uc0;
        volMix += (q1 - q0) * u0;
        price += q1 * (p1 - p0);
        cost -= q1 * (uc1 - uc0);
        atOldPrices += q1 * p0;
        revContPrev += r0;
        marginContPrev += m0;
        if (uc0 > 0 && uc1 > 0)
          drivers.push({ code: x.code ?? null, name: x.name ?? `Είδος ${x.mtrl}`, brand: x.brand ?? null, price: q1 * (p1 - p0), cost: -q1 * (uc1 - uc0), dp: (p1 - p0) / p0, dc: (uc1 - uc0) / uc0, p0, c0: uc0 });
      } else if (q1 > 0 && q0 <= 0 && r0 === 0) newItems += m1;
      else if (q0 > 0 && q1 <= 0 && r1 === 0) lostItems += m1 - m0;
      else other += m1 - m0;
    }
    const volume = revContPrev > 0 ? (atOldPrices / revContPrev - 1) * marginContPrev : 0;
    const mix = volMix - volume;
    const steps: BridgeStep[] = [
      { name: `Κέρδος ${now.getFullYear() - 1}`, value: marginPrev, total: true },
      { name: "Όγκος", value: volume },
      { name: "Μίγμα", value: mix },
      { name: "Τιμές πώλησης", value: price },
      { name: "Κόστος αγοράς", value: cost },
      { name: "Νέα είδη", value: newItems },
      { name: "Είδη που χάθηκαν", value: lostItems },
      ...(Math.abs(other) >= 1 ? [{ name: "Λοιπά*", value: other }] : []),
      { name: `Κέρδος ${now.getFullYear()}`, value: margin, total: true },
    ];

    const sig = (d: (typeof drivers)[number], what: "price" | "cost") =>
      what === "price"
        ? `τιμή ${d.p0.toLocaleString("el-GR", { maximumFractionDigits: 2 })} € → ${pctTxt(d.dp * 100)}`
        : `κόστος ${d.c0.toLocaleString("el-GR", { maximumFractionDigits: 2 })} € ${pctTxt(d.dc * 100)}, τιμή ${pctTxt(d.dp * 100)}`;
    const priceUp = drivers.filter((d) => d.price > 0).sort((a, b) => b.price - a.price).slice(0, 8).map((d) => ({ code: d.code, name: d.name, brand: d.brand, effect: d.price, detail: sig(d, "price") }));
    const priceDown = drivers.filter((d) => d.price < 0).sort((a, b) => a.price - b.price).slice(0, 8).map((d) => ({ code: d.code, name: d.name, brand: d.brand, effect: d.price, detail: sig(d, "price") }));
    // Purchase cost went up more than the selling price.
    const costNotPassed = drivers
      .filter((d) => d.dc > 0.02 && d.dp < d.dc && d.cost + d.price < 0)
      .sort((a, b) => a.cost + a.price - (b.cost + b.price))
      .slice(0, 10)
      .map((d) => ({ code: d.code, name: d.name, brand: d.brand, effect: d.cost + d.price, detail: sig(d, "cost") }));

    // ── Discount leakage vs the wholesale list price, and sales below cost (this period).
    const hasList = await col(db, schema, "items", "pricew");
    const leakQuery = async (groupExpr: string, join: string, nameExpr: string, limit: number): Promise<LeakRow[]> => {
      const q = await db.query(
        `SELECT ${groupExpr} AS g, ${nameExpr} AS name,
                SUM(f.qty * i.pricew)::float AS list, SUM(f.net)::float AS actual,
                SUM(GREATEST(0, f.qty * i.pricew - f.net))::float AS leak,
                SUM(CASE WHEN f.cost IS NOT NULL AND f.net < f.cost THEN f.cost - f.net ELSE 0 END)::float AS below
         FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl ${join}
         WHERE f.trndate >= $1 AND f.trndate < $2 AND f.qty > 0 AND i.pricew > 0
         GROUP BY 1 HAVING SUM(GREATEST(0, f.qty * i.pricew - f.net)) > 0
         ORDER BY 5 DESC LIMIT ${limit}`,
        [from, to],
      );
      return q.rows.map((x) => ({
        name: x.name ?? "—",
        list: Number(x.list),
        actual: Number(x.actual),
        leak: Number(x.leak),
        leakPct: Number(x.list) > 0 ? (100 * Number(x.leak)) / Number(x.list) : 0,
        belowCost: Number(x.below),
      }));
    };
    let leak: Profitability["leak"] = { available: false, coveragePct: 0, list: 0, actual: 0, leak: 0, leakPct: 0, belowCost: 0, belowCostLines: 0 };
    let leakByCustomer: LeakRow[] = [];
    let leakByCategory: LeakRow[] = [];
    let leakByBrand: LeakRow[] = [];
    const below = (
      await db.query(
        `SELECT COALESCE(SUM(cost - net), 0)::float AS v, COUNT(*)::int AS n FROM ${s}.f_sales_lines
         WHERE trndate >= $1 AND trndate < $2 AND qty > 0 AND cost IS NOT NULL AND net < cost`,
        [from, to],
      )
    ).rows[0];
    if (hasList) {
      const t = (
        await db.query(
          `SELECT SUM(f.net) FILTER (WHERE i.pricew > 0)::float AS covered, SUM(f.net)::float AS total,
                  SUM(f.qty * i.pricew) FILTER (WHERE i.pricew > 0)::float AS list,
                  SUM(GREATEST(0, f.qty * i.pricew - f.net)) FILTER (WHERE i.pricew > 0)::float AS leak
           FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl
           WHERE f.trndate >= $1 AND f.trndate < $2 AND f.qty > 0`,
          [from, to],
        )
      ).rows[0];
      const coveragePct = Number(t.total) > 0 ? (100 * Number(t.covered ?? 0)) / Number(t.total) : 0;
      if (coveragePct >= 30) {
        leak = {
          available: true,
          coveragePct,
          list: Number(t.list ?? 0),
          actual: Number(t.covered ?? 0),
          leak: Number(t.leak ?? 0),
          leakPct: Number(t.list) > 0 ? (100 * Number(t.leak ?? 0)) / Number(t.list) : 0,
          belowCost: Number(below.v),
          belowCostLines: Number(below.n),
        };
        leakByCustomer = await leakQuery("f.trdr", `LEFT JOIN ${s}.customers cu ON cu.trdr = f.trdr`, "MAX(cu.name)", 12);
        if (cats) leakByCategory = await leakQuery("i.mtrcategory", `LEFT JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory`, "MAX(c.name)", 12);
        if (brands) leakByBrand = await leakQuery("i.mtrmark", `LEFT JOIN ${s}.brands b ON b.mtrmark = i.mtrmark`, "MAX(b.name)", 12);
      }
    }
    if (!leak.available) leak = { ...leak, belowCost: Number(below.v), belowCostLines: Number(below.n) };

    // ── Findings.
    const findings: ProfitFinding[] = [];
    const delta = margin - marginPrev;
    const parts = steps.filter((x) => !x.total).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    if (marginPrev !== 0)
      findings.push({
        level: delta >= 0 ? "opportunity" : "warning",
        title: `Μικτό κέρδος ${delta >= 0 ? "+" : "−"}${eur(Math.abs(delta))} έναντι πέρσι (${pctTxt((delta / Math.abs(marginPrev)) * 100)})`,
        detail: `Κυριότερες αιτίες: ${parts
          .slice(0, 3)
          .map((x) => `${x.name.toLowerCase()} ${x.value >= 0 ? "+" : "−"}${eur(Math.abs(x.value))}`)
          .join(", ")}.`,
      });
    if (cost < 0 && price < -cost * 0.8)
      findings.push({
        level: "risk",
        title: `Αυξήσεις κόστους ${eur(-cost)} — μετακυλίστηκαν μόνο ${eur(Math.max(0, price))}`,
        detail: `Οι τιμές αγοράς στα ίδια είδη αυξήθηκαν περισσότερο από τις τιμές πώλησης.${costNotPassed[0] ? ` Μεγαλύτερη επίπτωση: ${costNotPassed[0].name}.` : ""}`,
      });
    if (mix < 0 && Math.abs(mix) > Math.abs(delta) * 0.3)
      findings.push({
        level: "warning",
        title: `Το μίγμα πωλήσεων κόστισε ${eur(-mix)}`,
        detail: "Πουλήθηκαν αναλογικά περισσότερα είδη χαμηλού περιθωρίου — ελέγξτε την προώθηση των κερδοφόρων ειδών.",
      });
    if (leak.available && leak.leak > 0)
      findings.push({
        level: leak.leakPct > 30 ? "warning" : "info",
        title: `Εκπτώσεις ${eur(leak.leak)} από την τιμή καταλόγου (${Math.round(leak.leakPct)}%)`,
        detail: `${leakByCustomer[0] ? `Μεγαλύτερη: ${leakByCustomer[0].name} (${eur(leakByCustomer[0].leak)}, ${Math.round(leakByCustomer[0].leakPct)}%). ` : ""}Μείωση της μέσης έκπτωσης κατά 1 μονάδα = ~${eur(leak.list / 100)}.`,
      });
    if (leak.belowCost > 0)
      findings.push({
        level: leak.belowCost > Math.abs(margin) * 0.02 ? "risk" : "info",
        title: `Πωλήσεις κάτω του κόστους: ${eur(leak.belowCost)} ζημία σε ${leak.belowCostLines} γραμμές`,
        detail: "Ή πωλήθηκαν πράγματι με ζημία, ή το κόστος του είδους στο SoftOne δεν είναι σωστό.",
      });

    return {
      period: { from, to, prevFrom, prevTo },
      margin,
      marginPrev,
      revenue,
      revenuePrev,
      marginPct: revenue > 0 ? (100 * margin) / revenue : null,
      marginPctPrev: revenuePrev > 0 ? (100 * marginPrev) / revenuePrev : null,
      steps,
      priceUp,
      priceDown,
      costNotPassed,
      leak,
      leakByCustomer,
      leakByCategory,
      leakByBrand,
      findings,
    };
  });
}
