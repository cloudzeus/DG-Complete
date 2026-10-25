# P11 — Μαζικές εργασίες, Excel/CSV, Webhooks

## Πλαίσιο
Διάβασε: `docs/01` §4.3, `docs/07` §3.4 & §5, `docs/06` §2, `docs/14` §2, `docs/09` οθόνες 12 & 17, `lib/excel.ts`.

## Στόχος
Μαζική καταχώριση από API και αρχεία, με παρακολούθηση, επανάληψη αποτυχημένων, εξαγωγή και webhooks.

## Εργασίες
1. API: `POST …/jobs` (έως 10.000 items, validation ανά item, `invalidItems`, `rejectOnInvalid`, `stopOnErrorRate`), `GET /jobs/{id}`, `/jobs/{id}/runs`, `retry-failed`, `cancel`, `export.xlsx`. Έλεγχος υπολοίπου για όλο το job (`canEnqueue(tenantId, n)`).
2. Runs σε batches των 500 (`createMany`) + pg-boss `insert` σε batches (parent = `Job` με counters, ADR‑022). Counters με `{ increment: 1 }`. Ολοκλήρωση → `COMPLETED` / `COMPLETED_WITH_ERRORS`· `stopOnErrorRate` → ακύρωση υπολοίπων.
3. Wizard `/t/[tenantId]/jobs/new`: μέθοδος → upload (έως 20 MB, αποθήκευση στο storage) → parsing στον worker (queue `imports`, exceljs / papaparse, ανίχνευση Windows‑1253 με `iconv-lite` που υπάρχει ήδη) → ColumnMapper (auto‑match, μετατροπές ημερομηνιών Excel, δεκαδικά με κόμμα) → προεπισκόπηση σφαλμάτων → εκκίνηση με ένδειξη «Θα χρησιμοποιηθούν N εκτελέσεις».
4. `/t/[tenantId]/jobs/[id]`: πρόοδος (GSAP tween), counters, πίνακας items, φίλτρο αποτυχημένων, «Επανάληψη αποτυχημένων», «Ακύρωση», «Εξαγωγή XLSX» (αποθήκευση στο storage + signed URL). Tab «Καμβάς» με heatmap αποτυχιών ανά βήμα (docs/19 §3, `<WorkflowCanvas mode="job">` από το P07b — αν δεν υπάρχει ακόμα, άφησε placeholder).
5. Webhooks: `/t/[tenantId]/settings/webhooks`, `WebhookDelivery` + queue `webhooks` με backoff, HMAC υπογραφή (docs/07 §5), SSRF προστασία, λίστα deliveries με επαναποστολή· ad‑hoc `callbackUrl`.
6. Tests: job 1.000 items στο sandbox (5% σφάλματα), XLSX με ελληνικά/ημερομηνίες, υπογραφή webhook, retries.

## Κριτήρια αποδοχής
- [ ] XLSX 1.000 γραμμών → job ολοκληρώνεται, export με αποτέλεσμα ανά γραμμή, χρεώνονται ακριβώς όσες εκτελέσεις ολοκληρώθηκαν.
- [ ] «Επανάληψη αποτυχημένων» φτιάχνει runs μόνο για τα FAILED.
- [ ] Webhook `job.completed` με έγκυρη υπογραφή· σε 500 του receiver γίνονται retries.
