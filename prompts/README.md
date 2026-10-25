# Prompts για Claude Code — DG Complete

Εκτέλεσε με τη σειρά. Κάθε prompt είναι αυτόνομο και παραπέμπει στα docs. Βάση: fork του `cloudzeus/dgsmartbi` (P00).

| # | Prompt | Εξαρτάται από | Milestone |
|---|---|---|---|
| P00 | [Fork dgsmartbi & καθαρισμός](P00-bootstrap.md) | — | M1 |
| P01 | [Shell & IA του DG Complete](P01-design-system-shell.md) | P00 | M1 |
| P02 | [Schema Prisma 7 & απομόνωση tenants](P02-database-rls.md) | P00 | M1 |
| P03 | [Ρόλοι, Entra ID, εγκρίσεις](P03-auth-tenancy.md) | P01, P02 | M1 |
| P04 | [Συστήματα‑στόχοι & θυρίδα κωδικών](P04-targets-credentials.md) | P03 | M2 |
| P05 | [Workflow DSL (`lib/dsl`)](P05-workflow-dsl.md) | P00 | M2 |
| P06 | [Recorder extension](P06-recorder-extension.md) | P05 | M3 |
| P07 | [Καταγραφή→ροή, editor, εγκρίσεις](P07-workflow-editor.md) | P04, P06 | M3 |
| P07b | [Οπτικός καμβάς ροών (React Flow)](P07b-visual-canvas.md) | P07 (overlay εκτέλεσης μετά το P09) | M3 |
| P07c | [«Ολοκληρώθηκε», REST μέθοδος & επανάληψη](P07c-completion-rest-replay.md) | P06, P07 (REST routes με το P10) | M3 |
| P08 | [Μηχανή εκτέλεσης & worker, Bunny storage](P08-engine-worker.md) | P04, P05 | M2 |
| P09 | [Logs, στιγμιότυπα, run viewer](P09-logging-run-viewer.md) | P08 | M3 |
| P09b | [Ζωντανή προβολή για OTP / CAPTCHA](P09b-live-assist.md) | P08, P09 | M3 |
| P10 | [Συλλογές μεθόδων & public API](P10-public-api.md) | P09 | M4 |
| P10b | [Αρχεία μέσω API](P10b-files-api.md) | P10 | M4 |
| P11 | [Μαζικές εργασίες, Excel, webhooks](P11-jobs-webhooks.md) | P10 | M4 |
| P11b | [Data mapping από Excel/CSV](P11b-data-mapping.md) | P11, P10b | M4 |
| P11c | [Αναγνώριση αλλαγών & αυτόματη παύση](P11c-change-detection.md) | P09, P11, P07b | M4 |
| P11d | [Εξαγωγή δεδομένων & προορισμοί](P11d-data-extraction.md) | P06, P07c, P08, P10b, P11 | M4 |
| P12 | [Ανάλυση DOM με AI (OpenRouter)](P12-ai-openrouter.md) | P07, P09 | M4b |
| P13 | [Τεκμηρίωση ανά σύστημα & Postman](P13-system-docs-postman.md) | P10, P12 | M4b |
| P14 | [Dashboard & τιμολόγηση ανά εκτέλεση](P14-dashboard-usage.md) | P11 | M5 |
| P15 | [Hardening & e2e](P15-hardening.md) | P14 | M5 |
| P16 | [Deployment Coolify](P16-deployment.md) | P15 | M5 |
| P17 | [Φάση 3](P17-phase3.md) | P16 + pilot | M6 |

Μετά το P16: **pilot WWA σε TAXIS & ΟΠΣΚΕ** — βλ. `docs/18-pilot-wwa.md` (οι ροές του pilot καταγράφονται από το UI, δεν χρειάζεται νέο prompt κώδικα· για ειδικές ανάγκες των δύο συστημάτων γράψε ad‑hoc prompt με βάση το docs/18).

## Πώς τα τρέχεις
- Όλα τα prompts, και το P00: άνοιξε το Claude Code μέσα στο clone του `cloudzeus/DG-Complete` (`dg-complete/`), όπου είναι ήδη τα docs, τα prompts και το CLAUDE.md.
```
> Διάβασε CLAUDE.md και prompts/P01-design-system-shell.md. Κάνε πρώτα σύντομο πλάνο, μετά υλοποίησε.
```
- Νέο session (`/clear`) ανά φάση· τα docs δίνουν τη συνέχεια.
- Στο τέλος: «Επιβεβαίωσε ένα‑ένα τα κριτήρια αποδοχής με εντολές και δείξε μου το output».
- Commit/tag ανά φάση: `git tag p03-done`.
