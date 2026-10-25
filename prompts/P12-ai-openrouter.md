# P12 — Ανάλυση DOM με AI (OpenRouter)

## Πλαίσιο
Διάβασε: `docs/16-ai-openrouter.md` (όλο), `docs/08` §3 (redaction), `lib/openrouter.ts`, `lib/ai-tokens.ts`, `app/admin/settings/ai` (από το dgsmartbi).

## Στόχος
Οι έξι εργασίες AI του docs/16 πάνω στην υπάρχουσα υποδομή OpenRouter του dgsmartbi, ως **προτάσεις** που εγκρίνει ο άνθρωπος.

## Εργασίες
1. `lib/engine/dom-simplify.ts`: απλοποιημένο, redacted DOM (ορατά στοιχεία φόρμας, κουμπιά, headings, μηνύματα, σταθερά ids, max ~30k χαρακτήρες). Unit tests με fixtures από sandbox, ΟΠΣΚΕ‑like και TAXIS‑like σελίδες: καμία τιμή πεδίου, ΑΦΜ, IBAN, email στην έξοδο.
2. `lib/ai/`: μία συνάρτηση ανά εργασία (`labelFields`, `segmentFlow`, `explainFailure`, `suggestLocator`, `detectMessages`, `writeDocs`), η καθεμία με prompt στα ελληνικά, zod schema εξόδου και επιλογή μοντέλου από το `AiSettings` (νέα πεδία: μοντέλο ανά εργασία + fallback). Χρέωση **ξεχωριστά** (docs/14 §7): κράτα `usage.cost` του OpenRouter σε `AiUsage.costUsd` και υπολόγισε `billedAmount` με `Plan.aiMarkupPct` και ημερήσια ισοτιμία· όχι προπληρωμένα tokens.
3. Ενσωμάτωση:
   - Compile καταγραφής (P07): μετά το `compileRecording`, `labelFields` + `segmentFlow` → προτάσεις στον editor (badge «Πρόταση AI», αποδοχή/απόρριψη ανά πεδίο/βήμα).
   - Run viewer (P09): κουμπί «Εξήγηση με AI» και αυτόματη εξήγηση για `E_LOCATOR_NOT_FOUND`/`E_ASSERTION_FAILED` αν `ai.autoExplainFailures`.
   - `suggestLocator`: κουμπί «Πρόταση διόρθωσης» → δημιουργεί νέο draft με τον προτεινόμενο locator (ποτέ αλλαγή σε PUBLISHED).
   - `detectMessages`: μετά από δοκιμαστικές εκτελέσεις προτείνει error detectors στο σύστημα‑στόχο.
4. Ρυθμίσεις tenant `ai` (docs/16 §3) στη σελίδα Ρυθμίσεις· για συστήματα με ευαίσθητα δεδομένα (π.χ. TAXIS) default `sendScreenshots = false`.
5. Οι κλήσεις AI τρέχουν σε queue `ai` στον worker (όχι μέσα σε request), με timeout και retry.

## Κριτήρια αποδοχής
- [ ] Καταγραφή της φόρμας sandbox → προτεινόμενα ελληνικά labels και formats (π.χ. `afm-gr`) εμφανίζονται και γίνονται αποδεκτά με ένα κλικ.
- [ ] Αποτυχία `E_LOCATOR_NOT_FOUND` (σκόπιμη αλλαγή id στο sandbox) → εξήγηση + προτεινόμενος locator → νέο draft που περνά το test run.
- [ ] Test που ελέγχει ότι το payload προς OpenRouter δεν περιέχει γνωστές ευαίσθητες τιμές.
- [ ] Κάθε κλήση γράφει `AiUsage` με `costUsd` και `billedAmount` (με markup πακέτου)· στο `monthlyCostCap` οι εργασίες AI σταματούν με σαφές μήνυμα· ειδοποίηση στο 80%.
