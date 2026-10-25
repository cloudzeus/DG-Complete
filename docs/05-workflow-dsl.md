# 05 — Workflow DSL

Ο ορισμός μιας ροής είναι **JSON** που επικυρώνεται από zod schemas στο `lib/dsl`. Το ίδιο πακέτο χρησιμοποιούν: web (editor, validation), worker (εκτέλεση), extension (τύποι events), SDK (τύποι input).

## 1. Δομή

```ts
export const WorkflowDefinition = z.object({
  dslVersion: z.literal(1),
  name: z.string(),
  description: z.string().optional(),
  targetSystemSlug: z.string(),
  login: z.object({                     // πώς εξασφαλίζεται σύνδεση
    mode: z.enum(["none", "workflow", "reuseSession"]),
    workflowSlug: z.string().optional(), // ροή isLoginFlow
    sessionCheck: Locator.optional(),    // στοιχείο που αποδεικνύει ότι είμαστε συνδεδεμένοι
  }).default({ mode: "none" }),
  inputs: z.array(InputField),          // → JSON Schema (inputSchema)
  outputs: z.array(OutputField),        // → outputSchema
  vars: z.record(z.string(), z.unknown()).default({}), // σταθερές
  settings: z.object({
    defaultTimeoutMs: z.number().default(15000),
    navigationTimeoutMs: z.number().default(30000),
    slowMoMs: z.number().default(0),
    locale: z.string().default("el-GR"),
    timezone: z.string().default("Europe/Athens"),
    viewport: z.object({ width: z.number(), height: z.number() }).default({ width: 1440, height: 900 }),
  }).default({}),
  steps: z.array(Step).min(1),
  onError: z.array(Step).default([]),   // π.χ. logout, κλείσιμο modal — τρέχει best-effort
});
```

### InputField
```ts
export const InputField = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/),     // afm, invoiceDate, lines
  label: z.string(),                                 // «ΑΦΜ»
  type: z.enum(["string","number","integer","boolean","date","datetime","enum","array","object","file"]),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),             // masking σε logs/screenshots/UI
  pii: z.boolean().default(false),
  format: z.string().optional(),                     // email, afm-gr, iban, phone-gr
  pattern: z.string().optional(),
  enum: z.array(z.string()).optional(),
  min: z.number().optional(), max: z.number().optional(),
  items: z.lazy(() => InputField).optional(),        // για array
  properties: z.lazy(() => z.array(InputField)).optional(), // για object
  example: z.unknown().optional(),
  description: z.string().optional(),
});
```
Ειδικοί validators: `afm-gr` (αλγόριθμος ελέγχου ΑΦΜ), `iban`, `phone-gr`, `amka`.

## 2. Locator

```ts
export const Locator = z.object({
  candidates: z.array(LocatorCandidate).min(1),      // ίδιο με recorder (docs/04 §3)
  frame: z.array(z.string()).default([]),
  nth: z.number().int().optional(),
  within: z.lazy(() => Locator).optional(),          // scoped αναζήτηση (π.χ. μέσα σε γραμμή πίνακα)
  description: z.string().optional(),                // ανθρώπινη περιγραφή για logs
});
```
Templates επιτρέπονται και μέσα σε locators: `{ kind: "text", value: "{{item.code}}" }`.

## 3. Τύποι βημάτων

Κοινά πεδία: `id`, `type`, `label`, `timeoutMs?`, `optional?` (αν αποτύχει → SKIPPED), `retry?: { attempts, delayMs }`, `screenshot?: "always"|"onError"|"never"`, `when?: Expression` (εκτελείται μόνο αν true).

| type | Πεδία | Περιγραφή |
|---|---|---|
| `navigate` | `url` | Πλοήγηση (σχετικό URL → baseUrl) |
| `click` | `locator`, `button?`, `clickCount?`, `waitForNavigation?` | |
| `fill` | `locator`, `value`, `clear=true`, `typeDelayMs?`, `pressAfter?` | `typeDelayMs>0` → `pressSequentially` (για autocomplete fields) |
| `select` | `locator`, `by: "value"\|"label"`, `value` | |
| `choose` | `locator`, `widget: native\|combobox\|autocomplete\|custom`, `value`, `by`, `match: exact\|normalized\|contains\|startsWith`, `dependsOn[]`, `waitForOptions`, `searchText?`, `optionLocator?`, `onMissing` | Λίστες με εξαρτήσεις (cascading) και custom widgets — docs/25. Εκτελούνται σε τοπολογική σειρά του `dependsOn` |
| `check` / `uncheck` | `locator` | |
| `press` | `locator?`, `key` | |
| `upload` | `locator`, `file` (template σε input τύπου file) | |
| `waitFor` | `locator?` + `state` (visible/hidden/attached/detached) **ή** `url` (glob/regex) **ή** `loadState` **ή** `ms` (μόνο έως 10s) | |
| `assert` | `locator?`, `check: "visible"\|"hidden"\|"textEquals"\|"textContains"\|"valueEquals"\|"urlMatches"\|"count"`, `expected`, `errorMessage` | Αποτυχία → `E_ASSERTION_FAILED` |
| `extract` | `locator`, `from: "text"\|"value"\|"attribute"\|"url"\|"table"`, `attribute?`, `regex?`, `into: "output.x"\|"vars.y"`, `transform?` | |
| `extractTable` | `source` (dom \| download), `rows`, `columns[]` (key, header, type, format, from, key‑flag), `filter`, `limit`, `pagination`, `perRow`, `into` | Πίνακας/λίστα → array γραμμών με τύπους, σελιδοποίηση, λεπτομέρειες ανά γραμμή — docs/26 |
| `extractFields` | `scope` (locator ενότητας), `fields[]` (label → key, type) | Στοιχεία καρτέλας label→τιμή, locator σχετικός με το label — docs/26 §3 |
| `setVar` | `name`, `value` (Expression) | |
| `if` | `condition` (Expression ή `{ exists: Locator }`), `then: Step[]`, `else?: Step[]` | |
| `forEach` | `items` (Expression → array), `as: "item"`, `steps: Step[]`, `maxIterations=500` | π.χ. γραμμές τιμολογίου |
| `callWorkflow` | `workflowSlug`, `version?`, `inputs` | Sub‑flow (login, άνοιγμα μενού) |
| `switchTab` | `match: { urlContains? , index? }` \| `"opener"` | |
| `dialog` | `action: accept\|dismiss`, `promptText?` | Δηλώνεται **πριν** από το βήμα που ανοίγει το dialog |
| `screenshot` | `name`, `fullPage?` | Ρητό στιγμιότυπο (π.χ. απόδειξη υποβολής) |
| `humanTask` | `instructions`, `fields?`, `timeoutSec=900` | Run → NEEDS_ATTENTION· ο χειριστής ολοκληρώνει από UI (OTP, CAPTCHA) |
| `checkTargetErrors` | — | Ελέγχει τα `errorDetectors` του TargetSystem· αν βρεθεί μήνυμα → `E_TARGET_VALIDATION` |

### Παράδειγμα
```json
{
  "dslVersion": 1,
  "name": "Καταχώριση πελάτη",
  "targetSystemSlug": "sandbox-erp",
  "login": { "mode": "workflow", "workflowSlug": "sandbox-login",
             "sessionCheck": { "candidates": [{ "kind": "testId", "value": "user-menu" }] } },
  "inputs": [
    { "key": "afm", "label": "ΑΦΜ", "type": "string", "format": "afm-gr", "example": "094014201" },
    { "key": "name", "label": "Επωνυμία", "type": "string" },
    { "key": "city", "label": "Πόλη", "type": "string", "required": false },
    { "key": "contacts", "label": "Επαφές", "type": "array", "required": false,
      "items": { "key": "contact", "label": "Επαφή", "type": "object",
        "properties": [ { "key": "email", "label": "Email", "type": "string", "format": "email", "pii": true } ] } }
  ],
  "outputs": [ { "key": "customerCode", "label": "Κωδικός πελάτη", "type": "string" } ],
  "steps": [
    { "id": "s01", "type": "navigate", "label": "Άνοιγμα νέου πελάτη", "url": "/customers/new" },
    { "id": "s02", "type": "fill", "label": "Συμπλήρωση ΑΦΜ",
      "locator": { "candidates": [{ "kind": "label", "value": "ΑΦΜ" }, { "kind": "css", "value": "input[name=afm]" }] },
      "value": "{{input.afm}}" },
    { "id": "s03", "type": "fill", "label": "Συμπλήρωση επωνυμίας",
      "locator": { "candidates": [{ "kind": "label", "value": "Επωνυμία" }] }, "value": "{{input.name | trim | upper}}" },
    { "id": "s04", "type": "fill", "label": "Πόλη", "when": "input.city != null",
      "locator": { "candidates": [{ "kind": "label", "value": "Πόλη" }] }, "value": "{{input.city}}" },
    { "id": "s05", "type": "forEach", "label": "Επαφές", "items": "input.contacts ?? []", "as": "c", "steps": [
      { "id": "s05a", "type": "click", "label": "Νέα επαφή",
        "locator": { "candidates": [{ "kind": "role", "role": "button", "name": "Προσθήκη επαφής" }] } },
      { "id": "s05b", "type": "fill", "label": "Email επαφής",
        "locator": { "candidates": [{ "kind": "css", "value": "[data-row]:last-child input[type=email]" }] },
        "value": "{{c.email}}" }
    ]},
    { "id": "s06", "type": "click", "label": "Αποθήκευση",
      "locator": { "candidates": [{ "kind": "role", "role": "button", "name": "Αποθήκευση" }] } },
    { "id": "s07", "type": "checkTargetErrors", "label": "Έλεγχος μηνυμάτων συστήματος" },
    { "id": "s08", "type": "assert", "label": "Επιβεβαίωση αποθήκευσης", "check": "visible",
      "locator": { "candidates": [{ "kind": "text", "value": "Ο πελάτης αποθηκεύτηκε" }] },
      "errorMessage": "Δεν εμφανίστηκε μήνυμα επιτυχίας" },
    { "id": "s09", "type": "extract", "label": "Κωδικός πελάτη", "from": "text",
      "locator": { "candidates": [{ "kind": "testId", "value": "customer-code" }] }, "into": "output.customerCode" }
  ]
}
```

## 4. Expressions & templates

- **Templates** μέσα σε strings: `{{ path | filter:arg }}`.
- **Expressions** (σε `when`, `condition`, `items`, `setVar.value`): μικρό, ασφαλές subset — υλοποίηση με **`jsep`** parser + δικός μας evaluator (χωρίς `eval`/`Function`).
  - Τελεστές: `== != > >= < <= && || ! ?? + - * / %`, member access, literals.
  - Scopes: `input`, `vars`, `output`, `secrets` (μόνο σε templates fill/τιμές — όχι σε `when`), `env` (`now`, `today`, `runId`), loop variable.
- **Filters** (whitelist): `trim`, `upper`, `lower`, `default:x`, `date:'dd/MM/yyyy'` (date-fns, locale el), `number:'0,0.00'` (ελληνική μορφή `1.234,56`), `pad:10:'0'`, `replace:'a':'b'`, `substr:0:10`, `json`, `join:', '`, `greekUpper` (κεφαλαία χωρίς τόνους — συχνό σε παλιά ERP).
- Λάθος template → validation error στο publish (στατικός έλεγχος ότι κάθε `input.x` υπάρχει στα inputs).

## 5. Validation στο publish

`dsl.validateForPublish(def)` επιστρέφει λίστα `Issue { severity, stepId, code, message }`:
- σχήμα zod έγκυρο,
- μοναδικά step ids,
- όλες οι αναφορές `input.*` υπάρχουν· τα required inputs χρησιμοποιούνται,
- κάθε output γράφεται από τουλάχιστον ένα `extract`/`setVar`,
- `forEach.maxIterations` ≤ 1000, βάθος nesting ≤ 4,
- κανένα locator μόνο με `xpath` (warning),
- `secrets.*` μόνο σε `fill.value`,
- όλα τα URLs ανήκουν στα `allowedOrigins`.

## 6. Versioning

- `Workflow.latestVersionNo` αυξάνεται σε κάθε νέο draft.
- Μόνο **ένα DRAFT** ανά workflow κάθε στιγμή· η επεξεργασία γίνεται πάντα σε αυτό (autosave κάθε 2s με optimistic concurrency `updatedAt`).
- **Υποβολή για έγκριση** (Designer) → `PENDING_APPROVAL` (απαιτείται επιτυχημένο test run, `validateForPublish` χωρίς errors) → **έγκριση από TENANT_ADMIN** → `status=PUBLISHED`, `checksum`, `approvedById`, `publishedAt`· απόρριψη → πίσω σε `DRAFT` με `rejectedReason`. Αν ο συντάκτης είναι ο ίδιος TENANT_ADMIN, δημοσιεύει απευθείας (καταγράφεται στο audit).
- Μετά τη δημοσίευση τα methods **δεν** αλλάζουν αυτόματα έκδοση: το UI προτείνει «Αναβάθμιση μεθόδων σε v3» με diff των input schemas και προειδοποίηση για **breaking changes** (νέο required input, αφαίρεση output).
- **Diff view**: side‑by‑side των βημάτων (jsondiffpatch) + diff του input schema.
- `DEPRECATED`: εκτελείται ακόμη, αλλά το API επιστρέφει header `Deprecation: true`.

## 7. Μετατροπή σε JSON Schema / OpenAPI

`dsl.toJsonSchema(inputs)` → JSON Schema 2020‑12 (αποθηκεύεται στο `inputSchema`), χρησιμοποιείται:
- για validation στο API (Ajv 8, compiled & cached ανά versionId),
- για την παραγωγή OpenAPI (docs/07),
- για τη φόρμα «Χειροκίνητη εκτέλεση» στο UI (auto‑form από schema),
- για την αντιστοίχιση στηλών CSV/XLSX.
