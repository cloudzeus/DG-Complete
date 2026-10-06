import "server-only";
import { cubeLoadAll, num, type CubeQuery, type CubeRow } from "@/lib/cube-client";
import { eurCompact, eurFull, pct } from "@/lib/format";
import type { Period } from "@/lib/period";

// Automatic business findings for the overview: each rule reads the Cube model, decides whether
// it is worth saying, and phrases it as finding + suggested action. Rules degrade independently.

export type Severity = "good" | "info" | "warn" | "bad";
export type Insight = {
  id: string;
  severity: Severity;
  area: "Πωλήσεις" | "Κερδοφορία" | "Πελάτες" | "Εισπράξεις" | "Αποθήκη" | "Προμηθευτές" | "Ταμειακά";
  title: string;
  detail: string;
  action?: string;
  /** Dashboard slug under /dashboards/[tenant]/… */
  href?: string;
  /** Sort weight — bigger first within the same severity. */
  weight: number;
};

const range = (from: string, to: string): [string, string] => [from, to];
const listNames = (rows: CubeRow[], key: string, value?: (r: CubeRow) => string) =>
  rows
    .slice(0, 3)
    .map((r) => `${String(r[key] ?? "—").trim()}${value ? ` (${value(r)})` : ""}`)
    .join(", ");

export async function buildInsights(tenantId: string, p: Period): Promise<{ insights: Insight[]; errors: string[]; kpis: Kpis }> {
  const cur = range(p.from, p.to);
  const prev = range(p.prevFrom, p.prevTo);
  const SL = (m: string) => `sales_lines.${m}`;
  const td = (r: [string, string]) => [{ dimension: SL("date"), dateRange: r }];

  const queries: Record<string, CubeQuery> = {
    salesNow: { measures: [SL("revenue"), SL("margin"), SL("margin_pct"), SL("documents"), SL("customers")], timeDimensions: td(cur) },
    salesPrev: { measures: [SL("revenue"), SL("margin"), SL("margin_pct"), SL("documents"), SL("customers")], timeDimensions: td(prev) },
    catNow: { measures: [SL("revenue"), SL("margin_pct")], dimensions: [SL("category")], timeDimensions: td(cur) },
    catPrev: { measures: [SL("revenue")], dimensions: [SL("category")], timeDimensions: td(prev) },
    churn: {
      measures: ["customers.count", "customers.revenue_prev_12m"],
      filters: [{ member: "customers.churn_risk", operator: "equals", values: ["Υψηλός"] }],
    },
    churnTop: {
      dimensions: ["customers.customer_name", "customers.revenue_prev", "customers.recency_days"],
      filters: [{ member: "customers.churn_risk", operator: "equals", values: ["Υψηλός"] }],
      order: { "customers.revenue_prev": "desc" },
      limit: 3,
    },
    receivables: { measures: ["customers.balance", "customers.overdue_90", "customers.overdue_61_90", "customers.dso"] },
    debtors: {
      dimensions: ["customers.customer_name", "customers.overdue_90_amount", "customers.payment_grade"],
      filters: [{ member: "customers.overdue_90_amount", operator: "gt", values: ["0"] }],
      order: { "customers.overdue_90_amount": "desc" },
      limit: 3,
    },
    stock: { measures: ["items.stock_value", "items.dead_stock_value", "items.dead_stock_items", "items.items_to_order", "items.suggested_order_value"] },
    urgent: {
      dimensions: ["items.item_name", "items.days_of_cover", "items.order_qty"],
      filters: [
        { member: "items.abc", operator: "equals", values: ["A"] },
        { member: "items.order_qty", operator: "gt", values: ["0"] },
      ],
      order: { "items.days_of_cover": "asc" },
      limit: 3,
    },
    urgentCount: {
      measures: ["items.count", "items.suggested_order_value"],
      filters: [
        { member: "items.abc", operator: "equals", values: ["A"] },
        { member: "items.order_qty", operator: "gt", values: ["0"] },
      ],
    },
    lowMargin: {
      dimensions: ["items.item_name", "items.margin_percent", "items.revenue"],
      filters: [
        { member: "items.abc", operator: "equals", values: ["A", "B"] },
        { member: "items.margin_percent", operator: "lt", values: ["8"] },
      ],
      order: { "items.revenue": "desc" },
      limit: 3,
    },
    lowMarginCount: {
      measures: ["items.count", "items.revenue_12m"],
      filters: [
        { member: "items.abc", operator: "equals", values: ["A", "B"] },
        { member: "items.margin_percent", operator: "lt", values: ["8"] },
      ],
    },
    priceUp: {
      dimensions: ["suppliers.supplier_name", "suppliers.price_change", "suppliers.spend"],
      filters: [
        { member: "suppliers.price_change", operator: "gt", values: ["5"] },
        { member: "suppliers.spend", operator: "gt", values: ["5000"] },
      ],
      order: { "suppliers.spend": "desc" },
      limit: 3,
    },
    lead: {
      dimensions: ["suppliers.supplier_name", "suppliers.lead_days_p90", "suppliers.spend"],
      filters: [
        { member: "suppliers.lead_days_p90", operator: "gt", values: ["30"] },
        { member: "suppliers.spend", operator: "gt", values: ["10000"] },
      ],
      order: { "suppliers.spend": "desc" },
      limit: 3,
    },
    forecast: { measures: ["cash_forecast.inflow", "cash_forecast.outflow", "cash_forecast.net"], dimensions: ["cash_forecast.week"], order: { "cash_forecast.week": "asc" } },
    cash: { measures: ["cash.balance"], dimensions: ["cash.month"], order: { "cash.month": "desc" }, limit: 1 },
    topCustomers: { dimensions: ["customers.customer_name", "customers.revenue"], order: { "customers.revenue": "desc" }, limit: 10 },
    allCustomers: { measures: ["customers.revenue_12m"] },
  };
  const { data: d, errors } = await cubeLoadAll(tenantId, queries);
  const out: Insight[] = [];
  const v = (rows: CubeRow[], m: string) => num(rows[0]?.[m]);

  // ── Sales momentum + biggest category move
  const revNow = v(d.salesNow, SL("revenue"));
  const revPrev = v(d.salesPrev, SL("revenue"));
  if (revPrev > 0 && revNow > 0) {
    const ch = (100 * (revNow - revPrev)) / revPrev;
    const prevByCat = new Map(d.catPrev.map((r) => [String(r[SL("category")]), num(r[SL("revenue")])]));
    const moves = d.catNow
      .map((r) => ({ name: String(r[SL("category")]), diff: num(r[SL("revenue")]) - (prevByCat.get(String(r[SL("category")])) ?? 0) }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const driver = moves[0];
    out.push({
      id: "sales-momentum",
      area: "Πωλήσεις",
      severity: ch >= 3 ? "good" : ch <= -3 ? "bad" : "info",
      title: `Τζίρος ${eurCompact(revNow)} — ${ch >= 0 ? "+" : ""}${pct(ch)} έναντι πέρσι`,
      detail: driver
        ? `Η μεγαλύτερη μεταβολή προέρχεται από «${driver.name}» (${driver.diff >= 0 ? "+" : ""}${eurCompact(driver.diff)}).`
        : `Ίδια περίοδος πέρσι: ${eurCompact(revPrev)}.`,
      action: ch < -3 ? "Δείτε ποιοι πελάτες και ποιες κατηγορίες μείωσαν τις αγορές τους." : undefined,
      href: "products?tab=categories",
      weight: Math.abs(ch),
    });
  }

  // ── Margin trend
  const mNow = v(d.salesNow, SL("margin_pct"));
  const mPrev = v(d.salesPrev, SL("margin_pct"));
  if (mNow && mPrev) {
    const pp = mNow - mPrev;
    const lostOrGained = (pp / 100) * revNow;
    out.push({
      id: "margin",
      area: "Κερδοφορία",
      severity: pp >= 0.5 ? "good" : pp <= -0.5 ? "warn" : "info",
      title: `Μικτό περιθώριο ${pct(mNow)} (${pp >= 0 ? "+" : ""}${pp.toFixed(1)} μονάδες)`,
      detail:
        Math.abs(pp) >= 0.5
          ? `Στον τζίρο της περιόδου αυτό αντιστοιχεί σε ${pp >= 0 ? "επιπλέον" : "χαμένο"} μικτό κέρδος περίπου ${eurCompact(Math.abs(lostOrGained))}.`
          : `Σταθερό σε σχέση με πέρσι (${pct(mPrev)}).`,
      action: pp <= -0.5 ? "Ελέγξτε εκπτώσεις και αυξήσεις κόστους στα είδη κατηγορίας A." : undefined,
      href: "products?tab=low-margin",
      weight: Math.abs(pp) * 10,
    });
  }

  // ── Customers at risk of churn
  const churnN = v(d.churn, "customers.count");
  const churnRev = v(d.churn, "customers.revenue_prev_12m");
  if (churnN > 0 && churnRev > 0) {
    out.push({
      id: "churn",
      area: "Πελάτες",
      severity: "bad",
      title: `${churnN.toLocaleString("el-GR")} πελάτες κινδυνεύουν να χαθούν — ${eurCompact(churnRev)} τζίρος πέρσι`,
      detail: `Αγόραζαν τακτικά αλλά έχουν σταματήσει πολύ πέρα από τον συνηθισμένο τους ρυθμό. Μεγαλύτεροι: ${listNames(
        d.churnTop,
        "customers.customer_name",
        (r) => `${eurCompact(num(r["customers.revenue_prev"]))}, ${num(r["customers.recency_days"])} ημ.`,
      )}.`,
      action: "Τηλεφωνήστε στους μεγαλύτερους αυτή την εβδομάδα — μια προσφορά επανενεργοποίησης κοστίζει λιγότερο από νέο πελάτη.",
      href: "customers?tab=churn",
      weight: churnRev / 1000,
    });
  }

  // ── Overdue receivables
  const o90 = v(d.receivables, "customers.overdue_90");
  const bal = v(d.receivables, "customers.balance");
  const dso = v(d.receivables, "customers.dso");
  if (o90 > 0 && bal > 0) {
    out.push({
      id: "overdue",
      area: "Εισπράξεις",
      severity: o90 / bal > 0.3 ? "bad" : "warn",
      title: `${eurCompact(o90)} ανοιχτά πάνω από 90 ημέρες (${pct((100 * o90) / bal, 0)} του υπολοίπου)`,
      detail: `Υπόλοιπο πελατών ${eurCompact(bal)}, μέσος χρόνος είσπραξης ${Math.round(dso)} ημέρες. Μεγαλύτερα: ${listNames(
        d.debtors,
        "customers.customer_name",
        (r) => `${eurCompact(num(r["customers.overdue_90_amount"]))}, βαθμός ${r["customers.payment_grade"] ?? "—"}`,
      )}.`,
      action: "Ξεκινήστε υπενθυμίσεις και διακανονισμούς· εξετάστε πιστωτικό όριο για τους πελάτες με βαθμό Δ.",
      href: "customers?tab=risk",
      weight: o90 / 1000,
    });
  }

  // ── Dead stock
  const stockVal = v(d.stock, "items.stock_value");
  const dead = v(d.stock, "items.dead_stock_value");
  if (dead > 0 && stockVal > 0) {
    out.push({
      id: "dead-stock",
      area: "Αποθήκη",
      severity: dead / stockVal > 0.25 ? "bad" : "warn",
      title: `Νεκρό απόθεμα ${eurCompact(dead)} — ${pct((100 * dead) / stockVal, 0)} της αποθήκης`,
      detail: `${v(d.stock, "items.dead_stock_items").toLocaleString("el-GR")} είδη με απόθεμα δεν έχουν πουληθεί για μεγάλο διάστημα. Συνολική αξία αποθέματος ${eurCompact(stockVal)}.`,
      action: "Προωθήσεις/εκπτώσεις στα ακριβότερα, επιστροφή στους προμηθευτές όπου γίνεται, και πάγωμα νέων αγορών τους.",
      href: "stock?tab=dead",
      weight: dead / 1000,
    });
  }

  // ── Reorder (A items close to stock-out)
  const urgentN = v(d.urgentCount, "items.count");
  if (urgentN > 0) {
    out.push({
      id: "reorder",
      area: "Αποθήκη",
      severity: "warn",
      title: `${urgentN.toLocaleString("el-GR")} βασικά είδη (κατηγορία A) χρειάζονται παραγγελία`,
      detail: `Το απόθεμά τους δεν καλύπτει τον χρόνο παράδοσης του προμηθευτή. Πιο επείγοντα: ${listNames(
        d.urgent,
        "items.item_name",
        (r) => `κάλυψη ${Math.max(0, Math.round(num(r["items.days_of_cover"])))} ημ., πρόταση ${Math.round(num(r["items.order_qty"]))} τεμ.`,
      )}. Συνολικά προτείνεται παραγγελία αξίας ${eurCompact(v(d.urgentCount, "items.suggested_order_value"))} για αυτά.`,
      action: "Επιβεβαιώστε τις προτάσεις παραγγελίας ανά προμηθευτή.",
      href: "stock?tab=reorder",
      weight: urgentN,
    });
  }

  // ── Low-margin best sellers
  const lowN = v(d.lowMarginCount, "items.count");
  if (lowN > 0) {
    out.push({
      id: "low-margin",
      area: "Κερδοφορία",
      severity: "warn",
      title: `${lowN.toLocaleString("el-GR")} δημοφιλή είδη με περιθώριο κάτω από 8%`,
      detail: `Κάνουν ${eurCompact(v(d.lowMarginCount, "items.revenue_12m"))} τζίρο τον χρόνο με ελάχιστο κέρδος: ${listNames(
        d.lowMargin,
        "items.item_name",
        (r) => pct(num(r["items.margin_percent"])),
      )}.`,
      action: "Αναθεωρήστε τιμοκατάλογο ή εκπτώσεις· ελέγξτε αν άλλαξε το κόστος αγοράς.",
      href: "products?tab=low-margin",
      weight: lowN,
    });
  }

  // ── Supplier price increases
  if (d.priceUp.length) {
    out.push({
      id: "price-up",
      area: "Προμηθευτές",
      severity: "warn",
      title: `Αυξήσεις τιμών από ${d.priceUp.length === 3 ? "τουλάχιστον 3" : d.priceUp.length} βασικούς προμηθευτές`,
      detail: `Για τα ίδια είδη, έναντι των προηγούμενων 12 μηνών: ${listNames(d.priceUp, "suppliers.supplier_name", (r) => `+${pct(num(r["suppliers.price_change"]))}`)}.`,
      action: "Διαπραγματευτείτε ή συγκρίνετε με εναλλακτικούς προμηθευτές· περάστε την αύξηση στις τιμές πώλησης όπου χρειάζεται.",
      href: "suppliers?tab=prices",
      weight: d.priceUp.length * 5,
    });
  }

  // ── Slow suppliers
  if (d.lead.length) {
    out.push({
      id: "lead-times",
      area: "Προμηθευτές",
      severity: "info",
      title: `Αργές παραδόσεις: ${d.lead.length} σημαντικοί προμηθευτές ξεπερνούν τις 30 ημέρες`,
      detail: `Στο 10% των παραγγελιών (χειρότερες περιπτώσεις): ${listNames(d.lead, "suppliers.supplier_name", (r) => `${Math.round(num(r["suppliers.lead_days_p90"]))} ημ.`)}.`,
      action: "Κρατήστε μεγαλύτερο απόθεμα ασφαλείας για τα είδη τους ή παραγγέλνετε νωρίτερα.",
      href: "suppliers?tab=lead",
      weight: 2,
    });
  }

  // ── Cash outlook (next 4 weeks)
  const weeks = d.forecast.slice(0, 4);
  if (weeks.length) {
    const inflow = weeks.reduce((t, r) => t + num(r["cash_forecast.inflow"]), 0);
    const outflow = weeks.reduce((t, r) => t + num(r["cash_forecast.outflow"]), 0);
    const cash = v(d.cash, "cash.balance");
    const net = inflow - outflow;
    out.push({
      id: "cash",
      area: "Ταμειακά",
      severity: net < 0 && cash + net < 0 ? "bad" : net < 0 ? "warn" : "good",
      title: `Ταμειακή ροή 4 εβδομάδων: ${net >= 0 ? "+" : ""}${eurCompact(net)}`,
      detail: `Αναμενόμενες εισπράξεις ${eurCompact(inflow)} και πληρωμές προμηθευτών ${eurCompact(outflow)}, με βάση τον ρυθμό πληρωμής του καθενός.${
        cash ? ` Ταμείο & τράπεζες: ${eurFull(cash)}.` : ""
      }`,
      action: net < 0 ? "Επισπεύστε εισπράξεις ή μεταθέστε πληρωμές όπου γίνεται." : undefined,
      weight: Math.abs(net) / 1000,
    });
  }

  // ── Customer concentration
  const total = v(d.allCustomers, "customers.revenue_12m");
  const top10 = d.topCustomers.reduce((t, r) => t + num(r["customers.revenue"]), 0);
  if (total > 0 && top10 / total > 0.35) {
    out.push({
      id: "concentration",
      area: "Πελάτες",
      severity: "info",
      title: `Οι 10 μεγαλύτεροι πελάτες κάνουν ${pct((100 * top10) / total, 0)} του τζίρου`,
      detail: `Μεγαλύτεροι: ${listNames(d.topCustomers, "customers.customer_name", (r) => eurCompact(num(r["customers.revenue"])))}.`,
      action: "Φροντίστε τη σχέση με τους μεγάλους και διευρύνετε τη βάση πελατών για να μειώσετε την εξάρτηση.",
      href: "customers?tab=top",
      weight: 1,
    });
  }

  const order: Record<Severity, number> = { bad: 0, warn: 1, good: 2, info: 3 };
  out.sort((a, b) => order[a.severity] - order[b.severity] || b.weight - a.weight);

  const kpis: Kpis = {
    revenue: { now: revNow, prev: revPrev },
    margin: { now: v(d.salesNow, SL("margin")), prev: v(d.salesPrev, SL("margin")) },
    marginPct: { now: mNow, prev: mPrev },
    documents: { now: v(d.salesNow, SL("documents")), prev: v(d.salesPrev, SL("documents")) },
    customers: { now: v(d.salesNow, SL("customers")), prev: v(d.salesPrev, SL("customers")) },
    receivables: bal,
    overdue90: o90,
    dso,
    stockValue: stockVal,
    deadStock: dead,
    cash: v(d.cash, "cash.balance"),
    categories: d.catNow
      .map((r) => ({ name: String(r[SL("category")]), revenue: num(r[SL("revenue")]), margin: num(r[SL("margin_pct")]) }))
      .sort((a, b) => b.revenue - a.revenue),
  };
  return { insights: out, errors, kpis };
}

export type Kpis = {
  revenue: { now: number; prev: number };
  margin: { now: number; prev: number };
  marginPct: { now: number; prev: number };
  documents: { now: number; prev: number };
  customers: { now: number; prev: number };
  receivables: number;
  overdue90: number;
  dso: number;
  stockValue: number;
  deadStock: number;
  cash: number;
  categories: { name: string; revenue: number; margin: number }[];
};
