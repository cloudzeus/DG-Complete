# 04 — Καταγραφή βημάτων (Recorder)

## 1. Επιλογή προσέγγισης

| Επιλογή | Υπέρ | Κατά | Φάση |
|---|---|---|---|
| **A. Chrome/Edge extension (MV3)** | Ο χρήστης καταγράφει στο δικό του, ήδη συνδεδεμένο browser· βλέπει VPN/εσωτερικά δίκτυα· φυσική εμπειρία | Εγκατάσταση extension | **MVP** |
| B. Remote browser (Playwright στον server, stream μέσω CDP screencast) | Μηδενική εγκατάσταση, ίδιο περιβάλλον με την εκτέλεση | Latency, πολυπλοκότητα input forwarding | Φάση 3 |
| C. Import από Playwright codegen / Chrome DevTools Recorder JSON | Δωρεάν power‑user path | Χειροκίνητο | MVP (import) |

Το **Chrome DevTools Recorder** εξάγει JSON (`@puppeteer/replay` format) — υποστηρίζουμε import του ως `RecordingSource.IMPORT`.

## 2. Αρχιτεκτονική extension (WXT)

```
extension/      (στο repo dg-complete)
├─ entrypoints/
│  ├─ background.ts        # service worker: session state, batching, upload, tab tracking
│  ├─ content.ts           # inject σε κάθε frame: event listeners, locator generation, highlight
│  ├─ sidepanel/           # React UI (DG theme): λίστα βημάτων live, pause, mark-as-variable, assertion picker
│  └─ popup/               # σύνδεση με λογαριασμό (recorder token), επιλογή καταγραφής
├─ lib/locators.ts         # παραγωγή υποψήφιων locators (κοινός κώδικας με ../lib/engine)
├─ lib/events.ts           # τύποι RecorderEvent (import από ../lib/dsl)
└─ wxt.config.ts           # permissions: activeTab, scripting, sidePanel, storage; host_permissions από allowedOrigins
```

### Σύνδεση με την πλατφόρμα
1. Στο web: «Νέα καταγραφή» → επιλογή Συστήματος‑στόχου → η πλατφόρμα δημιουργεί `Recording` και **recorder token** (JWT 2h, scope `recording:{id}:write`).
2. Το web ανοίγει deep‑link `https://{tenant}.autofill.../recorder/connect?token=…` το οποίο το extension πιάνει (externally_connectable) — ή ο χρήστης κάνει paste τον κωδικό 8 χαρακτήρων.
3. Το extension ανοίγει νέο tab στο `startUrl`, εμφανίζει side panel και αρχίζει.

## 3. Τι καταγράφεται

| DOM event | RecorderEvent.type | Σημειώσεις |
|---|---|---|
| navigation (webNavigation.onCommitted) | `navigate` | Μόνο top frame· διάκριση typed vs link |
| `click` (capture phase) | `click` | Αγνοούνται clicks σε `<label>` που οδηγούν σε input (συγχώνευση) |
| `input` / `change` σε text | `fill` | Debounce· τελική τιμή μόνο· `type=password` → σημαία `sensitive` και η τιμή **δεν** στέλνεται |
| `change` σε `<select>` | `select` | value + label |
| checkbox/radio | `check` / `uncheck` | |
| `keydown` Enter/Tab/Escape | `press` | Μόνο «σημαντικά» πλήκτρα |
| `<input type=file>` | `upload` | Καταγράφεται όνομα αρχείου, γίνεται παράμετρος |
| popup/new tab | `switchTab` | |
| iframe | `frame` path στο locator | |
| alert/confirm | `dialog` | accept/dismiss |
| χειροκίνητο από side panel | `assert`, `extract`, `waitFor`, `comment` | Ο χρήστης κάνει hover → Alt+click πάνω σε στοιχείο |

### RecorderEvent (zod, στο `lib/dsl/recorder.ts`)
```ts
export const LocatorCandidate = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("testId"), value: z.string() }),            // data-testid, data-qa, data-cy
  z.object({ kind: z.literal("role"), role: z.string(), name: z.string(), exact: z.boolean().default(true) }),
  z.object({ kind: z.literal("label"), value: z.string() }),              // <label for> / aria-labelledby
  z.object({ kind: z.literal("placeholder"), value: z.string() }),
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("css"), value: z.string() }),                // σταθερό CSS (id, name, attrs)
  z.object({ kind: z.literal("xpath"), value: z.string() }),              // τελευταία λύση
]);

export const RecorderEvent = z.object({
  id: z.string(),                       // ulid
  ts: z.number(),                       // ms από την έναρξη
  type: z.enum(["navigate","click","fill","select","check","uncheck","press","upload",
                "switchTab","dialog","assert","extract","waitFor","comment"]),
  url: z.string(),
  frame: z.array(z.string()).default([]),    // αλυσίδα iframe selectors
  target: z.object({
    candidates: z.array(LocatorCandidate).min(1),
    tag: z.string(), inputType: z.string().optional(),
    attributes: z.record(z.string(), z.string()),  // name, id, aria-*, κ.λπ. (whitelist)
    text: z.string().max(200).optional(),
    labelText: z.string().optional(),               // για αυτόματη ονομασία μεταβλητής
    bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  }).optional(),
  value: z.string().optional(),               // απουσιάζει αν sensitive
  sensitive: z.boolean().default(false),
  key: z.string().optional(),
  thumbnail: z.string().optional(),           // data URL JPEG 320px (captureVisibleTab) — για το editor
  meta: z.record(z.string(), z.unknown()).optional(),
});
```

> **Λίστες και εξαρτώμενα πεδία:** για κάθε επιλογή σε λίστα ο recorder κρατά widget, label και value, snapshot επιλογών και τα `effects` της (ποιες άλλες λίστες ανανεώθηκαν ή μηδενίστηκαν, ποια πεδία εμφανίστηκαν, ποιο request έγινε), και δείχνει ζωντανά την αλυσίδα εξαρτήσεων στο side panel — docs/25 §1.

## 4. Παραγωγή locators (ιεράρχηση)

Για κάθε στοιχείο παράγουμε **όλους** τους υποψήφιους και τους βαθμολογούμε:

1. `testId` (data-testid/data-qa/data-cy/data-test) — score 100
2. `role` + accessible name (μέσω `dom-accessibility-api`) — 90
3. `label` — 85
4. `placeholder` — 70
5. `css` με `#id` (αν το id δεν μοιάζει auto‑generated: regex για hash/αριθμούς) ή `[name=…]` — 65
6. `text` (για buttons/links) — 60
7. `css` δομικό (σύντομο, μοναδικό) — 40
8. `xpath` — 20

Κανόνες: κάθε υποψήφιος ελέγχεται για **μοναδικότητα** στη σελίδα τη στιγμή της καταγραφής· μη μοναδικοί κρατιούνται μόνο με `nth`. Στην εκτέλεση ο engine δοκιμάζει με σειρά score (βλ. 06 §4 — *self‑healing light*).

Ειδικά για παλιά ERP/ASP.NET (π.χ. `ctl00_ContentPlaceHolder1_txtAFM`): αναγνωρίζουμε prefixes `ctl00_`, `j_idt`, `ext-gen` ως «ασταθή» και προτιμάμε `name`/label.

## 5. Compile: Recording → Workflow draft

`lib/dsl/compile-recording.ts`:

1. **Καθαρισμός:** συγχώνευση διαδοχικών `fill` στο ίδιο πεδίο, αφαίρεση clicks που ακολουθούνται από fill στο ίδιο στοιχείο, αφαίρεση άσκοπων navigations (redirects).
2. **Login detection:** αν τα πρώτα βήματα περιέχουν password πεδίο → πρόταση εξαγωγής σε ξεχωριστή «Ροή σύνδεσης» (`isLoginFlow`) με `{{secrets.username}}`/`{{secrets.password}}`.
3. **Αυτόματη παραμετροποίηση:** κάθε `fill`/`select` γίνεται υποψήφια **μεταβλητή εισόδου**: όνομα από `labelText` → slug (`ΑΦΜ` → `afm`, `Ημερομηνία έκδοσης` → `imerominia_ekdosis` — transliteration ελληνικών με `greek-utils`), τύπος από `inputType` (date → `string/format:date`, number → `number`), η καταγεγραμμένη τιμή → `example`.
4. **Waits:** μετά από `click` που προκάλεσε navigation → `waitFor: { url }` ή `networkidle`· πριν από κάθε ενέργεια το engine κάνει auto‑wait (Playwright actionability), οπότε δεν προσθέτουμε χρονικά waits.
5. **Παραγωγή step ids** σταθερών (`s_01_fill_afm`) και labels στα ελληνικά («Συμπλήρωση ΑΦΜ»).
6. Αποτέλεσμα: `WorkflowDefinition` (docs/05) αποθηκευμένο ως `WorkflowVersion v1 DRAFT`.

## 6. UX του side panel (DG)

- Πάνω: κατάσταση (● Καταγραφή — κόκκινη κουκκίδα `--dg-red-500`, χωρίς animation pulse πέρα από 1 s fade), χρόνος, κουμπιά **Παύση** / **Ολοκληρώθηκε** — κάθε καταγραφή είναι μία ολοκληρωμένη κίνηση· μετά το «Ολοκληρώθηκε» ακολουθούν πρόταση τύπου κίνησης/ονόματος/slug/HTTP method και ορατή επανάληψη (docs/24).
- Λίστα βημάτων live με thumbnail, label, τιμή (masked αν sensitive).
- Σε κάθε βήμα: «Ορισμός ως μεταβλητή», «Διαγραφή», «Αλλαγή στοιχείου» (re‑pick).
- Κάτω toolbar: **Έλεγχος κειμένου**, **Εξαγωγή δεδομένων** (πίνακας / στοιχεία καρτέλας / μία τιμή / αρχείο της σελίδας, με επιλογέα στηλών, γραμμών και σελίδων και προεπισκόπηση — docs/26), **Αναμονή στοιχείου**, **Σχόλιο**.
- Highlight overlay: περίγραμμα 2px `--sisyphus-500` + label chip με το locator που θα χρησιμοποιηθεί.
