# P07c — «Ολοκληρώθηκε», REST μέθοδος και επανάληψη μπροστά στον χρήστη

## Πλαίσιο
Διάβασε: `docs/24-recording-completion-rest-replay.md` (όλο), `docs/04` (recorder, events, locators, side panel), `docs/05` (DSL, commitPoint, dialog), `docs/07` (API), `docs/16` (`segmentFlow`, `suggestLocator`). Προϋπόθεση: P06 (extension) και P07 (compile/editor). Τα REST endpoints ολοκληρώνονται μαζί με το P10.

## Στόχος
Κάθε καταγραφή κλείνει με «Ολοκληρώθηκε» ως μία ολοκληρωμένη κίνηση. Η εφαρμογή προτείνει τύπο κίνησης, όνομα, slug, κλειδί και HTTP method (POST/PUT/DELETE/GET), και ξαναπαίζει την κίνηση ορατά στον browser του χρήστη πριν την αποθήκευση.

## Εργασίες
1. Recorder: κράτα `initialValue` κάθε πεδίου όταν πρωτοεμφανίζεται, κείμενα κουμπιών/headings/breadcrumb της σελίδας, μηνύματα μετά το submit και dialogs. Επέκταση του `RecorderEvent` (zod).
2. Side panel: το «Τέλος» γίνεται **«Ολοκληρώθηκε»**, με τους ελέγχους πληρότητας του docs/24 §1, πρόταση χωρισμού σε δύο καταγραφές όταν υπάρχουν δύο submits σε διαφορετικές φόρμες, και επιλογή μηνύματος επιτυχίας με ένα κλικ.
3. `lib/dsl/classify-recording.ts` (καθαρό TS + tests με fixtures καταγραφών CREATE/UPDATE/DELETE/READ/ACTION από το sandbox): intent, βεβαιότητα, αιτιολογίες, κλειδί (πεδίο αναζήτησης ή τμήμα URL), σημείο δέσμευσης, προτεινόμενες έξοδοι, προαιρετικά πεδία για UPDATE. Λεξικά όρων ανά γλώσσα και ανά TargetSystem.
4. `lib/dsl/naming.ts`: όνομα (ρήμα + αντικείμενο), slug πόρου με ELOT 743, stop‑words, δεσμευμένες λέξεις, έλεγχος μοναδικότητας (συλλογή + πόρος + method), πρόταση προσθήκης σε υπάρχοντα πόρο. Εργασία AI `suggestNaming` (docs/16) ως βελτίωση, με redaction.
5. Παράθυρο επιβεβαίωσης (side panel και web) όπως το docs/24 §4: επιλογή κίνησης με αιτιολογία, όνομα, slug με live έλεγχο, κλειδί, προεπισκόπηση endpoint, είσοδοι/έξοδοι, σημείο δέσμευσης, κουμπιά «Επανάληψη τώρα» / «Αποθήκευση χωρίς επανάληψη» / «Συνέχεια καταγραφής».
6. Replay στο extension (`extension/replay/`): εκτελεστής υποσυνόλου DSL με `lib/dsl` και νέο `lib/dsl/dom-locator.ts` (ίδια ιεράρχηση με το engine). Επίσης: πλοήγηση μέσω background, dialogs από main‑world script, upload με `DataTransfer`, fill με πραγματικά input events, highlight + ετικέτα βήματος, ταχύτητες 1×/2×/4×, παύση, βήμα‑βήμα, διακοπή.
7. Ασφάλεια replay: σε CREATE/UPDATE/DELETE/ACTION στάση πριν το σημείο δέσμευσης (default), «Ολοκλήρωση με άλλα δεδομένα», «Πλήρης επανάληψη» μόνο με πληκτρολόγηση «ΕΠΑΝΑΛΗΨΗ». Σε READ πλήρης επανάληψη και σύγκριση των τιμών που διαβάστηκαν.
8. Διόρθωση σε αποτυχία: ⌖ επιλογή στοιχείου ξανά, αναμονή, παράλειψη, ως προαιρετικό, πρόταση AI. Συνέχεια από το ίδιο βήμα. Αποθήκευση στο draft και στο `Recording.replays`.
9. Αποθήκευση: `Recording.status = VERIFIED`, `Workflow.intent/resourceSlug`, πρόχειρη ροή και **ανενεργή** μέθοδος με `httpMethod`, `resource`, `action`, `keyParams` (docs/24 §7).
10. REST routes (μαζί με P10): `app/api/v1/[collection]/[resource]/route.ts` (POST, GET λίστα αν υπάρχει READ χωρίς κλειδί), `…/[resource]/[...key]/route.ts` (GET, PUT, PATCH, DELETE, POST action) → δημιουργία Run όπως στο docs/07, `Prefer: respond-async | wait=N`, `X-Credential-Ref`, 404 `E_NOT_FOUND` για DELETE/GET/PUT όταν η ροή αναγνωρίσει «δεν βρέθηκε». Ενημέρωση του OpenAPI/Postman (operationIds, path params, φάκελοι ανά πόρο).
11. Μετά την αποθήκευση: κουμπί «Δοκιμή στον server» που ξεκινά test run με ζωντανή εικόνα στον καμβά (docs/19, docs/22).

## Κριτήρια αποδοχής
- [ ] Πέντε καταγραφές στο sandbox (νέος πελάτης, τροποποίηση πελάτη, διαγραφή πελάτη, προβολή πελάτη, «οριστική υποβολή») αναγνωρίζονται σωστά ως CREATE/UPDATE/DELETE/READ/ACTION, με σωστό κλειδί και σημείο δέσμευσης.
- [ ] Οι τέσσερις πρώτες μοιράζονται τον πόρο `pelatis` και δίνουν `POST /api/v1/sandbox/pelatis`, `PUT …/pelatis/{afm}`, `DELETE …/pelatis/{afm}`, `GET …/pelatis/{afm}`· το OpenAPI τα δείχνει κάτω από ένα path.
- [ ] Η επανάληψη ενός CREATE σταματά πριν την «Αποθήκευση» και **δεν** δημιουργείται εγγραφή στο sandbox. Η πλήρης επανάληψη ζητά την επιβεβαίωση «ΕΠΑΝΑΛΗΨΗ».
- [ ] Αλλαγή label στο sandbox ανάμεσα σε καταγραφή και επανάληψη → το βήμα αποτυγχάνει, ο χρήστης κάνει ⌖ στο σωστό πεδίο, η επανάληψη συνεχίζει και ο νέος locator υπάρχει στο draft.
- [ ] Slug που υπάρχει ήδη για την ίδια κίνηση απορρίπτεται, ενώ για άλλη κίνηση προτείνεται προσθήκη στον ίδιο πόρο.
- [ ] Η μέθοδος μένει ανενεργή μέχρι την έγκριση και η κλήση του endpoint πριν από αυτήν δίνει `404`.
