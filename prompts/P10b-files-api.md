# P10b — Αρχεία μέσω API

## Πλαίσιο
Διάβασε: `docs/21-files-api.md` (όλο), `docs/07` (API, scopes, idempotency), `docs/05` (τύπος `file`, βήμα `upload`), `docs/08` (Bunny Storage), `docs/10` §4β (εργασίες στον κώδικα). Προϋπόθεση: P10.

## Στόχος
Η εφαρμογή του πελάτη στέλνει παραστατικά/δικαιολογητικά με ασφάλεια (προ‑ανέβασμα, inline ή URL), τα αρχεία ελέγχονται για ιούς και σβήνονται μετά την εκτέλεση. Τα `upload` βήματα τα χρησιμοποιούν με `fileId`.

## Εργασίες
1. Prisma: `FileObject`, `RunFile` (docs/21 §8) με RLS. Scopes `files:read`, `files:write` στα API keys.
2. `lib/files/`: αποθήκευση σε `/{tenantId}/quarantine/…` → μετά τον έλεγχο σε `/{tenantId}/files/{id}`· sha256, magic bytes (`file-type`), allowlist/denylist τύπων, όρια ανά πακέτο.
3. Endpoints: `POST /files` (multipart, streaming χωρίς να φορτώνεται όλο στη μνήμη), `POST /files/from-url` (https μόνο, προστασία SSRF, timeout, όριο μεγέθους, χωρίς cross‑host redirects), `POST /files/uploads` + `/complete` (signed PUT προς Bunny για > 25 MB), `GET /files/{id}`, `DELETE /files/{id}`. Idempotency με sha256.
4. Inline multipart στο `POST …/runs` (μέρος `input` + αρχεία, αναφορά με `{ "part": "…" }`) και `{ "url": … }` στο input: μετατρέπονται σε FileObject **πριν** την ουρά.
5. Antivirus: queue `files` στον worker με ClamAV (`clamd` sidecar στο Dockerfile/compose, `freshclam`). Καταστάσεις `PENDING`/`CLEAN`/`INFECTED`/`SUSPICIOUS`, PDF με JavaScript → `SUSPICIOUS`. Σε `INFECTED`: διαγραφή, audit, ειδοποίηση.
6. Validation input: πεδία `file` με `accept` / `maxSizeMb` στο inputSchema, έλεγχος ιδιοκτησίας tenant και `scanStatus`. `422 E_FILE_INVALID` χωρίς χρέωση. Run που περιμένει έλεγχο μένει στην ουρά έως 5′.
7. Worker `upload` βήμα: λήψη από Bunny σε προσωρινό φάκελο, `setInputFiles` με το αρχικό όνομα, διαγραφή μετά το βήμα, εγγραφή σε `RunFile` και sha256/όνομα στο `RunStep`.
8. Retention: εργασία `retention.files` στο `lib/jobs/registry.ts` (αχρησιμοποίητα 7 ημέρες, 24h μετά την επιτυχία, κατά πακέτο σε αποτυχία, `files.keepAfterSuccess`).
9. OpenAPI/Postman (P13): το `file` εμφανίζεται ως `oneOf { fileId | part | url }`, με παραδείγματα multipart στο Postman collection.
10. Tests: upload 25 MB και 150 MB (session), EICAR test file → INFECTED, SSRF (`http://169.254.169.254`, `localhost`) → απόρριψη, ροή sandbox με upload πολλών αρχείων μέσα σε `forEach`.

## Κριτήρια αποδοχής
- [ ] `POST /files` → `fileId` → run με `upload` στο sandbox ολοκληρώνεται και το αρχείο φαίνεται ανεβασμένο με το αρχικό όνομα.
- [ ] Inline multipart και URL δίνουν το ίδιο αποτέλεσμα.
- [ ] EICAR απορρίπτεται και το run που το χρησιμοποιεί γίνεται FAILED `E_FILE_INFECTED` χωρίς χρέωση.
- [ ] `fileId` άλλου tenant → 422 (και test RLS).
- [ ] 24 ώρες μετά την επιτυχία το αρχείο δεν υπάρχει στο Bunny, ενώ το sha256 μένει στο RunStep.
