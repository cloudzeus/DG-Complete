# P13 — Τεκμηρίωση ανά σύστημα & Postman collections

## Πλαίσιο
Διάβασε: `docs/17-system-docs-postman.md` (όλο), `docs/07` §6 (OpenAPI), `docs/16` (`writeDocs`), `docs/09` (DG UI).

## Στόχος
Για κάθε σύστημα‑στόχο: τεκμηρίωση (σελίδα, Markdown, PDF, link κοινοποίησης) και Postman collection v2.1 με environment, που αναπαράγονται σε κάθε δημοσίευση.

## Εργασίες
1. Μοντέλο `SystemDoc` (docs/17 §2) + migration.
2. `lib/docs/build-system-doc.ts`: συλλογή δεδομένων (σύστημα, δημοσιευμένες ροές, inputSchema/outputSchema, thumbnails καταγραφής ή στιγμιότυπα του τελευταίου επιτυχημένου test run — masked, error detectors, συχνότερα `targetMessage`, μέθοδοι, changelog) → κλήση `writeDocs` για επισκόπηση/ροές/μηνύματα → merge με τις χειροκίνητες αλλαγές ανά ενότητα.
3. `/t/[tenantId]/targets/[id]/docs`: προβολή (DG τυπογραφία, πίνακες, στιγμιότυπα ανά βήμα), επεξεργασία ενότητας (markdown editor), «Αναπαραγωγή», εκδόσεις, εξαγωγή Markdown, εξαγωγή PDF (HTML → `page.pdf()` στον worker → Bunny), link κοινοποίησης με λήξη (`/share/docs/[token]`, χωρίς login, read‑only).
4. Αυτόματη αναπαραγωγή σε κάθε δημοσίευση έκδοσης ροής του συστήματος (job στον worker).
5. `lib/docs/postman.ts`: OpenAPI της συλλογής → Postman v2.1 — **ένας φάκελος ανά πόρο** με τα resource‑style requests του (POST/PUT/DELETE/GET/action, docs/24 §5) και path params ως μεταβλητές (requests Run async/sync, Validate, Batch, Get run, Get artifacts· examples από τα inputs· saved responses επιτυχίας/σφάλματος· pre-request script για `Idempotency-Key`· tests που αποθηκεύουν `runId`) + environment (`baseUrl = https://complete.dgsmart.gr/api/v1`, `apiKey`).
6. Λήψεις από το UI (σελίδα συλλογής και σελίδα συστήματος) και endpoints `GET /api/v1/collections/{c}/postman.json`, `GET /api/v1/targets/{slug}/postman.json`, `GET /api/v1/targets/{slug}/docs.md`.
7. Προαιρετικό push στο Postman workspace του tenant αν έχει ρυθμιστεί Postman API key (κρυπτογραφημένο).
8. Tests: το παραγόμενο collection περνά το schema του Postman v2.1· `newman run` στο collection του sandbox με το seed key περνά.

## Κριτήρια αποδοχής
- [ ] «Sandbox ERP» → τεκμηρίωση με στιγμιότυπο ανά βήμα, πίνακα πεδίων, κατάλογο μηνυμάτων, PDF που ανοίγει σωστά.
- [ ] `newman run` στο Postman collection της συλλογής `erp` περνά όλα τα tests.
- [ ] Νέα δημοσίευση ροής → νέα έκδοση τεκμηρίωσης που κρατά τις χειροκίνητες αλλαγές.
- [ ] Το link κοινοποίησης λήγει και δεν δείχνει κανένα ευαίσθητο στοιχείο.
