# 12 — Στρατηγική δοκιμών

## 1. Πυραμίδα

| Επίπεδο | Εργαλείο | Τι καλύπτει |
|---|---|---|
| Unit | Vitest | DSL schemas, template engine/filters, expression evaluator, compile‑recording, redaction, crypto, permissions matrix, ΑΦΜ validator |
| Integration | Vitest + Testcontainers (Postgres) · storage: local driver | **Tests απομόνωσης tenants** (tenantDb + RLS), queue producers/consumers, API key auth, idempotency, ledger εκτελέσεων |
| Engine | Playwright Test έναντι `apps/sandbox` | Κάθε step type, locator fallbacks, iframes, dialogs, popups, file upload, error taxonomy, screenshots/masking |
| E2E | Playwright Test (web + worker + sandbox) | Login → σύστημα → workflow JSON import → method → API call → run viewer με screenshot |
| Extension | Playwright με `launchPersistentContext` + extension loaded | Καταγραφή στη φόρμα sandbox → events → compile |
| Load | k6 | 200 rps enqueue, 1.000‑item jobs |

## 2. `apps/sandbox` — δοκιμαστικό «τρίτο σύστημα»

Μικρή Next.js (ή Hono + HTML) εφαρμογή στο port 4100 που μιμείται τυπικά προβλήματα:
- Login με username/password (+ προαιρετικό TOTP), session cookie, λήξη session μετά από 5′.
- Φόρμα «Νέος πελάτης» με ΑΦΜ validation server‑side («Ο ΑΦΜ υπάρχει ήδη») → toast σφάλματος.
- Φόρμα «Νέο τιμολόγιο» με δυναμικές γραμμές (add row), autocomplete πελάτη, date picker σε μορφή dd/MM/yyyy, select, checkbox.
- ASP.NET‑style ids (`ctl00_…`) που αλλάζουν σε κάθε load (για να δοκιμάζονται τα fallbacks).
- Iframe με φόρμα, confirm dialog, popup window, file upload.
- Σελίδα με τυχαία καθυστέρηση 0–3s και τυχαίο 503 (flag).
- Σελίδα με ψεύτικο «CAPTCHA» iframe (ανίχνευση → NEEDS_ATTENTION).
- Endpoint `/__reset` για καθαρή κατάσταση στα tests.

## 3. Κρίσιμα tests (πρέπει να υπάρχουν)

- `tenant-isolation.test.ts`: για κάθε tenant‑scoped μοντέλο, insert ως tenant A μέσω `tenantDb(A)`, select μέσω `tenantDb(B)` → 0 rows· για τα μοντέλα με RLS και με raw SQL.
- `billing-ledger.test.ts`: μόνο `SUCCEEDED` χρεώνεται και μία φορά (ακόμα και με retries και διπλό event), κανένα `FAILED` δεν χρεώνεται, υπολογισμός `billedAmount` AI με markup, μηνιαία χορήγηση μία φορά ανά μήνα.
- `approval.test.ts`: Designer δεν μπορεί να δημοσιεύσει· Admin εγκρίνει μόνο με επιτυχημένο test run.
- `bunny-storage.test.ts`: signed URL λήγει, χωρίς token → 403 (σε staging pull zone, nightly).
- `redaction.e2e.test.ts`: run με γνωστό password/sensitive input → σάρωση **όλων** των artifacts (screenshots με OCR‑less έλεγχο: τα masked regions έχουν το maskColor· DOM/HAR/logs με string search) → καμία εμφάνιση.
- `idempotency.test.ts`: ίδιο key → ίδιο run· ίδιο key, άλλο body → 409.
- `commit-point.test.ts`: αποτυχία μετά από commit step χωρίς idempotencyCheck → δεν γίνεται retry, `mayHaveCommitted=true`.
- `fair-scheduling.test.ts`: tenant με 1.000 runs δεν «πνίγει» tenant με 1 run.
- `publish-immutability.test.ts`: απόπειρα update PUBLISHED version → error.

## 4. Conventions
- Κάθε PR: unit + integration πράσινα· e2e τρέχουν σε main και nightly.
- Test data builders στο `tests/factories.ts`.
- Coverage στόχος: `lib/dsl` και `lib/engine` ≥ 85%.
