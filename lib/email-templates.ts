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
  link: { key: "link", label: "Σύνδεσμος ενέργειας", sample: "https://complete.dgsmart.gr/reset-password?token=…" },
  loginUrl: { key: "loginUrl", label: "Σελίδα σύνδεσης", sample: "https://complete.dgsmart.gr/login" },
  amount: { key: "amount", label: "Ποσό", sample: "1.200,00 €" },
  period: { key: "period", label: "Περίοδος συνδρομής", sample: "ετήσια" },
  endsAt: { key: "endsAt", label: "Λήξη συνδρομής", sample: "31/12/2026" },
  daysLeft: { key: "daysLeft", label: "Ημέρες ως τη λήξη", sample: "14" },
  date: { key: "date", label: "Ημερομηνία πληρωμής", sample: "06/10/2026" },
  method: { key: "method", label: "Τρόπος πληρωμής", sample: "Τραπεζική μεταφορά" },
  description: { key: "description", label: "Περιγραφή", sample: "Ετήσια συνδρομή DG Complete 2027" },
  invoice: { key: "invoice", label: "Αριθμός παραστατικού", sample: "ΤΠΥ-Α 1024" },
  remaining: { key: "remaining", label: "Υπόλοιπο OpenRouter", sample: "$14,20" },
  threshold: { key: "threshold", label: "Όριο ειδοποίησης", sample: "$20,00" },
  tenantsLow: { key: "tenantsLow", label: "Πελάτες χωρίς tokens", sample: "ΑΦΟΙ ΠΑΡΑΔΕΙΓΜΑ ΑΕ (0 tokens)" },
  pending: { key: "pending", label: "Αιτήματα tokens σε αναμονή", sample: "2" },
  week: { key: "week", label: "Εβδομάδα", sample: "29/9 – 5/10" },
  flow: { key: "flow", label: "Ροή", sample: "Υποβολή αίτησης ΟΠΣΚΕ" },
  task: { key: "task", label: "Τι χρειάζεται", sample: "Πληκτρολογήστε τον κλειδάριθμο που έλαβε ο δικαιούχος με SMS." },
  minutes: { key: "minutes", label: "Λεπτά που απομένουν", sample: "15" },
  summary: {
    key: "summary",
    label: "Σύνοψη του Κίμωνα",
    sample: "**Η εβδομάδα με μια ματιά:** πωλήσεις 48.200 € (+12% έναντι της προηγούμενης).\n\n**Τι θέλει προσοχή**\n- 3 πελάτες άνω των 90 ημερών\n- 12 είδη τελειώνουν πριν την παράδοση\n\n**Τι να κάνετε**\n- Τηλεφωνήστε στον μεγαλύτερο ληξιπρόθεσμο πελάτη",
  },

} satisfies Record<string, TemplateVar>;

export const TEMPLATES: TemplateDef[] = [
  {
    key: "run_needs_attention",
    name: "Εκτέλεση περιμένει χειριστή",
    description: "Όταν μια εκτέλεση σταματά σε OTP ή CAPTCHA και χρειάζεται ενέργεια από τη σελίδα της (docs/22).",
    vars: [V.name, V.tenant, V.flow, V.task, V.minutes, V.link],
    subject: "Χρειάζεται ενέργεια: {{flow}}",
    body: `Γεια σας {{name}},

Η εκτέλεση της ροής **{{flow}}** ({{tenant}}) περιμένει χειριστή.

{{task}}

[[Άνοιγμα της εκτέλεσης|{{link}}]]

Αν δεν ολοκληρωθεί μέσα σε {{minutes}} λεπτά, η εκτέλεση σταματά χωρίς χρέωση.`,
  },
  {
    key: "password_reset",
    name: "Απώλεια κωδικού",
    description: "Όταν ο χρήστης πατά «Ξεχάσατε τον κωδικό;» στη σελίδα σύνδεσης.",
    vars: [V.name, V.email, V.link],
    subject: "Νέος κωδικός για το DG Complete",
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
    subject: "Καλώς ήρθατε στο DG Complete — {{tenant}}",
    body: `Γεια σας {{name}},

Σας δημιουργήθηκε λογαριασμός στο DG Complete για την εταιρεία **{{tenant}}**: ροές καταχώρισης σε web συστήματα, αυτόματη και μαζική εκτέλεση με πλήρη logs.

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
    subject: "Η συνδρομή σας στο DG Complete λήγει στις {{endsAt}}",
    body: `Γεια σας,

Η συνδρομή της εταιρείας **{{tenant}}** στο DG Complete λήγει σε **{{daysLeft}} ημέρες**, στις {{endsAt}}.

- Ποσό ανανέωσης: **{{amount}}**
- Περίοδος: {{period}}

Για να συνεχίσετε χωρίς διακοπή, παρακαλούμε φροντίστε την πληρωμή πριν από τη λήξη. Για οποιαδήποτε απορία απαντήστε σε αυτό το μήνυμα.

[[Μετάβαση στο DG Complete|{{loginUrl}}]]`,
  },
  {
    key: "payment_overdue",
    optional: true,
    name: "Υπενθύμιση πληρωμής (ληγμένη συνδρομή)",
    description: "Μετά τη λήξη, όσο δεν έχει καταχωρηθεί πληρωμή (οι ημέρες ορίζονται παραπάνω).",
    vars: [V.tenant, V.endsAt, V.amount, V.period],
    subject: "Εκκρεμεί η ανανέωση της συνδρομής — {{tenant}}",
    body: `Γεια σας,

Η συνδρομή της εταιρείας **{{tenant}}** στο DG Complete έληξε στις {{endsAt}} και δεν έχουμε λάβει ακόμα την πληρωμή ανανέωσης.

- Ποσό: **{{amount}}**
- Περίοδος: {{period}}

Παρακαλούμε τακτοποιήστε την πληρωμή ώστε να μη διακοπεί η πρόσβασή σας. Αν έχετε ήδη πληρώσει, αγνοήστε αυτό το μήνυμα — η πληρωμή θα καταχωρηθεί σύντομα.`,
  },
  {
    key: "payment_receipt",
    name: "Αποδεικτικό πληρωμής",
    description: "Όταν καταχωρείται πληρωμή συνδρομής.",
    vars: [V.tenant, V.amount, V.date, V.method, V.description, V.invoice, V.endsAt],
    subject: "Λάβαμε την πληρωμή σας ({{amount}}) — DG Complete",
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

TEMPLATES.push({
  key: "ai_credits_low",
  name: "Ειδοποίηση AI πιστώσεων (εσωτερικό)",
  description: "Προς εμάς, όταν το κεντρικό υπόλοιπο του OpenRouter πέσει κάτω από το όριο (Ρυθμίσεις → AI) — μία φορά την ημέρα.",
  vars: [V.remaining, V.threshold, V.tenantsLow, V.pending, V.link],
  subject: "AI: υπόλοιπο OpenRouter {{remaining}} — χρειάζεται αγορά πιστώσεων",
  body: `Το υπόλοιπο του λογαριασμού OpenRouter είναι **{{remaining}}**, κάτω από το όριο των {{threshold}}.

Αγοράστε πιστώσεις για να μη σταματήσουν ο Κίμων και οι υπόλοιπες λειτουργίες AI των πελατών.

- Πελάτες χωρίς tokens: {{tenantsLow}}
- Αιτήματα tokens σε αναμονή: {{pending}}

[[Άνοιγμα διαχείρισης|{{link}}]]`,
});

TEMPLATES.push({
  key: "ai_token_request",
  name: "Αίτημα πακέτου AI tokens (εσωτερικό)",
  description: "Προς εμάς, όταν ένας πελάτης ζητά πακέτο AI tokens — για τιμολόγηση και έγκριση.",
  vars: [V.tenant, V.amount, V.name, V.description, V.link],
  subject: "Αίτημα AI tokens — {{tenant}} ({{amount}})",
  body: `Ο πελάτης **{{tenant}}** ζήτησε πακέτο AI tokens.

- Πακέτο: **{{description}}**
- Ποσό: **{{amount}}**
- Από: {{name}}

Τιμολογήστε και, όταν πληρωθεί, εγκρίνετε το αίτημα για να προστεθούν τα tokens.

[[Άνοιγμα αιτημάτων|{{link}}]]`,
});

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
      // Runs of «- » lines become a list, the other lines a paragraph (a title above a list works).
      const out: string[] = [];
      let text: string[] = [];
      let items: string[] = [];
      const flush = (beforeList = false) => {
        if (text.length) out.push(`<p style="margin:0 0 ${beforeList ? 6 : 16}px">${text.map(inline).join("<br>")}</p>`);
        text = [];
      };
      const flushList = () => {
        if (items.length) out.push(`<ul style="margin:0 0 16px;padding-left:20px">${items.map((l) => `<li style="margin:4px 0">${inline(l)}</li>`).join("")}</ul>`);
        items = [];
      };
      for (const l of b.split("\n")) {
        if (/^\s*-\s/.test(l)) {
          flush(true);
          items.push(l.replace(/^\s*-\s/, ""));
        } else {
          flushList();
          text.push(l);
        }
      }
      flushList();
      flush();
      return out.join("");
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
<tr><td style="padding:22px 28px 6px;font-size:18px;font-weight:700;letter-spacing:-0.2px"><span style="color:${BRAND}">DG</span> <span style="color:#8a817a;font-weight:600">Complete</span></td></tr>
<tr><td style="padding:12px 28px 8px;font-size:15px;line-height:1.6">${bodyHtml(filledHtml)}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #efeae4;font-size:12px;line-height:1.5;color:#8a817a">DGsoft · DG Complete — αυτόματες καταχωρίσεις σε web συστήματα<br>Αυτό το μήνυμα στάλθηκε αυτόματα από το complete.dgsmart.gr.${opts.unsubscribeUrl ? `<br><a href="${esc(opts.unsubscribeUrl)}" style="color:#8a817a">Δεν θέλω να λαμβάνω υπενθυμίσεις</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
  const unsubscribe = opts.unsubscribeUrl ? `\nΔεν θέλω να λαμβάνω υπενθυμίσεις: ${opts.unsubscribeUrl}` : "";
  return { subject, html, text: `${bodyText(filledText)}\n\n— DG Complete · complete.dgsmart.gr${unsubscribe}` };
}

export const sampleVars = (t: TemplateDef): Vars => Object.fromEntries(t.vars.map((v) => [v.key, v.sample]));
