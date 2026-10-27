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

## 9. Εισαγωγή από Chrome DevTools Recorder (διαθέσιμη πριν το extension)

Μέχρι να ολοκληρωθεί το extension (P06), οι καταγραφές γίνονται με τον ενσωματωμένο Recorder του Chrome (F12 → Recorder → Start recording → End recording → Export → JSON) και εισάγονται από **Καταγραφές → Εισαγωγή από Chrome** (`importChromeRecording`, `lib/dsl/import/chromeRecorder.ts`):
- `navigate` → `navigate` (σχετικό URL όταν ανήκει στο `baseUrl` του συστήματος), `click`/`doubleClick` → `click`, `change` → `fill`, `keyDown` Enter/Tab/Escape → `press`, `waitForElement` → `waitFor`· `setViewport`, `keyUp`, `scroll`, `hover` παραλείπονται.
- Selectors: `aria/Όνομα[role="button"]` → role, `aria/Ετικέτα` → label, `[data-testid=x]` → testId, `text/` → text, `xpath/` → xpath, υπόλοιπα CSS· ταξινόμηση testId > role > label > text > css > xpath.
- Κάθε πεδίο γίνεται είσοδος (`{{input.<key>}}`, λατινικό κλειδί από την ετικέτα, π.χ. «Επωνυμία» → `eponymia`). Πεδίο κωδικού → `{{secrets.password}}` και το αμέσως προηγούμενο πεδίο → `{{secrets.username}}`· οι τιμές που καταγράφηκαν **δεν αποθηκεύονται** (ούτε ως παραδείγματα — μπορεί να είναι πραγματικά δεδομένα).

## 10. Καταγραφή μέσα στην εφαρμογή (χωρίς extension)

**Καταγραφές → Καταγραφή στην εφαρμογή**: ο server ανοίγει Chromium (ο ίδιος με τον ενσωματωμένο worker, ADR‑025) στο `baseUrl` του συστήματος‑στόχου, με το SSRF guard των `allowedOrigins`. Ο χρήστης βλέπει τη σελίδα ως εικόνα (`/api/recorder/[id]/frame`, ~3 fps, δεν αποθηκεύεται) και τα κλικ, τα πλήκτρα, η κύλιση και η γραμμή διεύθυνσης προωθούνται με `/api/recorder/[id]/action` (zod, `tenant.workflows.edit`, μόνο ο χρήστης που ξεκίνησε τη συνεδρία).
- Κάθε ενέργεια γίνεται βήμα: κλικ σε κουμπί/σύνδεσμο → `click`, πληκτρολόγηση σε πεδίο → `fill` με `{{input.<key>}}` (κλειδί από την ετικέτα), πεδίο κωδικού → `{{secrets.password}}` και το προηγούμενο πεδίο → `{{secrets.username}}`, λίστα → παράθυρο επιλογής → `select`, Enter → `press`, νέα διεύθυνση → `navigate`. Οι τιμές που πληκτρολογούνται πηγαίνουν μόνο στη σελίδα — δεν αποθηκεύονται ούτε γράφονται σε logs.
- **Capture πεδίων φόρμας**: όλα τα ορατά πεδία της σελίδας (ετικέτα, τύπος, υποχρεωτικό, επιλογές) σε πίνακα· ο χρήστης ορίζει για καθένα «Είσοδος API / Όνομα χρήστη / Κωδικός / Παράλειψη». Γίνονται βήματα με κοινό `form: f<n>` και καταγράφεται `definition.forms[f<n>] = { title, url, image, fields }` — `image` στο `lib/storage` (`tenants/{t}/recordings/{session}/{f}.jpg`, κωδικοί μασκαρισμένοι), `fields` χωρίς τιμές.
- **Εξαγωγή αποτελέσματος**: κλικ σε στοιχείο → όνομα (π.χ. `protocolNo`) → `extract` σε `output.<key>`.
- Locators ανά στοιχείο: testId > role+όνομα > label > placeholder > text > `[name=]` > CSS path (`lib/recorder/describe.ts`).
- **Ολοκλήρωση** → πρόχειρη ροή με `inputSchema`/`outputSchema` και άνοιγμα στον καμβά· οι κόμβοι φόρμας έχουν εικονίδια «Στιγμιότυπο» και «Πεδία». Συνεδρίες στη μνήμη του web process, έως 6, κλείνουν μετά από 20′ αδράνειας.
- Μηνύματα της καταγραφής σε παράθυρο ενημέρωσης (modal).
- **Νέο domain** (π.χ. σελίδα σύνδεσης σε `login.gsis.gr`): όταν η σελίδα πάει να ανοίξει origin εκτός `allowedOrigins`, το guard τη σταματά και η καταγραφή ρωτά «Να προστεθεί;». Με «Προσθήκη και συνέχεια» (δικαίωμα `tenant.targets.manage`) το origin γράφεται στο `TargetSystem.allowedOrigins` (audit `target.allow_origin`), επιτρέπεται αμέσως στη συνεδρία και η πλοήγηση συνεχίζει. Μόνο origins που ζήτησε η ίδια η σελίδα σε αυτή τη συνεδρία· ιδιωτικές/εσωτερικές διευθύνσεις ποτέ. Στις εκτελέσεις, αποκλεισμένη πλοήγηση δίνει `E_NAVIGATION` με το όνομα του domain.
- **Σελίδες ως βήματα**: κάθε νέα σελίδα (αλλαγή URL μετά από ενέργεια) ανοίγει νέα ομάδα `p<n>` με αυτόματο στιγμιότυπο και τα πεδία που βρέθηκαν· όλα τα βήματα της σελίδας (πεδία, λίστες, κουμπιά) ανήκουν σε αυτήν· στον καμβά ένας κόμβος «Σελίδα N · τίτλος · M πεδία».
- **Πολλαπλές εγγραφές στην ίδια σελίδα** (π.χ. γραμμές δαπανών/παραδοτέων στο ΟΠΣΚΕ, γραμμές παραστατικού): στο Capture τα πεδία «ανά γραμμή» + όνομα λίστας + κουμπί «νέα γραμμή» → είσοδος `array` (JSON Schema `items.properties`) και βήμα `forEach` (`as: line`) με κλικ στο κουμπί (`when: lineIndex > 0` αν η πρώτη γραμμή υπάρχει) και πεδία με locator γραμμής (`[name^="lines["][name$="[qty]"]`, `nth: "{{lineIndex}}"`). Το `Locator.nth` δέχεται πλέον template.
- **Λειτουργία (intent)** ανά ροή: GET · Ανάγνωση εγγραφών, POST · Δημιουργία, PATCH · Ενημέρωση, DELETE · Διαγραφή, POST · Ενέργεια (`Workflow.intent`, docs/24 §2). Επιλέγεται στη νέα ροή / καταγραφή· η σελίδα του συστήματος («Ροές & λειτουργίες») δείχνει τις ροές ανά λειτουργία με «Καταγραφή» για καθεμία.
- **Εξαγωγή πίνακα** (για GET): στη λειτουργία «Εξαγωγή αποτελέσματος» κλικ μέσα σε πίνακα → «Ολόκληρος ο πίνακας ως λίστα» → βήμα `extractTable` (στήλες ανά επικεφαλίδα, docs/26) → έξοδος `array` από αντικείμενα. Σελιδοποίηση πίνακα: εκκρεμεί.

- **Η σελίδα δεν φορτώνει:** όταν ο browser του server δεν φτάνει τη διεύθυνση (DNS, timeout, άρνηση σύνδεσης, SSL), η καταγραφή δείχνει την αιτία με τον κωδικό του Chromium και κουμπί «Ξανά», αντί για κενή σελίδα `chrome-error://`. Τα δημόσια συστήματα (ΟΠΣΚΕ, TaxisNet) συχνά δέχονται μόνο ελληνικές IP· τότε ο server χρειάζεται ελληνική έξοδο ή έγκριση της IP του.
