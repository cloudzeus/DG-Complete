# 15 — Fork του dgsmartbi ως βάση SaaS

**Απόφαση:** Το DG Complete ξεκινά ως fork του [`cloudzeus/dgsmartbi`](https://github.com/cloudzeus/dgsmartbi) (commit αναφοράς `87bfae5`). Κρατάμε το «control plane» (χρήστες, tenants, πακέτα, πληρωμές, δικαιώματα, audit, κλειδιά API, κρυπτογράφηση, email, scheduler) και αφαιρούμε όλα τα BI modules. Repo [`cloudzeus/DG-Complete`](https://github.com/cloudzeus/DG-Complete) (branch `master`), δική του βάση `DG_COMPLETE` και δικό του deploy. Το dgsmartbi μένει remote `upstream` για να περνάμε διορθώσεις της βάσης με cherry-pick.

## 1. Τι υπάρχει στο dgsmartbi (σύνοψη)

| Περιοχή | Υλοποίηση στο dgsmartbi | Αρχεία |
|---|---|---|
| Framework | Next.js 16.3.8, React 19.2, App Router, `proxy.ts`, Tailwind v4, shadcn (`radix-nova`), lucide icons | `next.config.ts`, `components.json`, `app/globals.css` |
| ORM | **Prisma 7.10** με `prisma-client` generator (`lib/generated/prisma`), `@prisma/adapter-pg`, `prisma.config.ts` | `lib/prisma.ts`, `prisma/` |
| Auth | **Better Auth** (email + κωδικός, χωρίς δημόσια εγγραφή, reset μέσω Mailgun, sessions 7 ημερών) | `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]` |
| Tenants | `Tenant` (status, plan, συνδρομή, ΑΦΜ, s1Trdr, isDemo), `Membership` (`TENANT_ADMIN` / `TENANT_USER`) | schema |
| Δικαιώματα | `PlatformRole` (SUPER_ADMIN/ADMIN/USER) + editable πίνακας `RolePermission` με defaults στον κώδικα, `can()`, `requirePermission()` | `lib/rbac.ts`, `app/admin/settings/access` |
| Πρόσβαση ανά πακέτο | `Plan.services[]` → `tenantAccess()` / `hasService()` (cache 60s) | `lib/services.ts`, `lib/tenant-services.ts` |
| Πληρωμές | `Payment` (Viva, κάρτα, μεταφορά) + αυτόματη αποστολή στο SoftOne της DGsoft ως SALDOC με atomic claim | `app/admin/payments`, `lib/softone-billing.ts` — στο DG Complete γίνεται **χρέωση** προς SoftOne, οι πληρωμές διαβάζονται από το SoftOne (docs/14 §5) |
| Συγχρονισμοί SoftOne | Σύνδεση με το SoftOne της DGsoft (`SoftOneConnection` scope `DGSOFT`), job `CUSTOMERS` που φέρνει τους πελάτες (TRDR) στο `s1_customer` και ενημερώνει τους συνδεδεμένους tenants (`Tenant.s1Trdr`), γενικά jobs `TABLE` → `s1_record`, ιστορικό `SyncRun`, προγραμματισμός από τον scheduler | `lib/softone-sync.ts`, `lib/softone*.ts`, `app/admin/customers`, `app/admin/settings/sync`, `app/admin/settings/softone` |
| Ledger μονάδων | `AiTokenLedger` (grant/topup/usage/adjust με μοναδικό key ανά μηνιαία χορήγηση) + `AiTokenRequest` (αίτημα πακέτου → έγκριση) | `lib/ai-tokens.ts` |
| API keys | `dgbi_` + 32 bytes, αποθήκευση SHA‑256, rate limit in‑process, έλεγχος πακέτου | `lib/api-keys.ts`, `lib/api-v1.ts` |
| Κρυπτογράφηση | AES‑256‑GCM keyring `DATA_ENCRYPTION_KEYS` με rotation | `lib/crypto.ts` |
| Audit | `AuditLog` (actor, tenant, action, entity, meta) | `lib/audit.ts` |
| Email | Mailgun, templates, logs, suppressions, tracking | `lib/email.ts`, `lib/mailgun.ts` |
| Scheduler | In‑process (instrumentation.ts) που καλεί `/api/internal/cron/run` κάθε λεπτό με `CRON_SECRET`, κλείδωμα ανά job στη βάση | `lib/scheduler.ts`, `instrumentation.ts` |
| Περιοχές UI | `/admin/*` (πλατφόρμα), `/dashboards/[tenantId]/*` (tenant), `/portal` | `app/` |
| Deploy | Dockerfile (standalone + migrations στο start), Coolify, Postgres μέσω Tailscale | `Dockerfile`, `docs/DEPLOY.md` |

## 2. Κρατάμε (όπως είναι ή με μικρές αλλαγές)

- `lib/auth.ts`, `lib/auth-client.ts`, σελίδες `login`, `forgot-password`, `reset-password` — **προσθέτουμε Microsoft Entra ID** (social provider του Better Auth) για πελάτες σε M365.
- `lib/rbac.ts` — νέα permissions του DG Complete (βλ. docs/02 §3) και νέοι tenant ρόλοι.
- `lib/prisma.ts`, `prisma.config.ts`, generator setup.
- `Tenant`, `Membership`, `RolePermission`, `User/Session/Account/Verification`, `Plan`, `Payment`, `ApiKey`, `AuditLog`, `Email*`, `AfmLookupSettings` + `AfmRegistry` (αυτόματη συμπλήρωση στοιχείων πελάτη από ΑΦΜ).
- **Συγχρονισμοί με το SoftOne της DGsoft — κρατιούνται ολόκληροι:** κάθε tenant αντιστοιχεί σε πελάτη της DGsoft (`Tenant.s1Trdr` / `s1Code`). Μένουν `SoftOneConnection` (scope `DGSOFT`), `S1Customer`, `SyncJob`, `SyncRun`, `S1Record`, τα enums `SyncKind`, `SyncJobType`, `SyncMode`, `SyncStatus`, `SyncDestination` (μόνο η τιμή `APP` σε χρήση), το job `CUSTOMERS` (πελάτες → `s1_customer` → ενημέρωση tenants), τα jobs `TABLE`, οι σελίδες `/admin/customers` (λίστα πελατών SoftOne, δημιουργία/σύνδεση tenant από πελάτη), `/admin/settings/sync` (jobs, ιστορικό, εγγραφές) και `/admin/settings/softone`, και η εκτέλεσή τους από τον in‑process scheduler.
- `lib/crypto.ts`, `lib/audit.ts`, `lib/email*.ts`, `lib/mailgun.ts`, `lib/softone.ts`, `lib/softone-billing.ts`, `lib/softone-sync.ts`, `lib/softone-labels.ts`, `lib/softone-lookups.ts`, `lib/softone-presets.ts`, `lib/softone-form.ts`, `lib/softone-detect.ts` (αν χρησιμοποιείται από τις σελίδες σύνδεσης), `lib/scheduler.ts`, `lib/format.ts`, `lib/utils.ts`, `lib/excel.ts`.
- `app/admin`: tenants (χωρίς τα BI panels, **με** το panel σύνδεσης με πελάτη SoftOne `s1-link`), customers, payments, plans, settings → access, users, email, billing, softone, **sync**, logs.
- `components/ui/*`, `components/admin/*` (app-sidebar, page-header, stat-card, payments-table), `components/data-table`.
- `app/globals.css` (ήδη DG Design System με fluid type tokens).
- Dockerfile (θα αποκτήσει δεύτερο target για τον worker).

## 3. Αφαιρούμε

- `cube/` και όλο το Cube integration (`lib/cube*.ts`, `CubeDeployment`, `app/api/internal/cube`, `app/admin/settings/cube`).
- `app/dashboards/**` (όλες οι BI σελίδες), `app/api/{bi,kimon,smart}`, `app/api/v1/{datasets,kpis,meta,query}`.
- Τα BI lib modules: `bi-*`, `pnl*`, `sales/purchase*`, `stock-health`, `working-capital`, `planning`, `profitability`, `industry`, `kimon/`, `smart/`, `geo`, `mapbox`, `demand-trends`, `customer-insights`, `reports`, `weekly-report`, `warehouse*`, `doc-series`, `kad`, `gr-regions`, κ.λπ.
- Από τους συγχρονισμούς αφαιρείται **μόνο** ό,τι αφορά το BI: ο προορισμός `WAREHOUSE` (εγγραφή σε schema `t_<tenant>` του Cube) και οι συνδέσεις SoftOne **των πελατών** (scope `TENANT`, `seedTenantJobs`, `app/admin/tenants/[id]/sources-*`, `imports-panel`). Τα πεδία `targetTable`, `columns`, `options` του `SyncJob` μένουν (nullable) για να μη σπάσει το cherry-pick.
- Μοντέλα: `DataConnection` (εκτός αν το χρειάζεται η σελίδα συνδέσεων — τότε μένει μόνο για SoftOne), `Pnl*`, `GeoSettings`, `IndustrySegmentation`, `Kimon*`, `DocSeriesOverride`, `ItemSubstitute`, `BudgetMonth`, `PlanningSettings`, `SavedReport`, `CubeDeployment`, και τα πεδία του `Tenant` για warehouse/BI (`warehouseStatus`, `biSettings`, `biBuiltAt`, …).
- Εξαρτήσεις: `maplibre-gl`, `mssql`, `mysql2`, `@react-pdf/renderer` (αν δεν χρειαστεί για αποδείξεις), `recharts` μένει για το dashboard.
- **AI:** τα `AiSettings`, `AiUsage`, `lib/openrouter.ts` και η σελίδα `/admin/settings/ai` **κρατιούνται ενεργά** για την ανάλυση DOM (docs/16). Τα `AiTokenLedger`, `AiTokenRequest`, `lib/ai-tokens.ts` και `/admin/ai-tokens` αντικαθίστανται από χρέωση κόστους + markup (`AiUsage.billedAmount`, `AiCreditLedger` για δώρα, docs/14 §7).

## 4. Αλλάζουμε / επεκτείνουμε

| Θέμα | Αλλαγή |
|---|---|
| Όνομα | `appName: "DG Complete"`, metadata, email templates, λογότυπο |
| Next.js | upgrade 16.3.8 → **16.4+** (`npx next upgrade`), React 19.3, `cacheComponents: true` |
| Περιοχή tenant | `/dashboards/[tenantId]` → **`/t/[tenantId]`** με το νέο IA (docs/09) — ίδιο pattern `requireDashboardTenant` → `requireTenant()` |
| Ρόλοι tenant | `TenantRole`: `TENANT_ADMIN`, **`TENANT_DESIGNER`**, **`TENANT_OPERATOR`**, `TENANT_USER` (= viewer) |
| Υπηρεσίες πακέτου | νέο `lib/services.ts`: `recorder`, `workflows`, `api`, `bulk`, `webhooks`, `artifacts_long` (μεγαλύτερη διατήρηση), `ai_repair` (φάση 3) |
| Πακέτα | `Plan` + `runsMonthly`, `overagePricePerRun`, `maxConcurrentRuns`, `artifactRetentionDays`, `logRetentionDays` (docs/14) |
| Χρεώσεις | `Payment` = χρέωση (+ `kind`, `periodFrom/To`, `runs`, `s1OpenAmount`)· `postPaymentToSoftOne` → `postChargeToSoftOne`· νέο sync job ανοιχτών υπολοίπων από SoftOne· **αφαιρείται η online πληρωμή Viva** |
| Ledger | νέο `RunCreditLedger` + `RunCreditRequest` στο ίδιο pattern με το `AiTokenLedger` |
| API keys | prefix `dgc_`, **scopes** και περιορισμός ανά συλλογή, rate limit σε **Valkey** (όχι in‑process, γιατί έχουμε πολλά replicas + worker) |
| Scheduler | κρατάμε τον in‑process scheduler (`instrumentation.ts` → `lib/scheduler.ts` → `/api/internal/cron/run`) και προσθέτουμε **μητρώο εργασιών στον κώδικα** `lib/jobs/registry.ts` + πίνακα `ScheduledTask` για κλείδωμα· βαριές εργασίες γίνονται enqueue στο BullMQ. **Τίποτα στα Scheduled Tasks του Coolify** (docs/10 §4β) |
| Αρχεία | νέο `lib/storage/bunny.ts` (Bunny Storage API + signed CDN URLs) |
| Icons | lucide όπως το dgsmartbi (αποδεκτή εναλλακτική του DG για Fluent) |
| Vengeance UI | προσθήκη registry `@vengeance` στο `components.json` |

## 5. Δομή repo μετά το fork

```
dg-complete/
├─ app/                    # Next.js (από dgsmartbi)
│  ├─ admin/               # πλατφόρμα (DGSoft)
│  ├─ t/[tenantId]/        # περιοχή tenant (νέο)
│  ├─ api/auth, api/v1, api/recorder, api/stream, api/artifacts, api/internal/cron
│  └─ login, forgot-password, reset-password
├─ lib/                    # κοινός κώδικας server (από dgsmartbi + νέα)
│  ├─ dsl/                 # Workflow DSL — καθαρό TS, χωρίς server-only (το χρησιμοποιεί και το extension)
│  ├─ engine/              # Playwright executors — χωρίς server-only (το τρέχει ο worker)
│  ├─ queue/  storage/  billing/  recorder/
├─ worker/                 # Node 24 process: BullMQ consumer + Playwright (imports από lib/)
├─ extension/              # WXT Chrome MV3 recorder (δικό του package.json)
├─ sandbox/                # δοκιμαστικό «τρίτο σύστημα» για tests
├─ prisma/                 # schema + migrations
├─ docs/  prompts/  design/
└─ Dockerfile              # targets: web, worker
```

> **Προσοχή στο `server-only`:** τα modules του dgsmartbi κάνουν `import "server-only"`, το οποίο πετάει σφάλμα όταν φορτώνεται σε απλό Node. Ο worker τρέχει με `node --conditions=react-server` (ή `tsx --conditions=react-server`), ώστε να μπορεί να χρησιμοποιεί `lib/prisma.ts`, `lib/crypto.ts` κ.λπ. Τα `lib/dsl` και `lib/engine` δεν εισάγουν `server-only`.

## 6. Συγχρονισμός με το upstream

- `git remote add upstream https://github.com/cloudzeus/dgsmartbi`.
- Διορθώσεις σε κοινά αρχεία (auth, rbac, crypto, payments, email) περνούν με `git cherry-pick` — γι' αυτό **δεν** μετακινούμε/μετονομάζουμε τα κοινά αρχεία χωρίς λόγο.
- Το `docs/15` κρατά πίνακα «αρχείο → κατάσταση (ίδιο / τροποποιημένο / νέο)» που ενημερώνεται σε κάθε φάση.
