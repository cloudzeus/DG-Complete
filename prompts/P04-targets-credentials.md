# P04 — Συστήματα‑στόχοι & θυρίδα διαπιστευτηρίων

## Πλαίσιο
Διάβασε: `docs/02` §4, `docs/03` (TargetSystem, Credential, BrowserSession), `docs/09` οθόνες 3–4, `docs/06` §6, `lib/crypto.ts`.

## Στόχος
CRUD Συστημάτων‑στόχων και κρυπτογραφημένων διαπιστευτηρίων.

## Εργασίες
1. `lib/crypto.ts`: πρόσθεσε overload `encrypt(plain, aad)` / `decrypt(env, aad)` (AES‑GCM AAD) χωρίς να σπάσεις τις υπάρχουσες κλήσεις. Unit tests: λάθος AAD → σφάλμα, tamper → σφάλμα.
2. `lib/targets.ts`, `lib/credentials.ts` μέσω `tenantDb`/`withTenantTx`· ποτέ δεν επιστρέφουν `payloadEnc` στο web layer — μόνο `usernameHint`.
3. `/t/[tenantId]/targets`: DataTable + Sheet δημιουργίας/επεξεργασίας: όνομα, slug (αυτόματο με greeklish), baseUrl, allowedOrigins (default το origin του baseUrl), maxConcurrency, minDelayMs, sessionTtlSec, browserOptions, **υποχρεωτικό checkbox** «Δηλώνω ότι έχουμε δικαίωμα αυτοματοποιημένης πρόσβασης» (`automationConsentAt/By`).
4. `/t/[tenantId]/targets/[id]` tabs: Γενικά · Διαπιστευτήρια · Ροές (placeholder) · Υγεία (placeholder) · Ανιχνευτές σφαλμάτων (`{ name, css, kind }`).
5. Διαπιστευτήρια: δημιουργία (USERNAME_PASSWORD, +TOTP), masked πεδίο, default, «Αποκάλυψη» μόνο με `tenant.credentials.reveal` + επανεισαγωγή κωδικού (Better Auth `verifyPassword`) + `audit("credential.revealed")`.
6. Validation: allowedOrigins μόνο https (http μόνο σε development), όχι private IPs.
7. Πολλοί δικαιούχοι (docs/18 §2): πεδία `externalRef` (π.χ. `afm:094014201`), `tags`, `authorizationRef`, `authorizationExpiresAt`, `maxSessions` (default 1)· αναζήτηση/φίλτρο ανά ΑΦΜ· **μαζική εισαγωγή** από Excel (ΑΦΜ, επωνυμία, username, password) από TENANT_ADMIN με κρυπτογράφηση κατά το parsing και διαγραφή του αρχείου· υπενθύμιση λήξης εξουσιοδότησης.
8. Seed: «Sandbox ERP» + credential `demo/demo123` + 3 credentials δικαιούχων με `externalRef`.

## Κριτήρια αποδοχής
- [ ] Στη βάση το `payloadEnc` δεν περιέχει plaintext (test).
- [ ] Το RSC payload των σελίδων δεν περιέχει τον κωδικό (e2e grep).
- [ ] Reveal χωρίς επανεισαγωγή κωδικού απορρίπτεται· με επανεισαγωγή εμφανίζεται και γράφεται audit.
