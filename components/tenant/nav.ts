// Tenant area IA (docs/09 §2). Shared by the server (filtering) and the client sidebar (rendering).

export type NavIcon =
  | "dashboard" | "targets" | "recordings" | "workflows" | "collections" | "jobs" | "runs" | "attention"
  | "approvals" | "keys" | "webhooks" | "members" | "audit" | "usage" | "settings";

export type NavItem = { href: string; label: string; icon: NavIcon; service?: string; adminOnly?: boolean; badge?: "attention" | "approvals"; exact?: boolean };

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Επισκόπηση", items: [{ href: "", label: "Πίνακας ελέγχου", icon: "dashboard", exact: true }] },
  {
    label: "Σχεδιασμός",
    items: [
      { href: "/targets", label: "Συστήματα‑στόχοι", icon: "targets", service: "workflows" },
      { href: "/recordings", label: "Καταγραφές", icon: "recordings", service: "recorder" },
      { href: "/workflows", label: "Ροές", icon: "workflows", service: "workflows" },
    ],
  },
  {
    label: "Εκτέλεση",
    items: [
      { href: "/collections", label: "Συλλογές μεθόδων", icon: "collections", service: "api" },
      { href: "/jobs", label: "Μαζικές εργασίες", icon: "jobs", service: "bulk" },
      { href: "/runs", label: "Εκτελέσεις", icon: "runs", service: "workflows" },
      { href: "/attention", label: "Προς ενέργεια", icon: "attention", service: "workflows", badge: "attention" },
      { href: "/approvals", label: "Εγκρίσεις", icon: "approvals", adminOnly: true, badge: "approvals" },
    ],
  },
  {
    label: "Διαχείριση",
    items: [
      { href: "/settings/api-keys", label: "Κλειδιά API", icon: "keys", service: "api", adminOnly: true },
      { href: "/settings/webhooks", label: "Webhooks", icon: "webhooks", service: "webhooks", adminOnly: true },
      { href: "/settings/members", label: "Μέλη & ρόλοι", icon: "members", adminOnly: true },
      { href: "/settings/audit", label: "Αρχείο ενεργειών", icon: "audit", adminOnly: true },
      { href: "/usage", label: "Χρήση & πακέτο", icon: "usage" },
      { href: "/settings", label: "Ρυθμίσεις", icon: "settings", adminOnly: true, exact: true },
    ],
  },
];
