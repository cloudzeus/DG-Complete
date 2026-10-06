import "server-only";
import { memo, MEMO_TTL } from "@/lib/memo";
import { schemaName } from "@/lib/warehouse";
import { withWarehouse } from "@/lib/warehouse-writer";
import { mad, median, qi, quantile, robustZ, round } from "@/lib/smart/mining";

// Έξυπνες ειδοποιήσεις — anomaly detection against each series' own normal (robust z-scores:
// median / MAD of its history, so one bad week doesn't hide the next):
// - category revenue and margin: the last 4 weeks vs the 26 weeks before;
// - customers who stopped: well past their own purchase rhythm (> 2× their usual interval);
// - unusual prices: lines of the last 30 days far from the item's usual net price (wrong price or discount);
// - big customers buying much less than their own normal (last 8 weeks vs the year);
// - users (who enter the documents) giving much higher discounts than usual.

export type Anomaly = {
  id: string;
  kind: "category_drop" | "category_jump" | "margin_drop" | "customer_stopped" | "customer_drop" | "price" | "user_discount";
  severity: "high" | "medium" | "low";
  area: string;
  title: string;
  detail: string;
  impact: number;
  z: number | null;
  href?: string;
};
export type Anomalies = { items: Anomaly[]; counts: { high: number; medium: number; low: number }; weekly: { week: string; revenue: number; expected: number; low: number; high: number }[] };

const n = (v: unknown) => Number(v ?? 0) || 0;
const fmt = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;
const sev = (z: number, impact: number): Anomaly["severity"] => (Math.abs(z) >= 4 && impact >= 5000 ? "high" : Math.abs(z) >= 3 || impact >= 5000 ? "medium" : "low");

async function compute(tenantId: string): Promise<Anomalies> {
  const s = qi(schemaName(tenantId));
  return withWarehouse(async (db) => {
    const out: Anomaly[] = [];
    const catJoin = (await db.query("SELECT to_regclass($1) AS t", [`${s}.item_categories`])).rows[0]?.t ? `LEFT JOIN ${s}.item_categories c ON c.mtrcategory = i.mtrcategory` : "";

    // ── Weekly revenue/margin per category (30 weeks; the current, incomplete week excluded).
    const wk = (
      await db.query(
        `SELECT ${catJoin ? "COALESCE(c.name, 'Χωρίς κατηγορία')" : "'Σύνολο'"} AS cat, date_trunc('week', f.trndate) AS w,
                SUM(f.net)::float AS rev, SUM(f.net - f.cost) FILTER (WHERE f.cost IS NOT NULL)::float AS margin, SUM(f.net) FILTER (WHERE f.cost IS NOT NULL)::float AS costed
         FROM ${s}.f_sales_lines f JOIN ${s}.items i ON i.mtrl = f.mtrl ${catJoin}
         WHERE f.trndate >= date_trunc('week', now()) - interval '30 weeks' AND f.trndate < date_trunc('week', now())
         GROUP BY 1, 2`,
      )
    ).rows;
    const weeksAll = [...new Set(wk.map((r) => new Date(r.w as string).toISOString().slice(0, 10)))].sort();
    const lastWeeks = weeksAll.slice(-4);
    const histWeeks = weeksAll.slice(0, -4);
    const byCat = new Map<string, Map<string, { rev: number; margin: number; costed: number }>>();
    for (const r of wk) {
      const m = byCat.get(String(r.cat)) ?? new Map();
      m.set(new Date(r.w as string).toISOString().slice(0, 10), { rev: n(r.rev), margin: n(r.margin), costed: n(r.costed) });
      byCat.set(String(r.cat), m);
    }
    for (const [cat, m] of byCat) {
      const hist = histWeeks.map((w) => m.get(w)?.rev ?? 0);
      if (median(hist) < 500) continue;
      const recent = lastWeeks.map((w) => m.get(w)?.rev ?? 0);
      const avgRecent = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
      // z of the 4-week average: the MAD of an average of 4 is about half a week's.
      const z = robustZ(avgRecent, hist) * 2;
      const impact = Math.abs(avgRecent - median(hist)) * recent.length;
      if (Math.abs(z) >= 2.5 && impact >= 1000) {
        const down = z < 0;
        out.push({
          id: `cat-${down ? "d" : "u"}-${cat}`,
          kind: down ? "category_drop" : "category_jump",
          severity: down ? sev(z, impact) : "low",
          area: "Πωλήσεις",
          title: `${cat}: ${down ? "πτώση" : "άνοδος"} ${Math.abs(Math.round((avgRecent / median(hist) - 1) * 100))}% τις τελευταίες 4 εβδομάδες`,
          detail: `Μέσος όρος ${fmt(avgRecent)}/εβδομάδα έναντι συνηθισμένου ${fmt(median(hist))} (εύρος ${fmt(Math.max(0, median(hist) - 2 * mad(hist)))}–${fmt(median(hist) + 2 * mad(hist))}).`,
          impact: round(impact),
          z: round(z, 1),
          href: "sales",
        });
      }
      // Margin: weighted margin % of the last 4 weeks vs the weekly margins before.
      const histPct = histWeeks.map((w) => m.get(w)).filter((x) => x && x.costed > 200).map((x) => (x!.margin / x!.costed) * 100);
      const rc = lastWeeks.map((w) => m.get(w)).filter(Boolean) as { margin: number; costed: number }[];
      const costed = rc.reduce((a, x) => a + x.costed, 0);
      if (histPct.length >= 8 && costed > 1000) {
        const pct = (rc.reduce((a, x) => a + x.margin, 0) / costed) * 100;
        const zm = robustZ(pct, histPct) * 2;
        const impact2 = ((median(histPct) - pct) / 100) * costed;
        if (zm <= -2.5 && impact2 >= 500) {
          out.push({
            id: `mrg-${cat}`,
            kind: "margin_drop",
            severity: sev(zm, impact2),
            area: "Κερδοφορία",
            title: `${cat}: το περιθώριο έπεσε στο ${round(pct, 1)}% (συνήθως ${round(median(histPct), 1)}%)`,
            detail: `Οι τελευταίες 4 εβδομάδες άφησαν περίπου ${fmt(impact2)} λιγότερο μικτό κέρδος από το συνηθισμένο — έλεγχος εκπτώσεων ή αύξησης κόστους.`,
            impact: round(impact2),
            z: round(zm, 1),
            href: "profitability",
          });
        }
      }
    }

    // Company weekly revenue with the expected band (for the chart).
    const total = weeksAll.map((w) => [...byCat.values()].reduce((a, m) => a + (m.get(w)?.rev ?? 0), 0));
    const hist = total.slice(0, -4);
    const med = median(hist);
    const band = 2 * mad(hist);
    const weekly = weeksAll.map((w, i) => ({ week: w, revenue: round(total[i]), expected: round(med), low: round(Math.max(0, med - band)), high: round(med + band) }));

    // ── Customers who stopped (past 2× their own rhythm) and big customers buying much less.
    const cust = (
      await db.query(
        `SELECT cs.trdr, c.name, cs.recency_days::float AS rec, cs.avg_days_between_purchases::float AS gap, cs.invoices_12m::float AS inv,
                cs.revenue_12m::float AS r12, cs.revenue_prev_12m::float AS rp, cs.revenue_90d::float AS r90
         FROM ${s}.m_customer_stats cs JOIN ${s}.customers c ON c.trdr = cs.trdr
         WHERE cs.revenue_12m + cs.revenue_prev_12m > 0`,
      )
    ).rows;
    // Only customers that matter: the top 25% by yearly revenue (stopped) / top 10% (decline).
    const yearlyAll = cust.map((c) => Math.max(n(c.r12), n(c.rp))).filter((v) => v > 0);
    const big = quantile(yearlyAll, 0.75);
    const top = quantile(yearlyAll, 0.9);
    for (const c of cust) {
      const gap = n(c.gap);
      const yearly = Math.max(n(c.r12), n(c.rp));
      if (gap > 0 && n(c.inv) >= 6 && n(c.rec) > Math.max(30, 2 * gap) && n(c.rec) < 365 && yearly >= big) {
        out.push({
          id: `stop-${c.trdr}`,
          kind: "customer_stopped",
          severity: sev(-(n(c.rec) / gap), yearly / 4),
          area: "Πελάτες",
          title: `${c.name}: δεν έχει αγοράσει εδώ και ${Math.round(n(c.rec))} ημέρες`,
          detail: `Αγοράζει συνήθως κάθε ${Math.round(gap)} ημέρες· τζίρος 12 μηνών ${fmt(n(c.r12))}. Ίσως αγοράζει από αλλού — επικοινωνία.`,
          impact: round(yearly / 4),
          z: round(-(n(c.rec) / gap), 1),
          href: `customers/${c.trdr}`,
        });
      } else if (n(c.r12) >= top && n(c.r90) < (n(c.r12) / 4) * 0.5 && n(c.rec) <= Math.max(30, 2 * gap) && n(c.r12) / 4 - n(c.r90) >= 2000) {
        const lost = n(c.r12) / 4 - n(c.r90);
        out.push({
          id: `drop-${c.trdr}`,
          kind: "customer_drop",
          severity: lost >= 10000 ? "high" : "medium",
          area: "Πελάτες",
          title: `${c.name}: αγόρασε ${Math.round((1 - n(c.r90) / (n(c.r12) / 4)) * 100)}% λιγότερα το τελευταίο τρίμηνο`,
          detail: `${fmt(n(c.r90))} στις 90 ημέρες έναντι ${fmt(n(c.r12) / 4)} που αντιστοιχεί στον μέσο όρο του έτους.`,
          impact: round(lost),
          z: null,
          href: `customers/${c.trdr}`,
        });
      }
    }

    // ── Unusual net prices (last 30 days) vs the item's 12-month history.
    const lines = (
      await db.query(
        `WITH hist AS (
           SELECT mtrl, percentile_cont(0.5) WITHIN GROUP (ORDER BY net / qty) AS med
           FROM ${s}.f_sales_lines WHERE sign = 1 AND qty > 0 AND net > 0 AND trndate >= now() - interval '12 months' AND trndate < now() - interval '30 days'
           GROUP BY 1 HAVING COUNT(*) >= 8
         )
         SELECT f.findoc, f.mtrl, i.name AS item, c.name AS customer, f.trndate, f.qty::float, f.net::float, h.med::float, f.cost::float
         FROM ${s}.f_sales_lines f JOIN hist h ON h.mtrl = f.mtrl JOIN ${s}.items i ON i.mtrl = f.mtrl LEFT JOIN ${s}.customers c ON c.trdr = f.trdr
         WHERE f.sign = 1 AND f.qty > 0 AND f.net > 0 AND f.trndate >= now() - interval '30 days' AND (f.net / f.qty < h.med * 0.6)`,
      )
    ).rows;
    for (const l of lines) {
      const unit = n(l.net) / n(l.qty);
      const loss = (n(l.med) - unit) * n(l.qty);
      if (loss < 100) continue;
      const below = l.cost !== null && n(l.cost) > n(l.net);
      out.push({
        id: `price-${l.findoc}-${l.mtrl}`,
        kind: "price",
        severity: below && loss >= 500 ? "high" : below || loss >= 500 ? "medium" : "low",
        area: "Τιμές",
        title: `${l.item}: πουλήθηκε ${Math.round((1 - unit / n(l.med)) * 100)}% κάτω από τη συνηθισμένη τιμή${below ? " — κάτω από το κόστος" : ""}`,
        detail: `${new Date(l.trndate as string).toLocaleDateString("el-GR")} σε ${l.customer ?? "πελάτη"}: ${n(l.qty)} τεμ. × ${unit.toFixed(2)} € (συνήθως ${n(l.med).toFixed(2)} €). Λάθος τιμή ή έκπτωση;`,
        impact: round(loss),
        z: null,
      });
    }

    // ── Users giving unusual discounts (last 30 days vs their own 12 months).
    const hasUser = (await db.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'f_sales_lines' AND column_name = 'insuser'`, [schemaName(tenantId)])).rowCount;
    if (hasUser) {
      const users = (
        await db.query(
          `SELECT f.insuser, ${(await db.query("SELECT to_regclass($1) AS t", [`${s}.s1_users`])).rows[0]?.t ? `(SELECT name FROM ${s}.s1_users u WHERE u.users = f.insuser)` : "NULL"} AS name,
                  SUM(GREATEST(sl.price * sl.qty1, f.net)) FILTER (WHERE f.trndate >= now() - interval '30 days')::float AS g30,
                  SUM(f.net) FILTER (WHERE f.trndate >= now() - interval '30 days')::float AS n30,
                  SUM(GREATEST(sl.price * sl.qty1, f.net)) FILTER (WHERE f.trndate < now() - interval '30 days')::float AS g12,
                  SUM(f.net) FILTER (WHERE f.trndate < now() - interval '30 days')::float AS n12
           FROM ${s}.f_sales_lines f JOIN ${s}.sales_lines sl ON sl.findoc = f.findoc AND sl.mtrlines = f.mtrlines
           WHERE f.sign = 1 AND f.net > 0 AND sl.price > 0 AND f.insuser IS NOT NULL AND f.trndate >= now() - interval '12 months'
           GROUP BY 1, 2`,
        )
      ).rows;
      for (const u of users) {
        if (n(u.g30) < 5000 || n(u.g12) < 20000) continue;
        const d30 = (1 - n(u.n30) / n(u.g30)) * 100;
        const d12 = (1 - n(u.n12) / n(u.g12)) * 100;
        const extra = ((d30 - d12) / 100) * n(u.g30);
        if (d30 - d12 >= 5 && extra >= 1000) {
          out.push({
            id: `user-${u.insuser}`,
            kind: "user_discount",
            severity: extra >= 5000 ? "high" : "medium",
            area: "Εκπτώσεις",
            title: `${u.name ?? `Χρήστης ${u.insuser}`}: εκπτώσεις ${round(d30, 1)}% τον τελευταίο μήνα (συνήθως ${round(d12, 1)}%)`,
            detail: `Περίπου ${fmt(extra)} περισσότερη έκπτωση από τη συνήθειά του σε ${fmt(n(u.g30))} αξία τιμοκαταλόγου.`,
            impact: round(extra),
            z: null,
            href: "salespeople",
          });
        }
      }
    }

    const rank = { high: 0, medium: 1, low: 2 };
    out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.impact - a.impact);
    // At most 25 of each kind (the biggest), so one kind doesn't drown the rest.
    const perKind = new Map<string, number>();
    const items = out.filter((x) => {
      const k = (perKind.get(x.kind) ?? 0) + 1;
      perKind.set(x.kind, k);
      return k <= 25;
    });
    return {
      items,
      counts: { high: items.filter((x) => x.severity === "high").length, medium: items.filter((x) => x.severity === "medium").length, low: items.filter((x) => x.severity === "low").length },
      weekly,
    };
  });
}

export function anomalies(tenantId: string) {
  return memo(`anomalies:${tenantId}`, MEMO_TTL, () => compute(tenantId));
}
