# DG Complete — Πλατφόρμα αυτοματοποίησης καταχωρίσεων (Multi‑tenant SaaS)

> **Ξεκίνα από το [START-HERE.md](START-HERE.md)** — πώς στήνεις τον server και τρέχεις τα prompts με το Claude Code.
>
> Το repo αυτό είναι **documentation‑first**: όλος ο σχεδιασμός βρίσκεται στο `docs/` και η υλοποίηση γίνεται βήμα‑βήμα με τα prompts του `prompts/` μέσα στο Claude Code.
> **Βάση SaaS:** fork του [`cloudzeus/dgsmartbi`](https://github.com/cloudzeus/dgsmartbi) — κρατάμε auth, tenants, πακέτα, πληρωμές, RBAC, audit, API keys και κρυπτογράφηση· αφαιρούμε τα BI modules (βλ. `docs/15-fork-dgsmartbi.md`).

## Τι κάνει η πλατφόρμα

1. **Καταγράφει** τα βήματα που κάνει ένας χρήστης για να καταχωρίσει δεδομένα σε ένα τρίτο **web** σύστημα (ERP web clients, κρατικές πύλες, CRM, portals προμηθευτών κ.λπ.).
2. **Μετατρέπει** την καταγραφή σε **ροή (workflow)** — δομημένη, παραμετροποιημένη, versioned, με ελέγχους και εξαγωγή αποτελεσμάτων. Η δημοσίευση απαιτεί **έγκριση Admin**.
3. **Εκθέτει** τις δημοσιευμένες ροές ως **συλλογές μεθόδων** — REST endpoints με JSON Schema, OpenAPI, API keys, webhooks — για **μαζική και αυτόματη καταχώριση** από άλλες εφαρμογές.
4. **Εκτελεί** τις καταχωρίσεις σε headless browsers (Playwright workers) με ουρές, retries και όρια ανά tenant/σύστημα.
5. **Καταγράφει λεπτομερώς** κάθε εκτέλεση: logs ανά βήμα και **σε κάθε σφάλμα στιγμιότυπο οθόνης** (ολόκληρη σελίδα + στοιχείο), DOM, console/network, Playwright trace — αποθηκευμένα στο **Bunny** (Storage + CDN με υπογεγραμμένα URLs).
6. **Τεκμηριώνει** κάθε σύστημα που χαρτογραφεί (σελίδα, Markdown, PDF) και παράγει **Postman collection** για τις μεθόδους του· χρησιμοποιεί **OpenRouter** για την ανάλυση του DOM όπου χρειάζεται.
7. **Χρεώνει ανά εκτέλεση**, με **πακέτα** που περιλαμβάνουν εκτελέσεις ανά μήνα και πακέτα επιπλέον εκτελέσεων (βλ. `docs/14-billing.md`).

## Χάρτης τεκμηρίωσης

| # | Αρχείο | Περιεχόμενο |
|---|---|---|
| 00 | [docs/00-overview.md](docs/00-overview.md) | Όραμα, personas, γλωσσάρι, scope, μη‑στόχοι |
| 01 | [docs/01-architecture.md](docs/01-architecture.md) | Αρχιτεκτονική, δομή repo, stack, διαγράμματα ροής |
| 02 | [docs/02-multitenancy-security.md](docs/02-multitenancy-security.md) | Tenancy, ρόλοι, Better Auth, θυρίδα διαπιστευτηρίων, GDPR |
| 03 | [docs/03-data-model.md](docs/03-data-model.md) | Μοντέλο δεδομένων (επέκταση του schema του dgsmartbi) |
| 04 | [docs/04-recorder.md](docs/04-recorder.md) | Chrome extension recorder, event schema, locators |
| 05 | [docs/05-workflow-dsl.md](docs/05-workflow-dsl.md) | Workflow DSL: βήματα, μεταβλητές, templates, versioning |
| 06 | [docs/06-execution-engine.md](docs/06-execution-engine.md) | Worker, ουρές, sessions, retries, error taxonomy |
| 07 | [docs/07-public-api.md](docs/07-public-api.md) | Συλλογές μεθόδων, REST API, batch, webhooks, OpenAPI |
| 08 | [docs/08-logging-observability.md](docs/08-logging-observability.md) | Logs, στιγμιότυπα, Bunny storage, retention, viewer |
| 09 | [docs/09-ui-ux-dg-design.md](docs/09-ui-ux-dg-design.md) | Οθόνες, IA, DG design system |
| 10 | [docs/10-deployment.md](docs/10-deployment.md) | Docker, Coolify, περιβάλλοντα, backups |
| 11 | [docs/11-roadmap.md](docs/11-roadmap.md) | Φάσεις, milestones, κριτήρια αποδοχής |
| 12 | [docs/12-testing.md](docs/12-testing.md) | Στρατηγική δοκιμών, sandbox target app |
| 13 | [docs/13-risks-decisions.md](docs/13-risks-decisions.md) | ADRs, ρίσκα |
| 14 | [docs/14-billing.md](docs/14-billing.md) | Τιμολόγηση ανά εκτέλεση & πακέτα, ledger εκτελέσεων |
| 15 | [docs/15-fork-dgsmartbi.md](docs/15-fork-dgsmartbi.md) | Τι κρατάμε / αφαιρούμε / αλλάζουμε από το dgsmartbi |
| 16 | [docs/16-ai-openrouter.md](docs/16-ai-openrouter.md) | Ανάλυση DOM με OpenRouter: πεδία, σφάλματα, locators, κείμενα |
| 17 | [docs/17-system-docs-postman.md](docs/17-system-docs-postman.md) | Τεκμηρίωση ανά σύστημα & Postman collections |
| 18 | [docs/18-pilot-wwa.md](docs/18-pilot-wwa.md) | Pilot: World Wide Associates σε TAXIS & ΟΠΣΚΕ |
| 19 | [docs/19-visual-workflow-canvas.md](docs/19-visual-workflow-canvas.md) | Οπτικός καμβάς ροών (React Flow): βήματα με στιγμιότυπα, live εκτέλεση, heatmap, diff |
| 20 | [docs/20-data-mapping.md](docs/20-data-mapping.md) | Data mapping από Excel/CSV: πρότυπα, μετασχηματισμοί, ομαδοποίηση, συνημμένα |
| 21 | [docs/21-files-api.md](docs/21-files-api.md) | Αρχεία μέσω API: `POST /files`, URL, έλεγχος ιών, διαγραφή |
| 22 | [docs/22-live-assist.md](docs/22-live-assist.md) | Ζωντανή προβολή για OTP / CAPTCHA |
| 23 | [docs/23-change-detection.md](docs/23-change-detection.md) | Αναγνώριση αλλαγών, incidents, ειδοποιήσεις, αυτόματη παύση μεθόδων |
| 24 | [docs/24-recording-completion-rest-replay.md](docs/24-recording-completion-rest-replay.md) | «Ολοκληρώθηκε», τύπος κίνησης, slug, POST/PUT/DELETE/GET, επανάληψη μπροστά στον χρήστη |
| 25 | [docs/25-dependent-fields.md](docs/25-dependent-fields.md) | Εξαρτώμενα πεδία (cascading combo boxes): καταγραφή, εκτέλεση, κατάλογος επιλογών |
| 26 | [docs/26-data-extraction.md](docs/26-data-extraction.md) | Εξαγωγή δεδομένων: επιλογή πίνακα/στηλών/γραμμών/σελίδων, JSON/Excel, webhook, βάση, SoftOne, μόνο νέα/αλλαγμένα |

Επιπλέον:
- [`CLAUDE.md`](CLAUDE.md) — κανόνες και conventions για το Claude Code.
- [`docs/schema-additions.prisma`](docs/schema-additions.prisma) — τα **νέα** μοντέλα του DG Complete που προστίθενται στο schema του dgsmartbi.
- [`design/`](design/) — DG tokens, λογότυπα, `shadcn-theme.css` (το dgsmartbi έχει ήδη DG θέμα στο `app/globals.css`· αυτά είναι αναφορά).
- [`prompts/`](prompts/) — 18 διαδοχικά prompts (P00–P17) για υλοποίηση στο Claude Code.

## Πώς το χρησιμοποιείς με το Claude Code

```bash
git clone https://github.com/cloudzeus/DG-Complete.git dg-complete && cd dg-complete
claude
> Διάβασε το CLAUDE.md, το START-HERE.md και το prompts/P00-bootstrap.md και εκτέλεσέ το.
```
Το repo [`cloudzeus/DG-Complete`](https://github.com/cloudzeus/DG-Complete) (branch `master`) ξεκινά με τα specs. Το P00 κάνει merge τον κώδικα του dgsmartbi από το remote `upstream` (για να παίρνεις και αργότερα διορθώσεις της βάσης) και καθαρίζει τα BI modules. Όλες οι φάσεις τρέχουν μέσα στο ίδιο `dg-complete/`.

## Stack (σύνοψη)

Next.js **16.4+** (App Router, Cache Components, `proxy.ts`, React 19.3) · **Prisma ORM 7** (`prisma-client` generator + `@prisma/adapter-pg`) με PostgreSQL · **Better Auth** · shadcn/ui + Vengeance UI · Tailwind v4 · GSAP (διακριτικό motion) · DG Design System · Playwright · BullMQ + Valkey · **Bunny Storage + CDN** · WXT (Chrome MV3 extension) · npm · Coolify (Contabo).
