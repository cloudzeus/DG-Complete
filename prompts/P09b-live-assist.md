# P09b — Ζωντανή προβολή για OTP / CAPTCHA (live assist)

## Πλαίσιο
Διάβασε: `docs/22-live-assist.md` (όλο), `docs/05` (`humanTask`), `docs/06` (NEEDS_ATTENTION, `E_CAPTCHA_DETECTED`, `E_HUMAN_TIMEOUT`), `docs/08` (masking), `docs/10` (Traefik/WebSocket). Προϋπόθεση: P08 (worker) και P09 (σελίδα εκτέλεσης).

## Στόχος
Ο χειριστής ολοκληρώνει OTP/CAPTCHA από τη σελίδα της εκτέλεσης, βλέποντας ζωντανά τον browser του worker με περιορισμένη αλληλεπίδραση, και η εκτέλεση συνεχίζει αυτόματα.

## Εργασίες
1. DSL: επέκταση του `humanTask` με `fields[].fill`, `allow[]`, `mode` (`focus` | `full`), `completeWhen`· `detectCaptcha` σε login flows (docs/22 §6). Ενημέρωση `validateDefinition` και tests.
2. Worker: στο `humanTask`, παύση με ανοιχτό context, `run.needs_attention` event και μετακίνηση του run σε χωριστό όριο `maxWaitingRuns` ώστε να μη δεσμεύει slot. Όταν δοθούν τιμές από τη φόρμα (`fields`), συμπλήρωσή τους από τον worker.
3. Assist channel: `lib/assist/` — εφήμερο υπογεγραμμένο token (2′, ανανέωση), lock ενός χειριστή ανά run με `expiresAt` στη βάση (ADR‑022). Ο worker κάνει CDP `Page.startScreencast` (JPEG q60, ≤ 1280px, ≤ 5 fps) μόνο όσο είναι ανοιχτό το panel.
4. Web gateway: route `/api/assist/[runId]` με WebSocket (Node runtime) που προωθεί frames και input μέσω εσωτερικού WebSocket προς τον worker (`WORKER_ASSIST_URL`, κοινό secret, μόνο ιδιωτικό δίκτυο — ADR‑022). Ρύθμιση Traefik/Coolify για upgrade.
5. Έλεγχος input στον worker: συντεταγμένες κλικ και focus πληκτρολόγησης μόνο μέσα στα bounding boxes των `allow` locators (σε `focus` mode). Χωρίς πλοήγηση, νέα tabs ή downloads. `Input.insertText` για paste.
6. UI: panel «Χρειάζεται ενέργεια» στη σελίδα εκτέλεσης και πάνω στον κόμβο του καμβά (docs/19 §4). Περιέχει: εικόνα, θόλωμα εκτός επιτρεπτής περιοχής, οδηγίες, αντίστροφη μέτρηση, φόρμα `fields`, «Ολοκληρώθηκε» / «Αδυναμία». Λίστα «Αναμένουν ενέργεια» στη σελίδα του job.
7. Ειδοποιήσεις: in‑app (με ήχο αν η καρτέλα είναι ανοιχτή), email, Teams webhook αν υπάρχει. Υπενθύμιση στο 50% του timeout, `E_HUMAN_TIMEOUT` στη λήξη (χωρίς χρέωση).
8. Δικαιώματα `tenant.runs.assist` και `tenant.runs.assist.full`. Audit `assist.open|input|complete|timeout` χωρίς τιμές. Αποθήκευση μόνο στιγμιότυπου πριν/μετά (masked), όχι frames.
9. Sandbox: σελίδα με OTP (κωδικός που εμφανίζεται σε δεύτερη σελίδα του sandbox) και ψεύτικο CAPTCHA για τα tests.

## Κριτήρια αποδοχής
- [x] Ροή sandbox με OTP: το run γίνεται NEEDS_ATTENTION, ο χειριστής λαμβάνει ειδοποίηση, ανοίγει την προβολή, πληκτρολογεί τον κωδικό και το run ολοκληρώνεται SUCCEEDED χωρίς άλλη ενέργεια.
- [x] Σε `focus` mode, κλικ εκτός του επιτρεπτού πεδίου αγνοείται (test που στέλνει κλικ σε άλλο κουμπί). Σε `full` mode λειτουργεί μόνο με το αντίστοιχο δικαίωμα.
- [x] Δεύτερος χρήστης που ανοίγει την ίδια προβολή βλέπει «Σε χρήση από …».
- [x] Ο κωδικός OTP δεν εμφανίζεται σε RunLog, RunStep, audit ή στιγμιότυπα.
- [x] Όσο 5 runs περιμένουν OTP, τα υπόλοιπα runs του tenant εκτελούνται κανονικά.
- [x] Timeout → FAILED `E_HUMAN_TIMEOUT`, χωρίς χρέωση, ο browser context κλείνει.
