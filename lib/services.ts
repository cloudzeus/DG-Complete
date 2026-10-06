// The services a package (plan) can include — shared by the server (enforcement) and the wizard.

export type ServiceKey = "finance" | "sales" | "purchasing" | "geo" | "industry" | "kimon" | "purchase_orders" | "smart_orders" | "budget" | "reports" | "pricing" | "collections" | "anomalies" | "winback" | "negotiation" | "salespeople" | "api";

export type ServiceDef = {
  key: ServiceKey;
  name: string;
  description: string;
  /** Dashboard pages (slugs under /dashboards/[tenant]/…) it opens. */
  pages: string[];
  /** Cube cubes it opens (for the Cube token, the AI and the API). */
  cubes: string[];
  requires?: ServiceKey[];
};

export const SERVICES: ServiceDef[] = [
  {
    key: "finance",
    name: "Οικονομικά",
    description: "Αποτελέσματα χρήσης (P&L), ταμείο & τράπεζες, πρόβλεψη ταμειακών ροών, ανοιχτά υπόλοιπα.",
    pages: ["pnl", "cash", "working-capital", "planning"],
    cubes: ["pnl", "cash", "cash_forecast", "open_items"],
  },
  {
    key: "sales",
    name: "Πωλήσεις",
    description: "Πωλήσεις, προϊόντα με κέρδος και περιθώριο, πελάτες (RFM, απώλειες, εισπράξεις και αξιολόγηση πληρωμών).",
    pages: ["live", "sales", "products", "customers", "customer-insights", "profitability"],
    cubes: ["sales", "sales_lines", "customers"],
  },
  {
    key: "purchasing",
    name: "Αγορές & Αποθήκη",
    description: "Απόθεμα, νεκρό απόθεμα, προτάσεις παραγγελίας, αγορές, αξιολόγηση προμηθευτών και χρόνοι παράδοσης.",
    pages: ["stock", "stock-health", "purchases", "suppliers"],
    cubes: ["purchases", "purchase_lines", "items", "suppliers"],
  },
  {
    key: "geo",
    name: "Γεωγραφική ανάλυση",
    description: "Οι πωλήσεις πάνω στον χάρτη: τζίρος και συχνότητα αγορών ανά περιοχή, γεωγραφία μαρκών και κατηγοριών (geocoding των διευθύνσεων πελατών).",
    pages: ["geo"],
    cubes: ["geo_sales"],
    requires: ["sales"],
  },
  {
    key: "industry",
    name: "Κλαδική ανάλυση πελατών",
    description:
      "Οι πελάτες ανά κλάδο δραστηριότητας (ΚΑΔ από το μητρώο, κατηγοριοποίηση με AI): τι αγοράζει κάθε κλάδος, εποχικότητα, μάρκες, μέσος τζίρος και προφίλ — ποιο target group να στοχεύσετε.",
    pages: ["industry"],
    cubes: ["industry_sales"],
    requires: ["sales"],
  },
  {
    key: "kimon",
    name: "Κίμων — σύμβουλος AI",
    description: "Ο ψηφιακός σύμβουλος που απαντά σε ερωτήσεις με πίνακες, γραφήματα και προτάσεις, πάνω στα δεδομένα των υπηρεσιών του πακέτου.",
    pages: ["kimon"],
    cubes: [],
  },
  {
    key: "purchase_orders",
    name: "Παραγγελίες αγορών",
    description: "Παραγγελία ανά προμηθευτή από τις προτάσεις, με επεξεργασία και δημιουργία του παραστατικού απευθείας στο SoftOne.",
    pages: ["orders"],
    cubes: [],
    requires: ["purchasing"],
  },
  {
    key: "smart_orders",
    name: "Έξυπνες προτάσεις παραγγελίας (AI)",
    description:
      "Προτάσεις ανά μάρκα με τεκμηρίωση: πρόβλεψη ζήτησης (είδος × μάρκα × κατηγορία, εποχικότητα), εξάντληση έναντι του μετρημένου χρόνου παράδοσης, πωλήσεις σε κίνδυνο και εναλλακτικά είδη άλλων μαρκών με ποσοστό συμφωνίας από AI (καταναλώνει AI tokens).",
    pages: ["orders-smart"],
    cubes: [],
    requires: ["purchase_orders"],
  },
  {
    key: "budget",
    name: "Budget & στόχοι",
    description: "Στόχοι πωλήσεων και μικτού κέρδους ανά μήνα (με αυτόματη πρόταση από την τάση), σύγκριση με τα πραγματικά, πρόβλεψη κλεισίματος και τι χρειάζεται τους επόμενους μήνες για να πιαστεί ο στόχος.",
    pages: [],
    cubes: [],
    requires: ["finance"],
  },
  {
    key: "reports",
    name: "Αναφορές & report builder",
    description: "Έτοιμες αναφορές με κριτήρια και δημιουργία δικών σας με drag & drop: pivot tables, γραφήματα και πίνακες πάνω στα δεδομένα των υπηρεσιών του πακέτου, αποθήκευση, κοινή χρήση και εξαγωγή σε Excel / PDF.",
    pages: ["reports", "reports/builder"],
    cubes: [],
  },
  {
    key: "pricing",
    name: "Τιμολόγηση & εκπτώσεις (AI)",
    description:
      "Ελαστικότητα τιμής ανά είδος από το ιστορικό πωλήσεων, προτεινόμενη τιμή με το αναμενόμενο κέρδος, εκπτώσεις χωρίς λόγο (ομάδες πελατών με data mining), αυξήσεις κόστους που δεν περάστηκαν.",
    pages: ["pricing"],
    cubes: [],
    requires: ["sales"],
  },
  {
    key: "collections",
    name: "Βοηθός εισπράξεων (AI)",
    description: "Πρόβλεψη πότε θα πληρώσει κάθε πελάτης, βαθμός κινδύνου, προτεινόμενο πιστωτικό όριο, λίστα «ποιον να πάρετε τηλέφωνο σήμερα» και σχέδιο email υπενθύμισης με AI.",
    pages: ["collections"],
    cubes: [],
    requires: ["sales"],
  },
  {
    key: "anomalies",
    name: "Έξυπνες ειδοποιήσεις (AI)",
    description: "Εντοπίζει αυτόματα ό,τι ξεφεύγει από το συνηθισμένο — πτώσεις πωλήσεων, πελάτες που σταμάτησαν, λάθος τιμές, πτώση περιθωρίου — με βάση το μοτίβο του καθενός, και εξηγεί με AI γιατί.",
    pages: ["anomalies"],
    cubes: [],
    requires: ["sales"],
  },
  {
    key: "winback",
    name: "Επαναπροσέλκυση πελατών (AI)",
    description: "Πιθανότητα να χαθεί κάθε πελάτης, αξία σε κίνδυνο, μάρκες που σταμάτησε να αγοράζει, τι αγοράζουν οι όμοιοί του, και εξατομικευμένη πρόταση/email με AI.",
    pages: ["winback"],
    cubes: [],
    requires: ["sales"],
  },
  {
    key: "negotiation",
    name: "Διαπραγμάτευση προμηθευτών (AI)",
    description: "Για κάθε προμηθευτή: πορεία τιμών (δείκτης ίδιων ειδών), καθυστερήσεις, εξάρτηση, όροι πληρωμής και φάκελος διαπραγμάτευσης με συγκεκριμένα αιτήματα από το AI.",
    pages: ["negotiation"],
    cubes: [],
    requires: ["purchasing"],
  },
  {
    key: "salespeople",
    name: "Απόδοση χρηστών (AI)",
    description: "Για κάθε χρήστη του SoftOne που καταχωρεί παραστατικά πωλήσεων: τζίρος, περιθώριο, ποσοστό και ποσό εκπτώσεων, νέοι πελάτες, στυλ πώλησης (data mining), κατάταξη και προτάσεις με AI.",
    pages: ["salespeople"],
    cubes: [],
    requires: ["sales"],
  },
  {
    key: "api",
    name: "Web services (API)",
    description: "Πρόσβαση στα αποτελέσματα από την εφαρμογή του πελάτη με API keys: δείκτες, έτοιμα σύνολα δεδομένων και ερωτήματα.",
    pages: ["api"],
    cubes: [],
  },
];

export const SERVICE_KEYS = SERVICES.map((s) => s.key);
export const serviceDef = (key: string) => SERVICES.find((s) => s.key === key);

/** Without a plan a tenant keeps the dashboards and Κίμων; ERP writes and the API need a plan. */
export const NO_PLAN_SERVICES: ServiceKey[] = ["finance", "sales", "purchasing", "kimon"];

/** Adds what the chosen services require (purchase orders → purchasing). */
export function withRequirements(keys: string[]): ServiceKey[] {
  const out = new Set(keys.filter((k): k is ServiceKey => SERVICE_KEYS.includes(k as ServiceKey)));
  for (const k of [...out]) for (const r of serviceDef(k)?.requires ?? []) out.add(r);
  return SERVICE_KEYS.filter((k) => out.has(k));
}

export const cubesOf = (services: Iterable<string>) => [...new Set([...services].flatMap((s) => serviceDef(s)?.cubes ?? []))];
// Always open: the overview and the tenant's AI tokens.
export const pagesOf = (services: Iterable<string>) => new Set(["", "ai-tokens", "notifications", ...[...services].flatMap((s) => serviceDef(s)?.pages ?? [])]);
