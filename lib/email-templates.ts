// Built-in email templates (Greek) and their rendering into a branded, email-safe HTML layout.
// The text is editable from Ρυθμίσεις → Email (email_template rows override these defaults).
//
// Body markup (kept deliberately small):
//   blank line → new paragraph · **bold** · lines starting with "- " → list
//   [[Button text|{{link}}]] → call-to-action button
//   {{var}} → value; a list line whose variables are all empty is dropped.

export type TemplateVar = { key: string; label: string; sample: string };
export type TemplateDef = {
  key: string;
  name: string;
  description: string;
  vars: TemplateVar[];
  subject: string;
  body: string;
  /** Reminders: the recipient can unsubscribe (link in the footer). Account and receipt emails always go out. */
  optional?: boolean;
};

const V = {
  name: { key: "name", label: "Όνομα παραλήπτη", sample: "Γιάννης Παπαδόπουλος" },
  email: { key: "email", label: "Email παραλήπτη", sample: "g.papadopoulos@example.gr" },
  tenant: { key: "tenant", label: "Εταιρεία", sample: "ΑΦΟΙ ΠΑΡΑΔΕΙΓΜΑ ΑΕ" },
  link: { key: "link", label: "Σύνδεσμος ενέργειας", sample: "https://bi.dgsmart.gr/reset-password?token=…" },
  loginUrl: { key: "loginUrl", label: "Σελίδα σύνδεσης", sample: "https://bi.dgsmart.gr/login" },
  amount: { key: "amount", label: "Ποσό", sample: "1.200,00 €" },
  period: { key: "period", label: "Περίοδος συνδρομής", sample: "ετήσια" },
  endsAt: { key: "endsAt", label: "Λήξη συνδρομής", sample: "31/12/2026" },
  daysLeft: { key: "daysLeft", label: "Ημέρες ως τη λήξη", sample: "14" },
  date: { key: "date", label: "Ημερομηνία πληρωμής", sample: "06/10/2026" },
  method: { key: "method", label: "Τρόπος πληρωμής", sample: "Τραπεζική μεταφορά" },
  description: { key: "description", label: "Περιγραφή", sample: "Ετήσια συνδρομή DGsmart BI 2027" },
  invoice: { key: "invoice", label: "Αριθμός παραστατικού", sample: "ΤΠΥ-Α 1024" },
} satisfies Record<string, TemplateVar>;

export const TEMPLATES: TemplateDef[] = [
  {
    key: "password_reset",
    name: "Απώλεια κωδικού",
    description: "Όταν ο χρήστης πατά «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης.",
    vars: [V.name, V.email, V.link],
    subject: "Νέος κωδικός για το DGsmart BI",
    body: `Γεια σας {{name}},

Λάβαμε αίτημα για νέο κωδικό στον λογαριασμό σας ({{email}}).

[[Ορισμός νέου κωδικού|{{link}}]]

Ο σύνδεσμος ισχύει για 1 ώρα. Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το μήνυμα — ο κωδικός σας δεν αλλάζει.`,
  },
  {
    key: "welcome",
    name: "Καλωσόρισμα νέου χρήστη",
    description: "Όταν δημιουργείται χρήστης σε πελάτη: σύνδεσμος για να ορίσει μόνος του τον κωδικό του.",
    vars: [V.name, V.email, V.tenant, V.link, V.loginUrl],
    subject: "Καλώς ήρθατε στο DGsmart BI — {{tenant}}",
    body: `Γεια σας {{name}},

Σας δημιουργήθηκε λογαριασμός στο DGsmart BI για την εταιρεία **{{tenant}}**: πωλήσεις, κερδοφορία, πελάτες, εισπράξεις, αποθήκη και ο ψηφιακός σύμβουλος Κίμων, με τα δεδομένα της εταιρείας σας.

Όνομα χρήστη: **{{email}}**

[[Ορισμός κωδικού και είσοδος|{{link}}]]

Ο σύνδεσμος ισχύει 7 ημέρες. Αν λήξει, πατήστε «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης: {{loginUrl}}`,
  },
  {
    key: "renewal_reminder",
    optional: true,
    name: "Υπενθύμιση ανανέωσης",
    description: "Πριν λήξει η συνδρομή (οι ημέρες ορίζονται παραπάνω). Στέλνεται στο email του πελάτη και στους διαχειριστές του.",
    vars: [V.tenant, V.endsAt, V.daysLeft, V.amount, V.period, V.loginUrl],
    subject: "Η συνδρομή σας στο DGsmart BI λήγει στις {{endsAt}}",
    body: `Γεια σας,

Η συνδρομή της εταιρείας **{{tenant}}** στο DGsmart BI λήγει σε **{{daysLeft}} ημέρες**, στις {{endsAt}}.

- Ποσό ανανέωσης: **{{amount}}**
- Περίοδος: {{period}}

Για να συνεχίσετε χωρίς διακοπή, παρακαλούμε φροντίστε την πληρωμή πριν από τη λήξη. Για οποιαδήποτε απορία απαντήστε σε αυτό το μήνυμα.

[[Μετάβαση στο DGsmart BI|{{loginUrl}}]]`,
  },
  {
    key: "payment_overdue",
    optional: true,
    name: "Υπενθύμιση πληρωμής (ληγμένη συνδρομή)",
    description: "Μετά τη λήξη, όσο δεν έχει καταχωρηθεί πληρωμή (οι ημέρες ορίζονται παραπάνω).",
    vars: [V.tenant, V.endsAt, V.amount, V.period],
    subject: "Εκκρεμεί η ανανέωση της συνδρομής — {{tenant}}",
    body: `Γεια σας,

Η συνδρομή της εταιρείας **{{tenant}}** στο DGsmart BI έληξε στις {{endsAt}} και δεν έχουμε λάβει ακόμα την πληρωμή ανανέωσης.

- Ποσό: **{{amount}}**
- Περίοδος: {{period}}

Παρακαλούμε τακτοποιήστε την πληρωμή ώστε να μη διακοπεί η πρόσβασή σας. Αν έχετε ήδη πληρώσει, αγνοήστε αυτό το μήνυμα — η πληρωμή θα καταχωρηθεί σύντομα.`,
  },
  {
    key: "payment_receipt",
    name: "Αποδεικτικό πληρωμής",
    description: "Όταν καταχωρείται πληρωμή συνδρομής.",
    vars: [V.tenant, V.amount, V.date, V.method, V.description, V.invoice, V.endsAt],
    subject: "Λάβαμε την πληρωμή σας ({{amount}}) — DGsmart BI",
    body: `Γεια σας,

Λάβαμε την πληρωμή σας — ευχαριστούμε!

- Εταιρεία: {{tenant}}
- Ποσό: **{{amount}}**
- Ημερομηνία: {{date}}
- Τρόπος: {{method}}
- Περιγραφή: {{description}}
- Παραστατικό: {{invoice}}
- Η συνδρομή ισχύει έως: **{{endsAt}}**

Το παραστατικό θα το λάβετε και από το λογιστήριό μας.`,
  },
];

export const templateDef = (key: string) => TEMPLATES.find((t) => t.key === key);

export type Vars = Record<string, string | number | null | undefined>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const val = (vars: Vars, k: string) => {
  const v = vars[k];
  return v === null || v === undefined ? "" : String(v);
};
const fill = (s: string, vars: Vars) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => val(vars, k));

export function renderSubject(subject: string, vars: Vars) {
  return fill(subject, vars).replace(/\s+/g, " ").trim();
}

/** Drops list lines whose variables all came out empty (e.g. no invoice number yet). */
function dropEmptyLines(body: string, vars: Vars) {
  return body
    .split("\n")
    .filter((line) => {
      if (!/^\s*-\s/.test(line)) return true;
      const keys = [...line.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
      return keys.length === 0 || keys.some((k) => val(vars, k).trim() !== "");
    })
    .join("\n");
}

const BRAND = "#E31E2A";
const BLUE = "#0078D4";

function inline(html: string) {
  return html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/** Body → HTML blocks (variables already filled and escaped). */
function bodyHtml(body: string) {
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const b = block.trim();
      if (!b) return "";
      const button = /^\[\[(.+?)\|(.+?)\]\]$/.exec(b);
      if (button) {
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr><td style="border-radius:6px;background:${BLUE}"><a href="${button[2].trim()}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${inline(button[1].trim())}</a></td></tr></table>`;
      }
      const lines = b.split("\n");
      if (lines.every((l) => /^\s*-\s/.test(l))) {
        return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:4px 0">${inline(l.replace(/^\s*-\s/, ""))}</li>`).join("")}</ul>`;
      }
      return `<p style="margin:0 0 16px">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
}

/** Plain-text part: markup removed, buttons as "Text: URL". */
function bodyText(body: string) {
  return body
    .replace(/\[\[(.+?)\|(.+?)\]\]/g, "$1: $2")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .trim();
}

export function renderEmail(t: { subject: string; body: string }, vars: Vars, opts: { unsubscribeUrl?: string } = {}) {
  const filledText = fill(dropEmptyLines(t.body, vars), vars);
  const escapedVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v === null || v === undefined ? v : esc(String(v))]));
  const filledHtml = fill(esc(dropEmptyLines(t.body, vars)).replace(/&quot;/g, '"'), escapedVars);
  const subject = renderSubject(t.subject, vars);
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3f0;font-family:'Segoe UI',Inter,Arial,sans-serif;color:#2b2724">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e7e2dc">
<tr><td style="height:4px;background:${BRAND};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 6px;font-size:18px;font-weight:700;letter-spacing:-0.2px"><span style="color:${BRAND}">DG</span>smart <span style="color:#8a817a;font-weight:600">BI</span></td></tr>
<tr><td style="padding:12px 28px 8px;font-size:15px;line-height:1.6">${bodyHtml(filledHtml)}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #efeae4;font-size:12px;line-height:1.5;color:#8a817a">DGsoft · DGsmart BI — επιχειρηματική ευφυΐα για τα δεδομένα του SoftOne σας<br>Αυτό το μήνυμα στάλθηκε αυτόματα από το bi.dgsmart.gr.${opts.unsubscribeUrl ? `<br><a href="${esc(opts.unsubscribeUrl)}" style="color:#8a817a">Δεν θέλω να λαμβάνω υπενθυμίσεις</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
  const unsubscribe = opts.unsubscribeUrl ? `\nΔεν θέλω να λαμβάνω υπενθυμίσεις: ${opts.unsubscribeUrl}` : "";
  return { subject, html, text: `${bodyText(filledText)}\n\n— DGsmart BI · bi.dgsmart.gr${unsubscribe}` };
}

export const sampleVars = (t: TemplateDef): Vars => Object.fromEntries(t.vars.map((v) => [v.key, v.sample]));
