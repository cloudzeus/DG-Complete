// P&L (Αποτελέσματα χρήσης) templates. A template creates a tenant's lines + rules; everything is
// editable afterwards. Rules map source rows to lines:
//   GL        → account-code prefix, dot-aware ("20.01" matches 20.01 and 20.01.xx, not 20.010).
//               A trailing "*" means a raw prefix ("7*" matches 70, 71 …). Longest pattern wins.
//   SALES     → a sales series id (negate = credit notes / returns)
//   PURCHASES → a purchase series id (negate = credit notes / returns)
// Amounts in fin_fact are the effect on profit: revenue positive, costs negative.

import type { PnlSection } from "@/lib/generated/prisma/enums";

export type TemplateLine = {
  code: string;
  name: string;
  section: PnlSection;
  rules: { source: "GL" | "SALES" | "PURCHASES"; pattern: string; negate?: boolean }[];
};

export const SECTION_LABEL: Record<PnlSection, string> = {
  REVENUE: "Κύκλος εργασιών",
  COGS: "Κόστος πωληθέντων / αγορές",
  OTHER_INCOME: "Λοιπά έσοδα εκμετάλλευσης",
  OPEX: "Λειτουργικά έξοδα",
  DEPRECIATION: "Αποσβέσεις & προβλέψεις",
  FINANCIAL: "Χρηματοοικονομικά",
  EXTRAORDINARY: "Έκτακτα & προηγούμενων χρήσεων",
  TAX: "Φόρος εισοδήματος",
};

export const SECTION_ORDER: PnlSection[] = [
  "REVENUE",
  "COGS",
  "OTHER_INCOME",
  "OPEX",
  "DEPRECIATION",
  "FINANCIAL",
  "EXTRAORDINARY",
  "TAX",
];

/** Subtotals shown after a section: label + the sections summed so far. */
export const SUBTOTALS: Partial<Record<PnlSection, string>> = {
  COGS: "Μικτό κέρδος",
  OPEX: "EBITDA",
  DEPRECIATION: "EBIT (λειτουργικό αποτέλεσμα)",
  EXTRAORDINARY: "Κέρδη προ φόρων",
  TAX: "Καθαρά κέρδη",
};

const gl = (...patterns: string[]) => patterns.map((pattern) => ({ source: "GL" as const, pattern }));

/** Ελληνικό Γενικό Λογιστικό Σχέδιο (ΕΓΛΣ) — ομάδες 2 (αγορές), 6, 7, 8. */
export const EGLS_TEMPLATE: TemplateLine[] = [
  { code: "REV_GOODS", name: "Πωλήσεις εμπορευμάτων", section: "REVENUE", rules: gl("70") },
  { code: "REV_PRODUCTS", name: "Πωλήσεις προϊόντων & λοιπών αποθεμάτων", section: "REVENUE", rules: gl("71", "72") },
  { code: "REV_SERVICES", name: "Πωλήσεις υπηρεσιών", section: "REVENUE", rules: gl("73") },
  { code: "COGS_GOODS", name: "Αγορές εμπορευμάτων", section: "COGS", rules: gl("20.01", "20.02", "20.03") },
  { code: "COGS_MATERIALS", name: "Αγορές υλών & υλικών", section: "COGS", rules: gl("24.01", "24.02", "24.03", "25.01", "25.02", "25.03") },
  { code: "OI_OTHER", name: "Επιχορηγήσεις & παρεπόμενα έσοδα", section: "OTHER_INCOME", rules: gl("74", "75") },
  { code: "OPEX_STAFF", name: "Αμοιβές & έξοδα προσωπικού", section: "OPEX", rules: gl("60") },
  { code: "OPEX_THIRD", name: "Αμοιβές & έξοδα τρίτων", section: "OPEX", rules: gl("61") },
  { code: "OPEX_SERVICES", name: "Παροχές τρίτων", section: "OPEX", rules: gl("62") },
  { code: "OPEX_TAXES", name: "Φόροι & τέλη", section: "OPEX", rules: gl("63") },
  { code: "OPEX_OTHER", name: "Διάφορα έξοδα", section: "OPEX", rules: gl("64") },
  { code: "DEP_DEPRECIATION", name: "Αποσβέσεις", section: "DEPRECIATION", rules: gl("66") },
  { code: "DEP_PROVISIONS", name: "Προβλέψεις εκμετάλλευσης", section: "DEPRECIATION", rules: gl("68") },
  { code: "FIN_INCOME", name: "Πιστωτικοί τόκοι & έσοδα κεφαλαίων", section: "FINANCIAL", rules: gl("76") },
  { code: "FIN_EXPENSES", name: "Χρεωστικοί τόκοι & συναφή έξοδα", section: "FINANCIAL", rules: gl("65") },
  { code: "EXTRA", name: "Έκτακτα & προηγούμενων χρήσεων", section: "EXTRAORDINARY", rules: gl("81", "82", "83", "84") },
];

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

/** Classifies a document series by its name: invoices/receipts count, credit notes/returns subtract. */
export function classifySeries(name: string): { include: boolean; negate: boolean } {
  const n = strip(name);
  const invoice = /ΤΙΜΟΛ|ΑΠΟΔΕΙΞ|ΑΠΟΔΕΙΞΗ|INVOICE|RECEIPT/.test(n);
  const excluded = /ΠΡΟΣΦΟΡ|ΠΑΡΑΓΓΕΛ|ΠΡΟΤΙΜΟΛ|ΠΡΟΦΟΡΜ/.test(n);
  const negate = /ΠΙΣΤΩΤ|ΕΠΙΣΤΡΟΦ|CREDIT/.test(n);
  return { include: invoice && !excluded, negate };
}

export type SeriesInfo = { series: number; name: string; sosource: number | null };

/** Εμπορικό (χωρίς Γενική Λογιστική): πωλήσεις & αγορές από τα παραστατικά τιμολόγησης. */
export function commercialTemplate(series: SeriesInfo[]): TemplateLine[] {
  const rules = (sosource: number, source: "SALES" | "PURCHASES") =>
    series
      .filter((s) => s.sosource === sosource)
      .map((s) => ({ s, c: classifySeries(s.name) }))
      .filter(({ c }) => c.include)
      .map(({ s, c }) => ({ source, pattern: String(s.series), negate: c.negate }));
  return [
    { code: "REV_SALES", name: "Πωλήσεις", section: "REVENUE", rules: rules(1351, "SALES") },
    { code: "COGS_PURCHASES", name: "Αγορές", section: "COGS", rules: rules(1251, "PURCHASES") },
  ];
}

export const TEMPLATES = {
  EGLS: { label: "Γενική Λογιστική — ΕΓΛΣ", source: "GL" as const },
  COMMERCIAL: { label: "Εμπορικό — παραστατικά πωλήσεων & αγορών", source: "COMMERCIAL" as const },
};
export type TemplateKey = keyof typeof TEMPLATES;
