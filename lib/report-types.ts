// Report definitions (shared by the server and the builder in the browser) and the library of
// ready reports. A field is a Cube member; a date grouping is «cube.date@month».

import type { PeriodPreset } from "@/lib/period";

export type ReportView = "pivot" | "table" | "bar" | "line" | "area" | "pie";
export type ReportFilter = { member: string; operator: "equals" | "notEquals" | "contains" | "gt" | "lt" | "set" | "notSet"; values: string[] };

export type ReportDefinition = {
  cube: string;
  rows: string[];
  columns: string[];
  values: string[];
  filters: ReportFilter[];
  period?: { preset: PeriodPreset; from?: string; to?: string };
  view: ReportView;
  sort?: { by: string; desc: boolean };
  limit?: number;
};

export const GRANULARITIES = [
  { key: "day", label: "Ημέρα" },
  { key: "week", label: "Εβδομάδα" },
  { key: "month", label: "Μήνας" },
  { key: "quarter", label: "Τρίμηνο" },
  { key: "year", label: "Έτος" },
] as const;

export const VIEWS: { key: ReportView; label: string }[] = [
  { key: "pivot", label: "Pivot" },
  { key: "table", label: "Πίνακας" },
  { key: "bar", label: "Μπάρες" },
  { key: "line", label: "Γραμμές" },
  { key: "area", label: "Περιοχές" },
  { key: "pie", label: "Πίτα" },
];

export type LibraryReport = { key: string; group: string; name: string; description: string; definition: ReportDefinition };

const SL = (m: string) => `sales_lines.${m}`;
const PL = (m: string) => `purchase_lines.${m}`;
const ytd = { preset: "ytd" as const };
const last12 = { preset: "12m" as const };

export const REPORT_LIBRARY: LibraryReport[] = [
  {
    key: "sales-category-month",
    group: "Πωλήσεις",
    name: "Πωλήσεις ανά κατηγορία και μήνα",
    description: "Τζίρος κάθε εμπορικής κατηγορίας μήνα προς μήνα — εποχικότητα και τάση.",
    definition: { cube: "sales_lines", rows: [SL("category")], columns: [`${SL("date")}@month`], values: [SL("revenue")], filters: [], period: ytd, view: "pivot" },
  },
  {
    key: "sales-brand-margin",
    group: "Πωλήσεις",
    name: "Μάρκες: τζίρος, κέρδος και περιθώριο",
    description: "Ποιες μάρκες φέρνουν τζίρο και ποιες κέρδος.",
    definition: { cube: "sales_lines", rows: [SL("brand")], columns: [], values: [SL("revenue"), SL("margin"), SL("margin_pct"), SL("customers")], filters: [], period: last12, view: "table" },
  },
  {
    key: "sales-customer-brand",
    group: "Πελάτες",
    name: "Πελάτες × μάρκες",
    description: "Τι αγοράζει κάθε πελάτης ανά μάρκα — για προτάσεις και συμφωνίες.",
    definition: { cube: "sales_lines", rows: [SL("customer_name")], columns: [SL("brand")], values: [SL("revenue")], filters: [], period: last12, view: "pivot", limit: 3000 },
  },
  {
    key: "sales-region",
    group: "Πελάτες",
    name: "Πωλήσεις ανά νομό",
    description: "Τζίρος, πελάτες και περιθώριο ανά νομό (από τον ταχυδρομικό κώδικα).",
    definition: { cube: "sales_lines", rows: [SL("region")], columns: [], values: [SL("revenue"), SL("customers"), SL("margin_pct")], filters: [], period: last12, view: "bar" },
  },
  {
    key: "sales-region-category",
    group: "Πελάτες",
    name: "Νομός × κατηγορία",
    description: "Τι πουλιέται πού — κατηγορίες ανά νομό.",
    definition: { cube: "sales_lines", rows: [SL("region")], columns: [SL("category")], values: [SL("revenue")], filters: [], period: last12, view: "pivot" },
  },
  {
    key: "sales-top-items",
    group: "Προϊόντα",
    name: "Τα 100 είδη με τον μεγαλύτερο τζίρο",
    description: "Τζίρος, ποσότητα, κέρδος και περιθώριο ανά είδος.",
    definition: { cube: "sales_lines", rows: [SL("item_name")], columns: [], values: [SL("revenue"), SL("quantity"), SL("margin"), SL("margin_pct")], filters: [], period: last12, view: "table", limit: 100 },
  },
  {
    key: "sales-weekday-hour",
    group: "Πωλήσεις",
    name: "Ημέρα × ώρα πωλήσεων",
    description: "Πότε πουλάτε περισσότερο — ημέρα εβδομάδας και ώρα καταχώρησης.",
    definition: { cube: "sales_lines", rows: [SL("weekday")], columns: [SL("hour")], values: [SL("documents")], filters: [], period: last12, view: "pivot" },
  },
  {
    key: "sales-month-trend",
    group: "Πωλήσεις",
    name: "Τζίρος και κέρδος ανά μήνα",
    description: "Η πορεία των τελευταίων 12 μηνών.",
    definition: { cube: "sales_lines", rows: [`${SL("date")}@month`], columns: [], values: [SL("revenue"), SL("margin")], filters: [], period: last12, view: "line" },
  },
  {
    key: "purchases-supplier-month",
    group: "Αγορές",
    name: "Αγορές ανά προμηθευτή και μήνα",
    description: "Πόσα αγοράζετε από κάθε προμηθευτή μήνα προς μήνα.",
    definition: { cube: "purchase_lines", rows: [PL("supplier_name")], columns: [`${PL("date")}@month`], values: [PL("amount")], filters: [], period: ytd, view: "pivot" },
  },
  {
    key: "purchases-brand",
    group: "Αγορές",
    name: "Αγορές ανά μάρκα",
    description: "Αξία, ποσότητα και μέση τιμή αγοράς ανά μάρκα.",
    definition: { cube: "purchase_lines", rows: [PL("brand")], columns: [], values: [PL("amount"), PL("quantity"), PL("documents")], filters: [], period: last12, view: "bar" },
  },
  {
    key: "customers-rfm",
    group: "Πελάτες",
    name: "Πελάτες ανά κατηγορία RFM",
    description: "Πόσοι πελάτες σε κάθε κατηγορία (Champions, Σε κίνδυνο …) και ο τζίρος τους.",
    definition: { cube: "customers", rows: ["customers.segment"], columns: [], values: ["customers.count", "customers.revenue_12m", "customers.balance"], filters: [], view: "pie" },
  },
  {
    key: "customers-overdue",
    group: "Εισπράξεις",
    name: "Πελάτες με ληξιπρόθεσμα",
    description: "Υπόλοιπα και ληξιπρόθεσμα ανά πελάτη, με τον βαθμό πληρωμών.",
    definition: {
      cube: "customers",
      rows: ["customers.customer_name", "customers.payment_grade"],
      columns: [],
      values: ["customers.balance", "customers.overdue_90", "customers.overdue_61_90"],
      filters: [{ member: "customers.overdue_90_amount", operator: "gt", values: ["0"] }],
      view: "table",
      sort: { by: "customers.overdue_90", desc: true },
      limit: 200,
    },
  },
];
