# P09 — Logs, στιγμιότυπα & Run viewer

## Πλαίσιο
Διάβασε: `docs/08-logging-observability.md` (όλο), `docs/09` οθόνες 13–15.

## Στόχος
Οθόνες διάγνωσης: λίστα εκτελέσεων, λεπτομέρεια με βήματα/στιγμιότυπο/logs, trace viewer, «Προς ενέργεια», και διατήρηση δεδομένων.

## Εργασίες
1. `/t/[tenantId]/runs`: DataTable (TanStack Virtual) με cursor pagination, φίλτρα (κατάσταση, μέθοδος, σύστημα, ημερομηνίες, externalRef, κωδικός σφάλματος), live updates (SSE `tenant:{id}:runs`).
2. `/t/[tenantId]/runs/[id]` όπως το wireframe docs/08 §4: header (StatusBadge, μέθοδος/έκδοση, προσπάθεια, διάρκεια, μονάδες χρέωσης, ενέργειες), `StepTimeline`, `ScreenshotViewer` (tabs Σελίδα / Στοιχείο / Viewport / DOM σε sandboxed iframe, zoom/pan, highlight από `meta.bbox`, GSAP 240ms), μήνυμα συστήματος, εξήγηση κωδικού σφάλματος, `LogStream` virtualized, tabs προσπαθειών. Δομή σελίδας ώστε να χωρέσει δεύτερη προβολή **«Καμβάς»** (`<WorkflowCanvas mode="run">`, P07b): κοινό state επιλεγμένου βήματος ανάμεσα σε `StepTimeline` και καμβά.
3. `/api/artifacts/[id]`: `requirePermission("tenant.artifacts.view", tenantId)` → `302` σε `storage.signedUrl(path, 900)`.
4. Self‑host Playwright trace viewer στο `/trace-viewer` που φορτώνει από signed Bunny URL (CORS του pull zone).
5. `/t/[tenantId]/attention`: runs σε NEEDS_ATTENTION, οδηγίες `humanTask`, πεδία (π.χ. OTP) → συνέχεια (ο worker περιμένει γραμμή `HumanInput` + `pg_notify` στο κανάλι `run_events`, ADR‑022).
6. Scheduler (στον κώδικα — δήλωσε τις εργασίες στο `lib/jobs/registry.ts`, docs/10 §4β· όχι στο Coolify): sweeper artifacts (`storage.delete` σε batches, `deletedAt`), διαγραφή logs, partition επόμενου μήνα.
7. Λεξικό σφαλμάτων `lib/labels.ts` → `errors.E_*` (τίτλος + «Τι να ελέγξεις»).

## Κριτήρια αποδοχής
- [ ] Από το αποτυχημένο run του P08 ο χρήστης βλέπει σε μία οθόνη βήμα, μήνυμα, στιγμιότυπο με highlight, logs.
- [ ] Χρήστης άλλου tenant ή χωρίς δικαίωμα → 403 στο `/api/artifacts/[id]`· signed URL μετά τα 15′ → 403 από το Bunny.
- [ ] Ο sweeper σβήνει ληγμένα artifacts (test με χειραγώγηση ρολογιού, local driver).
- [ ] humanTask: εισαγωγή OTP ολοκληρώνει το run.
