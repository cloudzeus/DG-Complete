// The services a package (plan) can include — shared by the server (enforcement) and the wizard.

export type ServiceKey = "workflows" | "recorder" | "api" | "bulk" | "webhooks" | "artifacts_long" | "ai" | "ai_repair";

export type ServiceDef = {
  key: ServiceKey;
  name: string;
  description: string;
  /** Tenant pages (slugs under /t/[tenant]/…) it opens. */
  pages: string[];
  requires?: ServiceKey[];
};

export const SERVICES: ServiceDef[] = [
  {
    key: "workflows",
    name: "Ροές",
    description: "Ροές καταχώρισης σε τρίτα web συστήματα, εκτέλεση με πλήρη logs και στιγμιότυπα σφαλμάτων.",
    pages: ["workflows", "runs", "targets"],
  },
  {
    key: "recorder",
    name: "Καταγραφή βημάτων",
    description: "Επέκταση browser που καταγράφει τα βήματα μιας καταχώρισης και τα μετατρέπει σε ροή.",
    pages: ["recordings"],
    requires: ["workflows"],
  },
  {
    key: "api",
    name: "Web services (API)",
    description: "Οι ροές ως μέθοδοι API με κλειδιά, συλλογές μεθόδων και τεκμηρίωση OpenAPI.",
    pages: ["api"],
    requires: ["workflows"],
  },
  {
    key: "bulk",
    name: "Μαζικές εκτελέσεις",
    description: "Μαζική εκτέλεση ροών από Excel / CSV με αντιστοίχιση στηλών και αναφορά αποτελεσμάτων.",
    pages: ["jobs"],
    requires: ["workflows"],
  },
  {
    key: "webhooks",
    name: "Webhooks",
    description: "Ειδοποιήσεις προς τα συστήματα του πελάτη όταν ολοκληρώνεται ή αποτυγχάνει μια εκτέλεση.",
    pages: ["webhooks"],
    requires: ["api"],
  },
  {
    key: "artifacts_long",
    name: "Μεγαλύτερη διατήρηση",
    description: "Μεγαλύτερος χρόνος διατήρησης για logs, στιγμιότυπα και αρχεία των εκτελέσεων.",
    pages: [],
    requires: ["workflows"],
  },
  {
    key: "ai",
    name: "Ανάλυση με AI",
    description: "Ανάλυση της σελίδας του συστήματος-στόχου με AI για προτάσεις πεδίων και επιλογέων.",
    pages: [],
    requires: ["workflows"],
  },
  {
    key: "ai_repair",
    name: "Αυτόματη επιδιόρθωση (AI)",
    description: "Προτάσεις διόρθωσης ροών με AI όταν αλλάζει η σελίδα του συστήματος-στόχου.",
    pages: [],
    requires: ["ai"],
  },
];

export const SERVICE_KEYS = SERVICES.map((s) => s.key);
export const serviceDef = (key: string) => SERVICES.find((s) => s.key === key);

/** Without a plan a tenant has no services. */
export const NO_PLAN_SERVICES: ServiceKey[] = [];

/** Adds what the chosen services require (recorder → workflows). */
export function withRequirements(keys: string[]): ServiceKey[] {
  const out = new Set(keys.filter((k): k is ServiceKey => SERVICE_KEYS.includes(k as ServiceKey)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const k of [...out])
      for (const r of serviceDef(k)?.requires ?? [])
        if (!out.has(r)) {
          out.add(r);
          grew = true;
        }
  }
  return SERVICE_KEYS.filter((k) => out.has(k));
}

// Always open: the overview and the notifications.
export const pagesOf = (services: Iterable<string>) => new Set(["", "notifications", ...[...services].flatMap((s) => serviceDef(s)?.pages ?? [])]);
