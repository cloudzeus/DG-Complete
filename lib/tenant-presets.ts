// Default data imports for a tenant's own SoftOne → tables in its warehouse schema t_<tenantId>.
// Verified against the installation before creation (same fallbacks as the DGsoft presets).
// History: FULL imports rows from the start of (current fiscal year − 2). INCREMENTAL either
// upserts by UPDDATE or re-imports a rolling window (edits + deletions are reflected).

import type { Columns } from "@/lib/warehouse-writer";

export type TenantPreset = {
  key: string;
  name: string;
  group: "Λογιστική" | "Παραστατικά" | "Μητρώα";
  requires: "GL" | "SALES" | "PURCHASES" | "ANY";
  table: string;
  targetTable: string;
  keyField: string;
  columns: Columns;
  /** Fields that may be missing in some installations (dropped on fallback). */
  optional?: string[];
  updField?: string;
  dateField?: string;
  windowDays?: number;
  filter?: string; // {COMPANY} → connection company (dropped if the table has no COMPANY column)
  intervalMinutes: number;
};

const DAY = 1440;

export const TENANT_PRESETS: TenantPreset[] = [
  // ── Λογιστική (Γενική Λογιστική)
  {
    key: "gl_accounts",
    name: "Λογαριασμοί Γ.Λ.",
    group: "Λογιστική",
    requires: "GL",
    table: "ACNT",
    targetTable: "gl_accounts",
    keyField: "ACNT",
    columns: { ACNT: "int", CODE: "text", NAME: "text", ACNGROUP: "int", ACNCATEGORY: "int", ISACTIVE: "int" },
    optional: ["ACNGROUP", "ACNCATEGORY", "ISACTIVE"],
    filter: "COMPANY={COMPANY}",
    intervalMinutes: DAY,
  },
  {
    key: "gl_lines",
    name: "Κινήσεις Γ.Λ. (γραμμές άρθρων)",
    group: "Λογιστική",
    requires: "GL",
    table: "ACNTRN",
    targetTable: "gl_lines",
    // A GL line is unique by article (ACNEDIT) + sub-article (ACNHEADER) + line (ACNTRN) — verified on real data.
    keyField: "ACNEDIT,ACNHEADER,ACNTRN",
    columns: {
      ACNTRN: "int",
      ACNEDIT: "int",
      ACNHEADER: "int",
      LINENUM: "int",
      ACNT: "int",
      TRNDATE: "timestamp",
      FISCPRD: "int",
      PERIOD: "int",
      BRANCH: "int",
      SOSOURCE: "int",
      FINCODE: "text",
      DEBIT: "numeric",
      CREDIT: "numeric",
      PRJC: "int",
      TRDR: "int",
      ISCANCEL: "int",
    },
    optional: ["LINENUM", "BRANCH", "SOSOURCE", "FINCODE", "PRJC", "TRDR", "ISCANCEL"],
    dateField: "TRNDATE",
    windowDays: 62,
    filter: "COMPANY={COMPANY}",
    intervalMinutes: 60,
  },

  // ── Παραστατικά (εμπορικό)
  {
    key: "sales_docs",
    name: "Παραστατικά πωλήσεων",
    group: "Παραστατικά",
    requires: "SALES",
    table: "FINDOC",
    targetTable: "sales_docs",
    keyField: "FINDOC",
    columns: {
      FINDOC: "int",
      FINCODE: "text",
      TRNDATE: "timestamp",
      FISCPRD: "int",
      PERIOD: "int",
      SERIES: "int",
      FPRMS: "int",
      TFPRMS: "int",
      BRANCH: "int",
      TRDR: "int",
      NETAMNT: "numeric", // document currency
      VATAMNT: "numeric",
      SUMAMNT: "numeric",
      LNETAMNT: "numeric", // company currency (€) — use these for BI
      SUMLAMNT: "numeric",
      ISCANCEL: "int",
      UPDDATE: "timestamp",
    },
    optional: ["FISCPRD", "PERIOD", "FPRMS", "TFPRMS", "BRANCH", "VATAMNT", "LNETAMNT", "SUMLAMNT", "ISCANCEL"],
    updField: "UPDDATE",
    dateField: "TRNDATE",
    filter: "COMPANY={COMPANY} AND SOSOURCE=1351",
    intervalMinutes: 30,
  },
  {
    key: "purchase_docs",
    name: "Παραστατικά αγορών",
    group: "Παραστατικά",
    requires: "PURCHASES",
    table: "FINDOC",
    targetTable: "purchase_docs",
    keyField: "FINDOC",
    columns: {
      FINDOC: "int",
      FINCODE: "text",
      TRNDATE: "timestamp",
      FISCPRD: "int",
      PERIOD: "int",
      SERIES: "int",
      FPRMS: "int",
      TFPRMS: "int",
      BRANCH: "int",
      TRDR: "int",
      NETAMNT: "numeric", // document currency
      VATAMNT: "numeric",
      SUMAMNT: "numeric",
      LNETAMNT: "numeric", // company currency (€) — use these for BI
      SUMLAMNT: "numeric",
      ISCANCEL: "int",
      UPDDATE: "timestamp",
    },
    optional: ["FISCPRD", "PERIOD", "FPRMS", "TFPRMS", "BRANCH", "VATAMNT", "LNETAMNT", "SUMLAMNT", "ISCANCEL"],
    updField: "UPDDATE",
    dateField: "TRNDATE",
    filter: "COMPANY={COMPANY} AND SOSOURCE=1251",
    intervalMinutes: 60,
  },

  // ── Μητρώα (διαστάσεις)
  {
    key: "fiscal_periods",
    name: "Χρήσεις & περίοδοι",
    group: "Μητρώα",
    requires: "ANY",
    table: "PERIOD",
    targetTable: "periods",
    keyField: "FISCPRD,PERIOD",
    columns: { FISCPRD: "int", PERIOD: "int", NAME: "text", FROMDATE: "timestamp", FINALDATE: "timestamp" },
    filter: "COMPANY={COMPANY}",
    intervalMinutes: DAY,
  },
  {
    key: "branches",
    name: "Υποκαταστήματα",
    group: "Μητρώα",
    requires: "ANY",
    table: "BRANCH",
    targetTable: "branches",
    keyField: "BRANCH",
    columns: { BRANCH: "int", NAME: "text", CITY: "text", ISACTIVE: "int" },
    optional: ["CITY", "ISACTIVE"],
    filter: "COMPANY={COMPANY}",
    intervalMinutes: DAY,
  },
  {
    key: "series",
    name: "Σειρές παραστατικών",
    group: "Μητρώα",
    requires: "ANY",
    table: "SERIES",
    targetTable: "series",
    keyField: "SERIES",
    columns: { SERIES: "int", CODE: "text", NAME: "text", SOSOURCE: "int", FPRMS: "int", ISACTIVE: "int" },
    optional: ["CODE", "FPRMS", "ISACTIVE"],
    filter: "COMPANY={COMPANY}",
    intervalMinutes: DAY,
  },
  {
    key: "customers",
    name: "Πελάτες",
    group: "Μητρώα",
    requires: "ANY",
    table: "TRDR",
    targetTable: "customers",
    keyField: "TRDR",
    columns: { TRDR: "int", CODE: "text", NAME: "text", AFM: "text", CITY: "text", TRDCATEGORY: "int", TRDBUSINESS: "int", ISACTIVE: "int", UPDDATE: "timestamp" },
    optional: ["AFM", "CITY", "TRDCATEGORY", "TRDBUSINESS", "ISACTIVE"],
    updField: "UPDDATE",
    filter: "COMPANY={COMPANY} AND SODTYPE=13",
    intervalMinutes: 180,
  },
  {
    key: "suppliers",
    name: "Προμηθευτές",
    group: "Μητρώα",
    requires: "ANY",
    table: "TRDR",
    targetTable: "suppliers",
    keyField: "TRDR",
    columns: { TRDR: "int", CODE: "text", NAME: "text", AFM: "text", CITY: "text", TRDCATEGORY: "int", ISACTIVE: "int", UPDDATE: "timestamp" },
    optional: ["AFM", "CITY", "TRDCATEGORY", "ISACTIVE"],
    updField: "UPDDATE",
    filter: "COMPANY={COMPANY} AND SODTYPE=12",
    intervalMinutes: 180,
  },
  {
    key: "items",
    name: "Είδη & υπηρεσίες",
    group: "Μητρώα",
    requires: "ANY",
    table: "MTRL",
    targetTable: "items",
    keyField: "MTRL",
    columns: { MTRL: "int", CODE: "text", NAME: "text", SODTYPE: "int", MTRCATEGORY: "int", MTRGROUP: "int", ISACTIVE: "int", UPDDATE: "timestamp" },
    optional: ["SODTYPE", "MTRCATEGORY", "MTRGROUP", "ISACTIVE"],
    updField: "UPDDATE",
    filter: "COMPANY={COMPANY}",
    intervalMinutes: 180,
  },
];
