// Default SoftOne (DGsoft) tables to mirror. Shared by the server seeder and the job dialog.
// {COMPANY} is replaced with the connection's company; the seeder drops that clause when the
// table has no COMPANY column in this SoftOne installation (verified live with GetTable … AND 1=0).
// keyField may be composite ("FINDOC,MTRLINES").

export type JobPreset = {
  key: string;
  name: string;
  group: "Γεωγραφία & φορολογία" | "Εμπορικά" | "Είδη & υπηρεσίες" | "Συναλλασσόμενοι" | "Παραστατικά";
  table: string;
  keyField: string;
  fields: string;
  /** Minimal field list used if the full list is rejected by this installation. */
  minimal: string;
  updField?: string;
  filter?: string;
  intervalMinutes: number;
  enabled?: boolean;
};

const DAY = 1440;

export const JOB_PRESETS: JobPreset[] = [
  // ── Γεωγραφία & φορολογία
  { key: "countries", group: "Γεωγραφία & φορολογία", name: "Χώρες", table: "COUNTRY", keyField: "COUNTRY", fields: "COUNTRY,SHORTCUT,NAME,INTCODE,SOCURRENCY,ISACTIVE", minimal: "COUNTRY,NAME", intervalMinutes: DAY },
  { key: "districts", group: "Γεωγραφία & φορολογία", name: "Νομοί", table: "DISTRICT", keyField: "COUNTRY,DISTRICT", fields: "COUNTRY,DISTRICT,CODE,NAME", minimal: "COUNTRY,DISTRICT,NAME", intervalMinutes: DAY },
  { key: "zips", group: "Γεωγραφία & φορολογία", name: "Ταχ. κώδικες / περιοχές", table: "ZIP", keyField: "ZIP", fields: "ZIP,COUNTRY,DISTRICT,CODE,DISTRICTS,ISACTIVE", minimal: "ZIP,CODE", intervalMinutes: DAY },
  { key: "irs", group: "Γεωγραφία & φορολογία", name: "Δ.Ο.Υ.", table: "IRSDATA", keyField: "IRSDATA", fields: "IRSDATA,CODE,NAME,CITY,ZIP,ADDRESS,ISACTIVE,UPDDATE", minimal: "IRSDATA,CODE,NAME", updField: "UPDDATE", intervalMinutes: DAY },
  { key: "vat", group: "Γεωγραφία & φορολογία", name: "Συντελεστές ΦΠΑ", table: "VAT", keyField: "VAT", fields: "VAT,NAME,PERCNT,ISACTIVE,MYDATACODE", minimal: "VAT,NAME,PERCNT", intervalMinutes: DAY },
  { key: "currencies", group: "Γεωγραφία & φορολογία", name: "Νομίσματα", table: "SOCURRENCY", keyField: "SOCURRENCY", fields: "SOCURRENCY,SHORTCUT,NAME,ISACTIVE", minimal: "SOCURRENCY,NAME", intervalMinutes: DAY },

  // ── Εμπορικά
  { key: "payments", group: "Εμπορικά", name: "Τρόποι πληρωμής", table: "PAYMENT", keyField: "PAYMENT", fields: "PAYMENT,CODE,NAME,ISACTIVE,MYDATACODE", minimal: "PAYMENT,CODE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "shipments", group: "Εμπορικά", name: "Τρόποι αποστολής", table: "SHIPMENT", keyField: "SHIPMENT", fields: "SHIPMENT,CODE,NAME,ISACTIVE", minimal: "SHIPMENT,CODE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "series", group: "Εμπορικά", name: "Σειρές παραστατικών", table: "SERIES", keyField: "SERIES", fields: "SERIES,CODE,NAME,SOSOURCE,FPRMS,ISACTIVE,UPDDATE", minimal: "SERIES,CODE,NAME", updField: "UPDDATE", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "trdcategories", group: "Εμπορικά", name: "Λογιστικές κατηγορίες πελατών", table: "TRDCATEGORY", keyField: "TRDCATEGORY", fields: "TRDCATEGORY,CODE,NAME,ISACTIVE", minimal: "TRDCATEGORY,CODE,NAME", filter: "COMPANY={COMPANY} AND SODTYPE=13", intervalMinutes: DAY },
  { key: "trdbusiness", group: "Εμπορικά", name: "Εμπορικές κατηγορίες πελατών", table: "TRDBUSINESS", keyField: "TRDBUSINESS", fields: "TRDBUSINESS,CODE,NAME,ISACTIVE", minimal: "TRDBUSINESS,CODE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "jobtypes", group: "Εμπορικά", name: "Επαγγέλματα", table: "JOBTYPE", keyField: "JOBTYPE", fields: "JOBTYPE,CODE,NAME,ISACTIVE", minimal: "JOBTYPE,CODE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "banks", group: "Εμπορικά", name: "Τράπεζες", table: "BANK", keyField: "BANK", fields: "BANK,CODE,NAME,COUNTRY,ISACTIVE,UPDDATE", minimal: "BANK,CODE,NAME", updField: "UPDDATE", intervalMinutes: DAY },
  { key: "warehouses", group: "Εμπορικά", name: "Αποθηκευτικοί χώροι", table: "WHOUSE", keyField: "WHOUSE", fields: "WHOUSE,SHORTCUT,NAME,CITY,ISACTIVE", minimal: "WHOUSE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },

  // ── Είδη & υπηρεσίες
  { key: "units", group: "Είδη & υπηρεσίες", name: "Μονάδες μέτρησης", table: "MTRUNIT", keyField: "MTRUNIT", fields: "MTRUNIT,SHORTCUT,NAME,ISACTIVE,MYDATACODE", minimal: "MTRUNIT,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "itemcategories", group: "Είδη & υπηρεσίες", name: "Εμπορικές κατηγορίες ειδών", table: "MTRCATEGORY", keyField: "MTRCATEGORY", fields: "MTRCATEGORY,CODE,NAME,VAT,ISACTIVE", minimal: "MTRCATEGORY,CODE,NAME", filter: "COMPANY={COMPANY} AND SODTYPE=51", intervalMinutes: DAY },
  { key: "srvcategories", group: "Είδη & υπηρεσίες", name: "Εμπορικές κατηγορίες υπηρεσιών", table: "MTRCATEGORY", keyField: "MTRCATEGORY", fields: "MTRCATEGORY,CODE,NAME,VAT,ISACTIVE", minimal: "MTRCATEGORY,CODE,NAME", filter: "COMPANY={COMPANY} AND SODTYPE=52", intervalMinutes: DAY },
  { key: "itemgroups", group: "Είδη & υπηρεσίες", name: "Ομάδες ειδών", table: "MTRGROUP", keyField: "MTRGROUP", fields: "MTRGROUP,CODE,NAME,ISACTIVE", minimal: "MTRGROUP,CODE,NAME", filter: "COMPANY={COMPANY} AND SODTYPE=51", intervalMinutes: DAY },
  { key: "brands", group: "Είδη & υπηρεσίες", name: "Μάρκες", table: "MTRMARK", keyField: "MTRMARK", fields: "MTRMARK,CODE,NAME,ISACTIVE", minimal: "MTRMARK,CODE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "manufacturers", group: "Είδη & υπηρεσίες", name: "Κατασκευαστές", table: "MTRMANFCTR", keyField: "MTRMANFCTR", fields: "MTRMANFCTR,CODE,NAME,ISACTIVE", minimal: "MTRMANFCTR,CODE,NAME", filter: "COMPANY={COMPANY}", intervalMinutes: DAY },
  { key: "items", group: "Είδη & υπηρεσίες", name: "Προϊόντα (είδη)", table: "MTRL", keyField: "MTRL", fields: "MTRL,CODE,CODE1,NAME,MTRUNIT1,VAT,MTRCATEGORY,MTRGROUP,MTRMARK,MTRMANFCTR,PRICER,PRICEW,ISACTIVE,UPDDATE", minimal: "MTRL,CODE,NAME,UPDDATE", updField: "UPDDATE", filter: "COMPANY={COMPANY} AND SODTYPE=51", intervalMinutes: 60 },
  { key: "services", group: "Είδη & υπηρεσίες", name: "Υπηρεσίες", table: "MTRL", keyField: "MTRL", fields: "MTRL,CODE,NAME,VAT,MTRCATEGORY,PRICER,PRICEW,ISACTIVE,UPDDATE", minimal: "MTRL,CODE,NAME,UPDDATE", updField: "UPDDATE", filter: "COMPANY={COMPANY} AND SODTYPE=52", intervalMinutes: 60 },

  // ── Συναλλασσόμενοι (customers are the built-in job)
  { key: "suppliers", group: "Συναλλασσόμενοι", name: "Προμηθευτές", table: "TRDR", keyField: "TRDR", fields: "TRDR,CODE,NAME,AFM,IRSDATA,EMAIL,PHONE01,ADDRESS,CITY,ZIP,COUNTRY,ISACTIVE,UPDDATE", minimal: "TRDR,CODE,NAME,UPDDATE", updField: "UPDDATE", filter: "COMPANY={COMPANY} AND SODTYPE=12", intervalMinutes: 60 },

  // ── Παραστατικά
  { key: "salesdocs", group: "Παραστατικά", name: "Παραστατικά πωλήσεων", table: "FINDOC", keyField: "FINDOC", fields: "FINDOC,FINCODE,SERIES,FPRMS,TRNDATE,TRDR,PAYMENT,NETAMNT,VATAMNT,SUMAMNT,ISCANCEL,UPDDATE", minimal: "FINDOC,FINCODE,TRNDATE,TRDR,SUMAMNT,UPDDATE", updField: "UPDDATE", filter: "COMPANY={COMPANY} AND SOSOURCE=1351", intervalMinutes: 15 },
  { key: "saleslines", group: "Παραστατικά", name: "Γραμμές παραστατικών πωλήσεων", table: "MTRLINES", keyField: "FINDOC,MTRLINES", fields: "FINDOC,MTRLINES,LINENUM,MTRL,QTY1,PRICE,DISC1PRC,LINEVAL,VAT,VATAMNT", minimal: "FINDOC,MTRLINES,MTRL,QTY1,LINEVAL", filter: "COMPANY={COMPANY} AND SOSOURCE=1351", intervalMinutes: DAY, enabled: false },
];

export function resolveFilter(filter: string | undefined, company: string) {
  if (!filter) return "";
  return /^\d+$/.test(company) ? filter.replaceAll("{COMPANY}", company) : stripCompany(filter);
}

/** Removes "COMPANY=…" clauses (for tables without a COMPANY column). */
export function stripCompany(filter: string) {
  return filter
    .split(/\s+AND\s+/i)
    .filter((c) => !/^\s*COMPANY\s*=/i.test(c))
    .join(" AND ");
}
