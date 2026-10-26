# 09 — UI/UX & DG Design System

## 1. Αρχές

- **Product interior** του DG Design System: canvas `#F3F2F1`, λευκές κάρτες, **Sisyphus Blue `#0078D4`** για active nav, links, focus σε data οθόνες. **DG crimson `#E31E2A`** μόνο για λογότυπο, brand στιγμές (login), destructive ενέργειες και highlight σφάλματος στα screenshots. Ποτέ και τα δύο ως primary στην ίδια επιφάνεια.
- Σοβαρή, corporate αισθητική — **όχι** gradient heroes, glow ή φανταχτερά χρώματα μέσα στο προϊόν.
- Τυπογραφία: Segoe UI Variable → Inter. **Βασικό μέγεθος 14px:** `html { font-size: 87.5% }`, οπότε όλα τα rem (και οι αποστάσεις, τα ύψη των controls) μετρούν σε 14px· τα tokens `--fs-*` (`scripts/fluid-type.mjs`, `ROOT = 14`) κρατούν τον ramp σε px. Ramp 11/12/13/14/16/18/20/24/32. Τίτλοι σελίδων 24/600, section titles 18/600, eyebrows 11/600 UPPERCASE tracking 0.08em. Body 14/400. Αριθμοί σε KPI 32/600 tabular‑nums — όχι τεράστιοι.
- Radii 4 (controls) / 8 (cards) / 12 (modals). Διπλές σκιές (`--elev-*`).
- Acrylic topbar, Mica sidebar. Icons **lucide** όπως στο dgsmartbi (αποδεκτή εναλλακτική του DG για τα Fluent icons). Χωρίς emoji.
- Motion: 80/150/240/400 ms, `cubic-bezier(0.33,0,0.67,1)`. GSAP μόνο για: είσοδο λίστας βημάτων (stagger 30ms, y:4→0), progress των jobs, μετάβαση στο highlight του screenshot. Springs μόνο σε drawers.
- Ελληνικά canonical labels, +15–20% χώρος. Χωρίς θαυμαστικά.

Tokens: [`design/colors_and_type.css`](../design/colors_and_type.css) · αντιστοίχιση σε shadcn: [`design/shadcn-theme.css`](../design/shadcn-theme.css).

## 2. Information architecture

```
┌ Topbar (acrylic): [DG logo] Οργανισμός ▾ │ αναζήτηση (⌘K) │ ειδοποιήσεις │ χρήστης
├ Sidebar (mica)
│  ΕΠΙΣΚΟΠΗΣΗ
│    Πίνακας ελέγχου
│  ΣΧΕΔΙΑΣΜΟΣ
│    Συστήματα‑στόχοι
│    Καταγραφές
│    Ροές
│  ΕΚΤΕΛΕΣΗ
│    Συλλογές μεθόδων
│    Μαζικές εργασίες
│    Εκτελέσεις
│    Προς ενέργεια (badge: NEEDS_ATTENTION)
│    Εγκρίσεις (badge: PENDING_APPROVAL — μόνο Admin)
│  ΔΙΑΧΕΙΡΙΣΗ
│    Κλειδιά API
│    Webhooks
│    Μέλη & ρόλοι
│    Αρχείο ενεργειών
│    Χρήση & πακέτο
│    Ρυθμίσεις
└ Content (λευκές κάρτες σε canvas)
```

## 3. Οθόνες

| # | Route | Οθόνη | Κύρια στοιχεία |
|---|---|---|---|
| 1 | `/login` | Σύνδεση | Μόνο εδώ brand στιγμή: λογότυπο, λευκή κάρτα, «Σύνδεση με Microsoft» |
| 2 | `/t/[tenantId]` | Πίνακας ελέγχου | 4 KPI (εκτελέσεις σήμερα, ποσοστό επιτυχίας, μέσος χρόνος, σε ουρά), γράφημα 14 ημερών (success/failed), «Μέθοδοι με τα περισσότερα σφάλματα», «Πρόσφατες αποτυχίες» με thumbnail screenshot |
| 3 | `/t/[tenantId]/targets` | Συστήματα‑στόχοι | Πίνακας· drawer δημιουργίας (URL, allowed origins, όρια, error detectors με picker) |
| 4 | `/t/[tenantId]/targets/[id]` | Σύστημα | Tabs: Γενικά · Διαπιστευτήρια · Ροές · Υγεία (success rate, locator fallbacks) |
| 5 | `/t/[tenantId]/recordings` | Καταγραφές | Λίστα, «Νέα καταγραφή» → modal με οδηγίες extension + κωδικό σύνδεσης |
| 6 | `/t/[tenantId]/workflows` | Ροές | Πίνακας με έκδοση, κατάσταση, μεθόδους που τη χρησιμοποιούν |
| 7 | `/t/[tenantId]/workflows/[id]` | **Editor ροής** | Βλ. §4 |
| 8 | `/t/[tenantId]/workflows/[id]/versions` | Εκδόσεις | Λίστα + diff |
| 9 | `/t/[tenantId]/collections` | Συλλογές μεθόδων | Κάρτες συλλογών (αριθμός μεθόδων, κλήσεις 7 ημ.) |
| 10 | `/t/[tenantId]/collections/[c]` | Συλλογή | Μέθοδοι (πίνακας), tab «Τεκμηρίωση API» (Scalar), tab «Κλειδιά με πρόσβαση» |
| 11 | `/t/[tenantId]/collections/[c]/methods/[m]` | Μέθοδος | Ρυθμίσεις (mode, timeouts, retries, screenshots), pinned έκδοση με «Αναβάθμιση», «Χειροκίνητη εκτέλεση» (auto‑form), δείγματα curl/TS/C# |
| 12 | `/t/[tenantId]/jobs` · `/t/[tenantId]/jobs/new` · `/t/[tenantId]/jobs/[id]` | Μαζικές εργασίες | Wizard: μέθοδος → upload CSV/XLSX → αντιστοίχιση στηλών (auto‑match με labels) → προεπισκόπηση validation → εκκίνηση. Σελίδα job: progress bar, counters, πίνακας items, «Επανάληψη αποτυχημένων», export |
| 13 | `/t/[tenantId]/runs` | Εκτελέσεις | Πίνακας virtualized: κατάσταση, μέθοδος, externalRef, διάρκεια, ώρα, σφάλμα. Φίλτρα & saved views |
| 14 | `/t/[tenantId]/runs/[id]` | **Λεπτομέρειες εκτέλεσης** | Βλ. docs/08 §4 |
| 15 | `/t/[tenantId]/attention` | Προς ενέργεια | Runs σε NEEDS_ATTENTION: οδηγίες, πεδίο OTP, live viewport (φάση 3), «Συνέχεια»/«Ακύρωση» |
| 16 | `/t/[tenantId]/settings/api-keys` | Κλειδιά API | Δημιουργία (scopes, συλλογές, IP, λήξη) — εμφάνιση μία φορά με copy |
| 17 | `/t/[tenantId]/settings/webhooks` | Webhooks | Endpoints, events, deliveries με επαναποστολή |
| 18 | `/t/[tenantId]/settings/members` | Μέλη | Προσκλήσεις, ρόλοι |
| 19 | `/t/[tenantId]/settings/audit` | Αρχείο ενεργειών | |
| 20 | `/t/[tenantId]/settings` | Ρυθμίσεις | Ζώνη ώρας, ειδοποιήσεις, retention (εντός ορίων πακέτου) |
| 20α | `/t/[tenantId]/approvals` | Εγκρίσεις | Εκδόσεις σε αναμονή: diff με την τρέχουσα, τελευταίο test run με στιγμιότυπα, «Έγκριση» / «Απόρριψη με σχόλιο» |
| 20β | `/t/[tenantId]/usage` | Χρήση & πακέτο | Υπόλοιπο εκτελέσεων, κατανάλωση μήνα ανά ημέρα, ledger, «Αγορά πακέτου εκτελέσεων» (docs/14) |
| 21 | `/admin/*` | Platform admin (από dgsmartbi) | Tenants, πελάτες, πακέτα & πακέτα εκτελέσεων, πληρωμές, αιτήματα πακέτων, ρυθμίσεις, workers/queues health (μόνο SUPER_ADMIN/ADMIN) |

## 4. Editor ροής (η πιο σύνθετη οθόνη)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Ροές / Καταχώριση πελάτη   v4 · Πρόχειρο · αποθηκεύτηκε 10:31                    │
│                     [Καμβάς | Λίστα | JSON]   [Δοκιμαστική εκτέλεση] [Δημοσίευση]│
├──────────────────────┬───────────────────────────────────┬────────────────────────┤
│ ΒΗΜΑΤΑ          [+]  │ ΒΗΜΑ 02 · Συμπλήρωση              │ ΕΙΣΟΔΟΙ          [+]   │
│ ⋮⋮ 01 Πλοήγηση       │ Τύπος     [Συμπλήρωση ▾]          │ afm       ΑΦΜ   string │
│ ⋮⋮ 02 Συμπλήρωση ΑΦΜ │ Στοιχείο  label "ΑΦΜ"      [✎ ⌖] │ name   Επωνυμία string │
│ ⋮⋮ 03 Επωνυμία       │   εναλλακτικά: css input[name=afm]│ city     Πόλη  ○ opt   │
│ ⋮⋮ 04 Πόλη  (όταν…)  │ Τιμή      {{input.afm}}   [ƒ x]   │ contacts Επαφές  array │
│ ▾  05 Για κάθε επαφή │ Timeout   15 s                    │ ΕΞΟΔΟΙ                 │
│    ⋮⋮ 05a Νέα επαφή  │ ☐ Προαιρετικό  ☐ Σημείο δέσμευσης │ customerCode           │
│ ⋮⋮ 06 Αποθήκευση     │ ┌ Στιγμιότυπο καταγραφής ───────┐ │ ΜΕΤΑΒΛΗΤΕΣ             │
│ ⋮⋮ 07 Έλεγχος μηνυμ. │ │ [thumbnail με highlight]      │ │                        │
│ ⋮⋮ 08 Επιβεβαίωση    │ └───────────────────────────────┘ │ ΕΛΕΓΧΟΣ  ⚠ 1 προειδοπ. │
├──────────────────────┴───────────────────────────────────┴────────────────────────┤
│ ΔΟΚΙΜΗ  input: [δείγμα ▾]   ● 02 ✓  03 ✓  04 –  05 …         [Άνοιγμα εκτέλεσης] │
└───────────────────────────────────────────────────────────────────────────────────┘
```
- Drag‑and‑drop με `@dnd-kit` (DG drop‑target style).
- Picker «⌖»: ανοίγει το extension στο σύστημα‑στόχο για επιλογή νέου στοιχείου (re‑pick).
- `ƒ x`: popover με autocomplete μεταβλητών και filters.
- Panel «Έλεγχος» = αποτελέσματα `validateForPublish` live.
- **Καμβάς (προεπιλογή):** @xyflow/react, επεξεργάσιμος με εντολές πάνω στο DSL, κόμβοι με μικρογραφία οθόνης ανά βήμα, ζωντανή κατάσταση στις εκτελέσεις, heatmap αποτυχιών, diff εκδόσεων — αναλυτικά στο **docs/19**. Το wireframe παραπάνω είναι η προβολή «Λίστα».

## 5. Components (shadcn + Vengeance UI)

Βάση shadcn/ui (θέμα DG). Χρήση Vengeance UI (`@vengeance` registry) όπου προσθέτει αξία χωρίς να παραβιάζει το DG motion (π.χ. command palette, animated tabs, number ticker στα KPI) — πάντα μέσω wrappers στο `components/ (του dgsmartbi + νέα)` ώστε να εφαρμόζονται tokens.

Πρωτογενή components στο `components/ (του dgsmartbi + νέα)`:
`AppShell`, `SidebarNav`, `PageHeader` (eyebrow + τίτλος + actions), `KpiTile`, `StatusBadge` (ανά RunStatus), `DataTable` (TanStack + virtual), `FilterBar`, `EmptyState`, `CodeBlock` (copy), `JsonViewer`, `ScreenshotViewer` (zoom/pan/highlight), `StepTimeline`, `LogStream` (virtualized, SSE), `SchemaForm` (auto‑form από JSON Schema), `ColumnMapper`, `SecretField` (masked + reveal με re‑auth), `DiffView`, `ConfirmDialog` (destructive σε DG red).

### StatusBadge
| Status | Χρώμα | Label |
|---|---|---|
| QUEUED | neutral `--n-60` σε `--n-10` | Σε ουρά |
| RUNNING | `--sisyphus-600` σε `--sisyphus-50` | Εκτελείται |
| SUCCEEDED | `--success-500` σε `--success-100` | Επιτυχία |
| FAILED | `--danger-500` σε `--danger-100` | Αποτυχία |
| RETRY_SCHEDULED | `--warning-500` σε `--warning-100` | Νέα προσπάθεια |
| NEEDS_ATTENTION | `--warning-500` σε `--warning-100` + icon | Προς ενέργεια |
| CANCELLED | `--n-50` σε `--n-6` | Ακυρώθηκε |

## 6. Προσβασιμότητα
- Contrast AA (DG red ποτέ ως φόντο πίσω από μικρό κείμενο).
- Πλήρης πλοήγηση με πληκτρολόγιο στον editor (↑↓ βήματα, Alt+↑↓ μετακίνηση, Delete).
- `aria-live="polite"` στις ενημερώσεις προόδου.
- Τα screenshots έχουν alt «Στιγμιότυπο σφάλματος στο βήμα 07 — Έλεγχος μηνυμάτων».

## Απλοποίηση (μετά τις πρώτες δοκιμές χρηστών)

- **Μία διαδρομή:** ο πίνακας ελέγχου ξεκινά με «Ξεκινήστε εδώ» — Σύστημα → Στοιχεία σύνδεσης → Καταγραφή → Δοκιμή → Δημοσίευση → Κλήση API· μόνο το τρέχον βήμα έχει κουμπί. Σε νέο λογαριασμό δεν εμφανίζονται άδεια γραφήματα.
- **Πρόοδος ροής:** στη σελίδα κάθε ροής πέντε ενδείξεις (Βήματα, Σύνδεση, Δοκιμή, Δημοσίευση, API) και «Επόμενο» με την ενέργεια.
- **Κανένα αδιέξοδο:** μενού ⋯ με διαγραφή (με επιβεβαίωση που λέει τι φεύγει μαζί) σε συστήματα, ροές, καταγραφές, μεθόδους, συλλογές, εισόδους· διαγραφή οποιουδήποτε βήματος στην καταγραφή· άδεια ροή → «Καταγραφή στην εφαρμογή». Λειτουργίες που δεν υπάρχουν ακόμη (extension) δεν εμφανίζονται.
- **Μενού:** Αρχική · Αυτοματισμοί (Συστήματα, Ροές, Καταγραφές) · API (Μέθοδοι, Κλειδιά, Webhooks) · Παρακολούθηση · Διαχείριση.
- **Μηνύματα:** παράθυρα ενημέρωσης, όχι toasts.
