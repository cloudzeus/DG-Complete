# P11c — Αναγνώριση αλλαγών & αυτόματη παύση μεθόδων

## Πλαίσιο
Διάβασε: `docs/23-change-detection.md` (όλο), `docs/18` §3 (health run, δοκιμαστικός δικαιούχος), `docs/19` (καμβάς, STEP_THUMB, heatmap), `docs/06` (error taxonomy, ουρές), `docs/10` §4β (εργασίες στον κώδικα), `docs/16` (`suggestLocator`). Προϋπόθεση: P09, P11, P07b.

## Στόχος
Μαθαίνουμε πρώτοι ότι άλλαξε το TAXIS/ΟΠΣΚΕ, ειδοποιείται ο σωστός άνθρωπος σε ≤ 5′, και οι μέθοδοι μπαίνουν αυτόματα σε παύση με τα runs στην ουρά να κρατούνται (HELD), μέχρι να διορθωθεί η ροή.

## Εργασίες
1. Prisma: `Incident`, `StepBaseline`· πεδία `Method.state|pausedAt|pausedReason|pausePolicy|heldMaxHours`, `TargetSystem.healthWorkflowId|healthCredentialRef|healthSchedule|ownerIds`, `Workflow.ownerId`, κατάσταση run `HELD`, trigger `HEALTH` (docs/23 §7).
2. Health runs: εργασία `health.targets` στο `lib/jobs/registry.ts` (ωριαία 07:00–22:00 και νυχτερινή), σε χωριστό όριο ταυτόχρονων εκτελέσεων, χωρίς χρέωση. Η ροή ελέγχου σταματά πριν το σημείο δέσμευσης.
3. Baselines και drift: στην πρώτη επιτυχημένη εκτέλεση κάθε έκδοσης αποθήκευση `domSignature` (απλοποιημένη δομή γύρω από το στοιχείο) και perceptual hash της `STEP_THUMB`. Σύγκριση σε health runs και σε δείγμα παραγωγικών. Καταγραφή `fallbackUsed`.
4. Κανόνες: `lib/incidents/rules.ts` (καθαρό TS + tests), με τα επίπεδα και τα κατώφλια του docs/23 §2, μόνο για τους σχετικούς κωδικούς σφάλματος. Αξιολόγηση από τον worker στο τέλος κάθε run και από την εργασία `incidents.evaluate` κάθε λεπτό. Dedup ανά (σύστημα, βήμα).
5. Circuit breaker: `PAUSED` → αφαίρεση runs από BullMQ και κατάσταση `HELD`. Νέες κλήσεις κατά `pausePolicy` (`QUEUE` → 202 HELD, `REJECT` → 503 `E_METHOD_PAUSED` + `Retry-After`). `HALF_OPEN` με 1 health run + 3 runs. Απελευθέρωση HELD runs με τη σειρά άφιξης, με rate limit. Λήξη HELD μετά από `heldMaxHours` → CANCELLED χωρίς χρέωση. Παύση/επανεκκίνηση και του αντίστοιχου job.
6. Ειδοποιήσεις: παραλήπτες, κανάλια (in‑app, email, Teams webhook) και κλιμάκωση κατά docs/23 §3, με ενέργειες «Ανάληψη», «Άνοιγμα στον καμβά», «Σύγκριση στιγμιότυπων», «Συνέχεια παρά το σφάλμα». Webhooks `method.paused|resumed`, `incident.opened|resolved`.
7. Σελίδες: `/t/[tenantId]/incidents`, καρτέλα «Υγεία» στο σύστημα‑στόχο, κάρτα «Κατάσταση συστημάτων» στο dashboard, `/admin/incidents` για τη DGsoft (κρίσιμα όλων των tenants).
8. Γρήγορη διόρθωση: από το incident, άνοιγμα του καμβά με το βήμα σημειωμένο, slider baseline/τώρα, DOM diff, `suggestLocator` σε νέο DRAFT, δοκιμή με τον δοκιμαστικό δικαιούχο και έγκριση με προτεραιότητα.
9. Sandbox: διακόπτης που αλλάζει το label/δομή ενός πεδίου, για να ελεγχθεί όλη η αλυσίδα.

## Κριτήρια αποδοχής
- [ ] Αλλαγή label στο sandbox → το επόμενο health run αποτυγχάνει → incident ΣΟΒΑΡΟ → ειδοποίηση σε ≤ 5′ στον owner και στον TENANT_ADMIN → η μέθοδος γίνεται PAUSED.
- [ ] 200 runs στην ουρά γίνονται HELD, δεν εκτελούνται και δεν χρεώνονται. Νέες κλήσεις παίρνουν 202 HELD (ή 503 με `REJECT`).
- [ ] Διόρθωση με νέο locator → έγκριση → HALF_OPEN → 3 επιτυχή → απελευθέρωση των 200 με τη σειρά τους και ολοκλήρωση.
- [ ] Σφάλματα δεδομένων (`E_TARGET_VALIDATION`) δεν ανοίγουν incident.
- [ ] Drift χωρίς αποτυχία ανοίγει μόνο Προειδοποίηση, χωρίς παύση.
- [ ] HELD runs άνω των 24 ωρών ακυρώνονται με webhook και χωρίς χρέωση.
