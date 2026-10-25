# P06 — Recorder Chrome extension (WXT, MV3)

## Πλαίσιο
Διάβασε: `docs/04-recorder.md` (όλο), `docs/01` §4.1, `docs/09` §1.

## Στόχος
Extension που καταγράφει ενέργειες στο σύστημα‑στόχο και τις στέλνει στην πλατφόρμα, με side panel για live επισκόπηση και χειροκίνητα βήματα.

## Εργασίες
1. Backend:
   - Server Action «Νέα καταγραφή» → `Recording` + recorder JWT (2h, `recordingId`, `tenantId`, `userId`) + 8‑ψήφιος κωδικός σύνδεσης (γραμμή με `expiresAt` 10′ στη βάση, ADR‑022).
   - `POST /api/recorder/connect`, `POST /api/recorder/[id]/events` (batch, validation με `RecorderEvent`, thumbnails στο storage μέσω `lib/storage`), `POST /api/recorder/[id]/finish` (καλείται από το κουμπί **«Ολοκληρώθηκε»** — η ανάλυση κίνησης, το παράθυρο επιβεβαίωσης και η επανάληψη υλοποιούνται στο P07c· εδώ κράτα ήδη `initialValue` πεδίων και κείμενα headings/κουμπιών/μηνυμάτων στα events).
   - CORS μόνο για `chrome-extension://<ID>`.
2. `extension/` (WXT + React + Tailwind με τα DG tokens):
   - `content.ts` σε `all_frames`: listeners (capture phase), debounce fills, `sensitive` για password και `autocomplete=cc-*` (η τιμή δεν στέλνεται), frame path, bbox.
   - `lib/locators.ts`: υποψήφιοι locators με βαθμολογία (docs/04 §4), `dom-accessibility-api`, ανίχνευση ασταθών ids.
   - `background.ts`: state, batching ανά 2s με retry, tabs/popups, `captureVisibleTab` thumbnails (JPEG 320px, max 1/s).
   - Side panel: κατάσταση, λίστα βημάτων live, «Ορισμός ως μεταβλητή», διαγραφή, εργαλεία Έλεγχος / Εξαγωγή / Αναμονή / Σχόλιο (Alt+click με highlight 2px `#0078D4`).
   - Popup: σύνδεση με κωδικό.
   - Optional host permissions που ζητούνται για τα allowedOrigins.
3. `/t/[tenantId]/recordings`: λίστα, modal «Νέα καταγραφή» με οδηγίες και κωδικό, σελίδα καταγραφής με timeline events.
4. Tests: Playwright με φορτωμένο extension καταγράφει τη φόρμα «Νέος πελάτης» του sandbox.

- Λίστες και εξαρτώμενα πεδία (docs/25 §1–§1.1): ανίχνευση widget (native/ARIA combobox/autocomplete/select2/PrimeFaces/Material), label+value, snapshot επιλογών, `effects` μέσω MutationObserver + παρακολούθηση XHR/fetch για 3s μετά από κάθε επιλογή. Στο side panel: ζωντανή ετικέτα «⛓ από NN», σύνοψη αλυσίδας με διόρθωση, ερώτηση «όνομα ή κωδικός», μεταβλητή/σταθερή τιμή, autocomplete ως ένα βήμα, προειδοποίηση όταν αλλάζει γονέας μετά το παιδί, σήμανση «αργή φόρτωση» και «εμφανίστηκε από».

## Κριτήρια αποδοχής
- [ ] Sandbox φόρμα Περιφέρεια → Π.Ε. → Δήμος (AJAX με καθυστέρηση 1–3s): η καταγραφή δείχνει την αλυσίδα ζωντανά και παράγει τρία `choose` με σωστά `dependsOn`· αλλαγή Περιφέρειας μετά τον Δήμο ακυρώνει τα παλιά βήματα.
- [ ] Καταγραφή φόρμας με iframe και popup παράγει σωστά events.
- [ ] Ο κωδικός δεν φτάνει ποτέ στον server (test).
- [ ] Λειτουργεί σε Chrome και Edge.
