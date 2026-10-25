import type { CubeQuery } from "@/lib/cube-client";
import type { Period } from "@/lib/period";
import type { ServiceKey } from "@/lib/services";

// Ready-made datasets of the web services: stable names and columns for the tenant's own
// applications, each a Cube query (scoped to the tenant and to its plan like everything else).

export type Dataset = {
  key: string;
  title: string;
  description: string;
  service: ServiceKey;
  /** Uses the period (?period=ytd or ?from=…&to=…); snapshot datasets ignore it. */
  periodic: boolean;
  query: (p: Period, limit: number) => CubeQuery;
};

const td = (dimension: string, p: Period, granularity?: "day" | "month") => [
  { dimension, dateRange: [p.from, p.to] as [string, string], ...(granularity ? { granularity } : {}) },
];

export const DATASETS: Dataset[] = [
  {
    key: "sales-monthly",
    title: "Πωλήσεις ανά μήνα",
    description: "Τζίρος, μικτό κέρδος, περιθώριο, παραστατικά και πελάτες ανά μήνα.",
    service: "sales",
    periodic: true,
    query: (p) => ({
      measures: ["sales_lines.revenue", "sales_lines.margin", "sales_lines.margin_pct", "sales_lines.documents", "sales_lines.customers"],
      timeDimensions: td("sales_lines.date", p, "month"),
      order: { "sales_lines.date": "asc" },
    }),
  },
  {
    key: "sales-by-category",
    title: "Πωλήσεις ανά κατηγορία",
    description: "Τζίρος και περιθώριο ανά κατηγορία ειδών.",
    service: "sales",
    periodic: true,
    query: (p, limit) => ({
      measures: ["sales_lines.revenue", "sales_lines.margin", "sales_lines.margin_pct"],
      dimensions: ["sales_lines.category"],
      timeDimensions: td("sales_lines.date", p),
      order: { "sales_lines.revenue": "desc" },
      limit,
    }),
  },
  {
    key: "top-products",
    title: "Προϊόντα με τις μεγαλύτερες πωλήσεις",
    description: "Ανά είδος: τζίρος, κέρδος, περιθώριο, ποσότητα.",
    service: "sales",
    periodic: true,
    query: (p, limit) => ({
      measures: ["sales_lines.revenue", "sales_lines.margin", "sales_lines.margin_pct", "sales_lines.quantity"],
      dimensions: ["sales_lines.item_code", "sales_lines.item_name"],
      timeDimensions: td("sales_lines.date", p),
      order: { "sales_lines.revenue": "desc" },
      limit,
    }),
  },
  {
    key: "top-customers",
    title: "Μεγαλύτεροι πελάτες",
    description: "Ανά πελάτη: τζίρος, κέρδος, παραστατικά.",
    service: "sales",
    periodic: true,
    query: (p, limit) => ({
      measures: ["sales_lines.revenue", "sales_lines.margin", "sales_lines.documents"],
      dimensions: ["sales_lines.customer_code", "sales_lines.customer_name"],
      timeDimensions: td("sales_lines.date", p),
      order: { "sales_lines.revenue": "desc" },
      limit,
    }),
  },
  {
    key: "customers-at-risk",
    title: "Πελάτες που σταμάτησαν να αγοράζουν",
    description: "Τακτικοί πελάτες με υψηλό κίνδυνο απώλειας (στιγμιότυπο 12 μηνών).",
    service: "sales",
    periodic: false,
    query: (_p, limit) => ({
      dimensions: ["customers.customer_code", "customers.customer_name", "customers.revenue_prev", "customers.recency_days", "customers.avg_days_between"],
      filters: [{ member: "customers.churn_risk", operator: "equals", values: ["Υψηλός"] }],
      order: { "customers.revenue_prev": "desc" },
      limit,
    }),
  },
  {
    key: "receivables",
    title: "Υπόλοιπα και αξιολόγηση πληρωμών πελατών",
    description: "Ανοιχτό υπόλοιπο, ληξιπρόθεσμα > 90 ημερών, μέσος χρόνος πληρωμής, βαθμός πληρωμής.",
    service: "sales",
    periodic: false,
    query: (_p, limit) => ({
      dimensions: ["customers.customer_code", "customers.customer_name", "customers.open_balance", "customers.overdue_90_amount", "customers.payment_days", "customers.payment_grade"],
      filters: [{ member: "customers.open_balance", operator: "gt", values: ["0"] }],
      order: { "customers.open_balance": "desc" },
      limit,
    }),
  },
  {
    key: "stock-reorder",
    title: "Προτάσεις παραγγελίας",
    description: "Είδη προς παραγγελία με απόθεμα, κάλυψη, χρόνο παράδοσης και προτεινόμενη ποσότητα.",
    service: "purchasing",
    periodic: false,
    query: (_p, limit) => ({
      dimensions: ["items.item_code", "items.item_name", "items.supplier", "items.abc", "items.stock", "items.days_of_cover", "items.lead_days", "items.order_qty"],
      filters: [{ member: "items.order_qty", operator: "gt", values: ["0"] }],
      order: { "items.days_of_cover": "asc" },
      limit,
    }),
  },
  {
    key: "dead-stock",
    title: "Νεκρό απόθεμα",
    description: "Είδη με απόθεμα χωρίς πώληση πέρα από το όριο ημερών, με αξία.",
    service: "purchasing",
    periodic: false,
    query: (_p, limit) => ({
      dimensions: ["items.item_code", "items.item_name", "items.stock", "items.stock_amount", "items.last_sale", "items.days_since_sale"],
      filters: [{ member: "items.dead_stock", operator: "equals", values: ["true"] }],
      order: { "items.stock_amount": "desc" },
      limit,
    }),
  },
  {
    key: "suppliers",
    title: "Αξιολόγηση προμηθευτών",
    description: "Αγορές 12 μηνών, μερίδιο, χρόνοι παράδοσης, μεταβολή τιμών, υπόλοιπο.",
    service: "purchasing",
    periodic: false,
    query: (_p, limit) => ({
      dimensions: ["suppliers.supplier_code", "suppliers.supplier_name", "suppliers.spend", "suppliers.spend_share", "suppliers.lead_days_median", "suppliers.lead_days_p90", "suppliers.price_change", "suppliers.open_balance"],
      filters: [{ member: "suppliers.spend", operator: "gt", values: ["0"] }],
      order: { "suppliers.spend": "desc" },
      limit,
    }),
  },
  {
    key: "pnl",
    title: "Αποτελέσματα χρήσης ανά μήνα",
    description: "Έσοδα, κόστος πωληθέντων, μικτό κέρδος, λειτουργικά έξοδα, EBITDA, καθαρό αποτέλεσμα ανά μήνα.",
    service: "finance",
    periodic: true,
    query: (p) => ({
      measures: ["pnl.revenue", "pnl.cogs", "pnl.gross_profit", "pnl.opex", "pnl.ebitda", "pnl.net_profit"],
      timeDimensions: td("pnl.date", p, "month"),
      order: { "pnl.date": "asc" },
    }),
  },
  {
    key: "cash-forecast",
    title: "Πρόβλεψη ταμείου 13 εβδομάδων",
    description: "Αναμενόμενες εισπράξεις, πληρωμές και καθαρή ροή ανά εβδομάδα (0 = τώρα, με τα εκπρόθεσμα).",
    service: "finance",
    periodic: false,
    query: () => ({
      measures: ["cash_forecast.inflow", "cash_forecast.outflow", "cash_forecast.net"],
      dimensions: ["cash_forecast.week", "cash_forecast.week_start"],
      order: { "cash_forecast.week": "asc" },
    }),
  },
];

export const datasetDef = (key: string) => DATASETS.find((d) => d.key === key);
