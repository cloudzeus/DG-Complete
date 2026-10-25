# P11b — Data mapping από Excel / CSV

## Πλαίσιο
Διάβασε: `docs/20-data-mapping.md` (όλο), `docs/05` (φίλτρα/εκφράσεις), `docs/18` §2 (credentialRef), `docs/21` (FileObject), `docs/16` (AI), `docs/14` (χρέωση μόνο επιτυχιών). Προϋπόθεση: P11 (jobs) και P10b (αρχεία).

## Στόχος
Αποθηκευμένα πρότυπα αντιστοίχισης που μετατρέπουν το Excel του πελάτη σε έγκυρα inputs, με μετασχηματισμούς, ομαδοποίηση γραμμών σε arrays, κωδικούς δικαιούχου, συνημμένα από ZIP/URL και Excel αποτελεσμάτων πάνω στο αρχικό αρχείο.

## Εργασίες
1. Prisma: `ImportMapping`, `ValueMap`, `Job.mappingId`/`mappingVersion` (docs/20 §10) με RLS.
2. `lib/import/read.ts` (worker): XLSX/XLS/CSV, encoding/delimiter detection, επιλογή φύλλου, auto header row, συγχωνευμένα κελιά, υπολογισμένες τιμές τύπων, κρυφές στήλες, joins φύλλων. Fingerprint επικεφαλίδων.
3. `lib/import/mapping.ts` (καθαρό TS + tests): εφαρμογή `definition` → εγγραφές. Περιλαμβάνει `groupBy`, `each: rows` για arrays, συναθροίσεις (`sum`, `count`, `first`, `join`), `const`, `defaults`, `valueMap`, `credentialRef`, `attachment`. Χρησιμοποιεί τα φίλτρα/εκφράσεις του `lib/dsl` και ελληνικούς ελέγχους (`afm`, `iban`, `amka`).
4. Wizard στο `/t/[tenantId]/jobs/new` (docs/20 §4): αναγνώριση προτύπου, drag στήλης → πεδίο, editor μετασχηματισμού με autocomplete, προεπισκόπηση της τελικής εγγραφής με πλοήγηση, σφάλματα ανά γραμμή αρχείου, «Αποθήκευση ως πρότυπο», ένδειξη εκτελέσεων.
5. Σελίδα `/t/[tenantId]/methods/[id]/mappings` και `/t/[tenantId]/settings/value-maps` (CRUD, εισαγωγή πίνακα τιμών από Excel, audit).
6. Συνημμένα: ZIP μαζί με το Excel → FileObjects (docs/21), αντιστοίχιση ονόματος case‑insensitive, URLs μέσω `files/from-url`. Αρχείο που λείπει = σφάλμα γραμμής.
7. `credentialRef` και έλεγχος ύπαρξης/εξουσιοδότησης κωδικών για κάθε ΑΦΜ πριν το job.
8. AI: εργασία `suggestMapping` (docs/16) με redaction δειγμάτων, zod output, αποδοχή ανά πρόταση.
9. Συμβατότητα: όταν μια μέθοδος γίνει pin σε νέα έκδοση, έλεγχος όλων των προτύπων → `NEEDS_UPDATE` με εξήγηση (docs/20 §8) και ειδοποίηση.
10. API: `POST …/methods/{m}/jobs` με `multipart` (`file`, `mappingId`, `attachments`) ή `fileId`. `POST …/mappings/{id}/preview` (dry run, επιστρέφει εγγραφές και σφάλματα).
11. Export: το αρχικό αρχείο με στήλες αποτελέσματος (exceljs, διατήρηση μορφοποίησης), και μορφή «μόνο αποτυχίες».
12. Tests: Excel WWA δείγμα (2 φύλλα, 3 παραστατικά ανά αίτημα, ZIP 30 PDF), CSV Windows‑1253 με `;`, ημερομηνίες serial, δεκαδικά με κόμμα, ΑΦΜ χωρίς μηδενικά μπροστά.

## Κριτήρια αποδοχής
- [ ] Excel 360 γραμμών (120 αιτήματα × 3 παραστατικά) + ZIP → 120 εγγραφές με `invoices[3]` και `fileId`, 120 runs στο sandbox, export με αποτέλεσμα σε όλες τις γραμμές.
- [ ] Το ίδιο αρχείο τον επόμενο μήνα αναγνωρίζεται αυτόματα από το πρότυπο, χωρίς καμία ρύθμιση.
- [ ] Γραμμές με μη έγκυρο IBAN ή ΑΦΜ χωρίς κωδικούς εμφανίζονται στην αναφορά και δεν εκτελούνται ούτε χρεώνονται.
- [ ] Νέα έκδοση μεθόδου με νέο υποχρεωτικό πεδίο → το πρότυπο γίνεται `NEEDS_UPDATE` και δεν χρησιμοποιείται μέχρι να διορθωθεί.
- [ ] Η πρόταση AI δεν στέλνει πραγματικά ΑΦΜ/IBAN (test redaction).
