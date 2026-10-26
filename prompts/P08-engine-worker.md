# P08 — Μηχανή εκτέλεσης, worker & Bunny storage

## Πλαίσιο
Διάβασε: `docs/06-execution-engine.md` (όλο), `docs/08` §2 (Bunny), `docs/14` §1–§2 (χρέωση), `docs/02` §4, §6.

## Στόχος
`lib/engine` (Playwright step interpreter) και `worker/` (pg-boss consumer) που εκτελούν runs με sessions, όρια, retries, artifacts στο Bunny και χρέωση στο ledger.

## Εργασίες
1. `lib/queue`: queues, zod payloads, producers, pg-boss factory (`QUEUE_DATABASE_URL`, απευθείας 5432, ADR‑022).
2. `lib/storage`: interface του docs/08 §2 με drivers `bunny` (Storage API με `AccessKey`, signed CDN URLs με Token Authentication — υλοποίησε το token ακριβώς κατά την τεκμηρίωση «Token Authentication» του Bunny και γράψε test σε staging pull zone) και `local` (dev/tests). Ο driver και τα στοιχεία του Bunny διαβάζονται από τις ρυθμίσεις της εφαρμογής (`StorageSettings`, `/admin/settings/storage`, ADR‑024) — όχι από env· ήδη υπάρχουν τα `lib/storage/settings.ts` και `lib/storage/bunny.ts` (put/delete/signedUrl/test).
3. `lib/engine`:
   - `Interpreter.run(def, { input, secrets, page, hooks })` για όλους τους τύπους βημάτων (docs/05 §3).
   - `LocatorResolver` με fallback logging (docs/06 §4).
   - `ErrorClassifier` → κωδικοί docs/06 §5 + retryable.
   - `checkTargetErrors`, ανίχνευση CAPTCHA.
   - `ArtifactCollector.onStepError`: full/element/viewport screenshots με `mask`, highlight overlay, DOM (redacted), console, trace → `storage.put()` + `RunArtifact`.
   - `redact()` (docs/08 §3), SSRF guard με `page.route`.
4. `worker/`:
   - Consumers `runs` και `runs-priority`, κλείδωμα run (`updateMany where status=QUEUED` atomic claim, όπως το `Payment` claim του dgsmartbi), μεταβάσεις κατάστασης docs/01 §5.
   - Semaphores (tenant από `Plan.maxConcurrentRuns`, target, credential) στον πίνακα `ConcurrencyLease` (ατομικό INSERT με TTL, ADR‑022).
   - Session manager (storageState κρυπτογραφημένο, sessionCheck, login flow, TOTP με `otplib`).
   - Browser pool με recycle.
   - Retry με backoff και commitPoint λογική (`mayHaveCommitted`).
   - **Χρέωση:** στην τελική μετάβαση καλεί `lib/billing.chargeRun(runId)` (ledger key `usage:<runId>`, κανόνες docs/14 §1)· `E_INTERNAL` → `refundRun`. (Αν το `lib/billing` δεν υπάρχει ακόμη, φτιάξε το ελάχιστο: `chargeRun`, `refundRun`, `canEnqueue`.)
   - Publish live events, graceful shutdown, `/metrics`.
5. Web: SSE `/api/stream/runs/[id]` και σύνδεση με τη «Δοκιμαστική εκτέλεση».
6. `sandbox/`: όλες οι σελίδες του docs/12 §2.
7. Tests (Playwright Test έναντι sandbox, local storage): κάθε step type, iframe, popup, dialog, upload, fallback locator, `E_TARGET_VALIDATION`, CAPTCHA → NEEDS_ATTENTION, λήξη session → re‑login, commit point, masking, χρέωση μία φορά.

- Εκτέλεση `choose` (docs/25 §3): τοπολογική σειρά, snapshot και αναμονή ανανέωσης επιλογών (`changed-or-contains`, προαιρετικά response), widgets native/combobox/autocomplete/custom, επαλήθευση ότι οι γονείς δεν μηδενίστηκαν (μία επανάληψη αλυσίδας), σφάλματα `E_OPTION_*`/`E_OPTIONS_*`/`E_DEPENDENT_RESET` με διαθέσιμες επιλογές και πρόταση πλησιέστερης. Ενημέρωση `OptionCatalog` από επιτυχημένα runs και health runs. Προ‑έλεγχος `Method.optionValidation` (warn/strict) και endpoint `…/options/{field}`.

## Κριτήρια αποδοχής
- [ ] Sandbox με εξαρτώμενες λίστες και τυχαία καθυστέρηση AJAX: 50 runs με διαφορετικούς Δήμους → 100% επιτυχία χωρίς σταθερά sleep· «Καλιθέα» → `E_OPTION_NOT_FOUND` με πρόταση «Καλλιθέα»· σε `strict` η ίδια κλήση απορρίπτεται με 422 πριν την ουρά.
- [ ] «Καταχώριση πελάτη» τρέχει επιτυχώς από τον editor με live πρόοδο και χρεώνει 1 εκτέλεση (εκτός αν είναι `UI_TEST` εντός ορίου).
- [ ] ΑΦΜ που υπάρχει ήδη: FAILED, `E_TARGET_VALIDATION`, `targetMessage`, 3 screenshots + DOM + trace αποθηκευμένα (στο staging Bunny zone όταν `STORAGE_DRIVER=bunny`).
- [ ] Τα sensitive πεδία είναι masked στα screenshots.
- [ ] 50 ταυτόχρονα runs με `maxConcurrency=2` δεν ξεπερνούν ποτέ τα 2 ενεργά.
