# P07 — Καταγραφή→ροή, editor και εγκρίσεις

## Πλαίσιο
Διάβασε: `docs/05` (όλο, ειδικά §6), `docs/09` §4 και οθόνη 20α, `docs/02` §3 (έγκριση), `docs/04` §5.

## Στόχος
Μετατροπή καταγραφής σε πρόχειρη ροή, οπτικός editor, test run, versioning και **υποχρεωτική έγκριση Admin** για δημοσίευση.

## Εργασίες
1. `lib/workflows.ts`: create από recording (`compileRecording`), ένα μόνο DRAFT ανά ροή, autosave με optimistic concurrency (`updatedAt`), `submitForApproval` (απαιτεί `validateForPublish` χωρίς errors και επιτυχημένο test run → `PENDING_APPROVAL` + `notify(... "approval.requested", { permission: "tenant.workflows.approve" })`), `approve` (TENANT_ADMIN, checksum, `PUBLISHED`), `reject(reason)` (→ `DRAFT`), `deprecate`, `archive`. Αν ο συντάκτης έχει `tenant.workflows.approve`, το `submit` δημοσιεύει απευθείας.
2. `/t/[tenantId]/workflows` λίστα.
3. `/t/[tenantId]/workflows/[id]` editor (client) όπως το wireframe docs/09 §4: λίστα βημάτων με `@dnd-kit` (nested), inspector ανά τύπο (react-hook-form + zod του `lib/dsl`), locator editor με «⌖» (μήνυμα στο extension για re‑pick), template input με autocomplete, panel Εισόδων/Εξόδων, panel «Έλεγχος», tabs Λίστα | JSON (Monaco) — ο **Καμβάς** (@xyflow/react) προστίθεται στο P07b και γίνεται η προεπιλεγμένη προβολή· κράτα την επιλογή βήματος και τον inspector σε κοινό store ώστε να τον μοιραστεί. Κουμπί «Υποβολή για έγκριση» (Designer) ή «Δημοσίευση» (Admin).
4. `/t/[tenantId]/workflows/[id]/versions`: λίστα + diff + breaking changes.
5. `/t/[tenantId]/approvals`: εκδόσεις σε αναμονή με diff, τελευταίο test run (στιγμιότυπα, διάρκεια), «Έγκριση» / «Απόρριψη με σχόλιο».
6. Login flows (`isLoginFlow`) και επιλογή τους στο section `login`.
7. «Δοκιμαστική εκτέλεση» → Run με trigger `UI_TEST` (εκτελείται όταν υπάρχει το P08· σύνδεση στο SSE).
8. `audit()` σε submit/approve/reject/archive.

## Κριτήρια αποδοχής
- [ ] Καταγραφή sandbox → ροή με σωστά βήματα και αυτόματες εισόδους.
- [ ] Designer: υποβολή → Admin λαμβάνει ειδοποίηση → έγκριση → v1 PUBLISHED. Designer δεν μπορεί να δημοσιεύσει μόνος του (403).
- [ ] Υποβολή χωρίς επιτυχημένο test run απορρίπτεται με σαφές μήνυμα.
- [ ] UPDATE σε PUBLISHED έκδοση απορρίπτεται από τη βάση.
