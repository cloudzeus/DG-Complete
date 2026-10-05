// Number formatting for dashboards (el-GR).

const compact = new Intl.NumberFormat("el-GR", { notation: "compact", maximumFractionDigits: 1 });

/** 1.234.567 → "1,2 εκ. €" */
export const eurCompact = (v: number) => `${compact.format(v)} €`;

/** 1234567.8 → "1.234.568 €" */
export const eurFull = (v: number) => `${Math.round(v).toLocaleString("el-GR")} €`;

export const pct = (v: number, digits = 1) =>
  `${v.toLocaleString("el-GR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

/** Year-over-year change in % (null when there is no base). */
export const yoy = (now: number, before: number) => (before ? ((now - before) / Math.abs(before)) * 100 : null);

export const MONTHS_SHORT = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
