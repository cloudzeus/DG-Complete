// Greek column labels for mirrored SoftOne tables (from the SoftOne field captions, made readable)
// and the foreign keys that are displayed by name instead of by internal id.

const COMMON: Record<string, string> = {
  CODE: "Κωδικός",
  CODE1: "Barcode",
  SHORTCUT: "Σύντμηση",
  NAME: "Περιγραφή",
  ISACTIVE: "Ενεργό",
  UPDDATE: "Τελ. μεταβολή",
  INSDATE: "Ημ/νία καταχώρισης",
  AFM: "ΑΦΜ",
  EMAIL: "Email",
  PHONE01: "Τηλέφωνο",
  ADDRESS: "Διεύθυνση",
  CITY: "Πόλη",
  ZIP: "Τ.Κ.",
  COUNTRY: "Χώρα",
  DISTRICT: "Νομός",
  DISTRICTS: "Περιοχή",
  IRSDATA: "Δ.Ο.Υ.",
  SOCURRENCY: "Νόμισμα",
  INTCODE: "Κωδ. Intrastat",
  MYDATACODE: "Κωδικός myDATA",
  VAT: "ΦΠΑ",
  PERCNT: "Ποσοστό %",
  PAYMENT: "Τρόπος πληρωμής",
  SHIPMENT: "Τρόπος αποστολής",
  SERIES: "Σειρά",
  FPRMS: "Τύπος",
  SOSOURCE: "Ενότητα",
  TRDR: "Συναλλασσόμενος",
  MTRL: "Είδος",
  MTRUNIT1: "Μονάδα μέτρησης",
  MTRCATEGORY: "Εμπορική κατηγορία",
  MTRGROUP: "Ομάδα",
  MTRMARK: "Μάρκα",
  MTRMANFCTR: "Κατασκευαστής",
  PRICER: "Τιμή λιανικής",
  PRICEW: "Τιμή χονδρικής",
  PRICE: "Τιμή",
  FINCODE: "Παραστατικό",
  TRNDATE: "Ημερομηνία",
  NETAMNT: "Καθαρή αξία",
  VATAMNT: "Αξία ΦΠΑ",
  SUMAMNT: "Συνολική αξία",
  ISCANCEL: "Ακυρωμένο",
  LINENUM: "Γραμμή",
  QTY1: "Ποσότητα",
  DISC1PRC: "Έκπτωση %",
  LINEVAL: "Αξία γραμμής",
};

// Per-table wording (e.g. a customer has an "Επωνυμία", an item a "Περιγραφή").
const BY_TABLE: Record<string, Record<string, string>> = {
  TRDR: { NAME: "Επωνυμία", ISACTIVE: "Ενεργός" },
  BANK: { NAME: "Επωνυμία", ISACTIVE: "Ενεργή" },
  FINDOC: { TRDR: "Πελάτης", PAYMENT: "Πληρωμή" },
  ZIP: { CODE: "Ταχ. κώδικας" },
  IRSDATA: { CODE: "Κωδ. Δ.Ο.Υ." },
  COUNTRY: { ISACTIVE: "Ενεργή" },
};

export function fieldLabel(table: string, field: string) {
  return BY_TABLE[table]?.[field] ?? COMMON[field] ?? field;
}

/** Foreign-key field → the SoftOne table whose NAME is shown instead of the id. */
export const FOREIGN_KEYS: Record<string, string> = {
  TRDR: "TRDR",
  MTRL: "MTRL",
  VAT: "VAT",
  MTRCATEGORY: "MTRCATEGORY",
  MTRUNIT1: "MTRUNIT",
  MTRGROUP: "MTRGROUP",
  MTRMARK: "MTRMARK",
  MTRMANFCTR: "MTRMANFCTR",
  COUNTRY: "COUNTRY",
  IRSDATA: "IRSDATA",
  SOCURRENCY: "SOCURRENCY",
  SERIES: "SERIES",
  PAYMENT: "PAYMENT",
  SHIPMENT: "SHIPMENT",
  TRDCATEGORY: "TRDCATEGORY",
  TRDBUSINESS: "TRDBUSINESS",
  JOBTYPE: "JOBTYPE",
  WHOUSE: "WHOUSE",
  BANK: "BANK",
};

/** Internal ids that are never shown as columns (resolved FKs are shown by name instead). */
export const INTERNAL_ID_FIELDS = new Set(["TRDR", "MTRL", "FINDOC", "MTRLINES"]);
