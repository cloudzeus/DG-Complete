# P14 — Πίνακας ελέγχου & τιμολόγηση ανά εκτέλεση

## Πλαίσιο
Διάβασε: `docs/14-billing.md` (όλο), `docs/09` οθόνες 2, 4 (Υγεία), 20β, 21· `docs/08` §5· στο repo: `lib/ai-tokens.ts`, `app/admin/ai-tokens`, `app/admin/plans`, `app/admin/payments`, `lib/softone-billing.ts`. Φόρτωσε το skill `dataviz` πριν τα γραφήματα.

## Στόχος
Πλήρης τιμολόγηση ανά εκτέλεση με πακέτα (στο pattern των AI tokens του dgsmartbi), με **χρεώσεις, παραστατικά και πληρωμές στο SoftOne της DGsoft** (docs/14 §5), dashboard και ειδοποιήσεις χρήσης. Φόρτωσε το skill `softone` για τα SALDOC και τα ανοιχτά υπόλοιπα.

## Εργασίες
1. `lib/billing/`: `grantMonthly(tenantId, month)` (key `grant:<tenant>:<YYYY-MM>`), `topup(requestId)`, `chargeRun(runId)` / `refundRun(runId)` (κανόνες docs/14 §1, idempotent με key), `canEnqueue(tenantId, n)`, `closeMonthOverage(tenantId, month)` → χρέωση `Payment(kind=OVERAGE, PENDING)` → `postChargeToSoftOne`. Όλα atomic σε transaction με `Tenant.runBalance`.
2. Εργασίες στο `lib/jobs/registry.ts` (docs/10 §4β, όχι Coolify): μηνιαία χορήγηση την 1η (Europe/Athens), overage στο κλείσιμο μήνα, rollup `UsageDaily` κάθε 5′, ειδοποιήσεις 80% / 100%.
3. Χρεώσεις προς SoftOne: πρόσθεσε στο `Payment` τα πεδία `kind`, `periodFrom`, `periodTo`, `runs`, `s1OpenAmount`, `s1CheckedAt` (το `method` γίνεται nullable)· γενίκευσε το `postPaymentToSoftOne` σε `postChargeToSoftOne` με `serviceMtrl` ανά `kind` (ρύθμιση στο `/admin/settings/billing`)· χρέωση συνδρομής σε κάθε έναρξη/ανανέωση περιόδου. Νέο sync job «Ανοιχτά υπόλοιπα χρεώσεων» (σύστημα συγχρονισμών του dgsmartbi, προορισμός `APP`) που ενημερώνει `s1OpenAmount` και `status=PAID`. Κανόνες `graceDays` και αναστολής (docs/14 §5). **Αφαίρεσε τη ροή online πληρωμής Viva.**
4. **Δώρα (docs/14 §2):** στο `/admin/tenants/[id]` φόρμα «Δώρο εκτελέσεων» και «Πίστωση AI (€)» μόνο για SUPER_ADMIN (πλήθος, υποχρεωτική αιτιολογία, προαιρετική λήξη) → ledger `gift`, χωρίς χρέωση/παραστατικό, `audit('credits.gifted')`, ειδοποίηση στον tenant.
5. Admin: `/admin/plans` με τα νέα πεδία του Plan· νέο `/admin/settings/run-packs` (κατάλογος `RunCreditPack`)· `/admin/run-requests` (έγκριση αιτημάτων — ίδιο UI με `/admin/ai-tokens`) → στην έγκριση: χρέωση `RUN_PACK` + SALDOC + `topup` (ή `topup` μετά την είσπραξη αν `topupOnPayment`)· `/admin/payments` ως «Χρεώσεις» με κατάσταση SoftOne.
6. Tenant: `/t/[tenantId]/usage` — υπόλοιπο, κατανάλωση μήνα ανά ημέρα (Recharts με chart tokens, χωρίς gradients), ledger, «Αγορά πακέτου» → `RunCreditRequest`, λίστα χρεώσεων με αριθμό παραστατικού SoftOne και κατάσταση πληρωμής.
7. `/t/[tenantId]` dashboard: 4 KPI (εκτελέσεις σήμερα, επιτυχία 7 ημ., μέσος χρόνος, υπόλοιπο εκτελέσεων), γράφημα 14 ημερών, μέθοδοι/βήματα με τα περισσότερα σφάλματα, πρόσφατες αποτυχίες με thumbnail. `<Suspense>` ανά κάρτα.
8. `/t/[tenantId]/targets/[id]` tab Υγεία: επιτυχία ανά ροή, ποσοστό fallback locators ανά βήμα.
9. Alerts (docs/08 §5) μέσω `notify()`.
10. Tests: `billing-ledger.test.ts` (docs/12 §3), overage υπολογισμός, μηνιαία χορήγηση μία φορά.

## Κριτήρια αποδοχής
- [ ] Χρεώνεται μόνο `SUCCEEDED`, ακριβώς μία φορά ακόμα και με retries· κανένα `FAILED` δεν χρεώνεται· το όριο αποτυχιών δίνει 429 `E_FAILURE_LIMIT`.
- [ ] Μηνιαία χρέωση `AI_USAGE` = Σ `AiUsage.billedAmount` (κόστος OpenRouter × (1+`aiMarkupPct`)) στέλνεται ως ξεχωριστό SALDOC.
- [ ] Αίτημα πακέτου → έγκριση admin → χρέωση και SALDOC στο SoftOne (δοκιμαστική σύνδεση) → υπόλοιπο αυξάνεται.
- [ ] Είσπραξη καταχωρημένη στο SoftOne → μετά τον συγχρονισμό η χρέωση φαίνεται «Εξοφλημένη».
- [ ] Overage μήνα δημιουργεί σωστή χρέωση και παραστατικό στο SoftOne.
- [ ] Dashboard < 1s με 100k runs στο seed.
- [ ] Δώρο εκτελέσεων από SUPER_ADMIN αυξάνει το υπόλοιπο χωρίς χρέωση· ADMIN (όχι super) δεν βλέπει τη φόρμα.
