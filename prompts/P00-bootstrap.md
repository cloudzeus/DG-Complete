# P00 — Fork του dgsmartbi & καθαρισμός

## Πλαίσιο
Διάβασε: `CLAUDE.md`, `docs/15-fork-dgsmartbi.md` (όλο), `docs/01-architecture.md` §2–§3, `docs/10-deployment.md` §2–§3.

## Στόχος
Το repo `cloudzeus/DG-Complete` (τοπικός φάκελος `dg-complete/`) από το `cloudzeus/dgsmartbi`, χωρίς τα BI modules, που χτίζει, ξεκινά και επιτρέπει login — με το όνομα DG Complete και τη δομή φακέλων του docs/01 §2.

## Εργασίες
1. **Repo:** το `https://github.com/cloudzeus/DG-Complete` (branch **`master`**) περιέχει ήδη τα specs: `CLAUDE.md`, `START-HERE.md`, `README.md`, `docs/` (μαζί με `docs/schema-additions.prisma`), `prompts/`, `design/`, `.claude/settings.json`. Δουλεύεις μέσα στο clone του (`dg-complete/`) και φέρνεις τον κώδικα του dgsmartbi με merge:
   ```bash
   git remote add upstream https://github.com/cloudzeus/dgsmartbi.git
   git fetch upstream
   git merge upstream/master --allow-unrelated-histories --no-commit
   git checkout --ours CLAUDE.md README.md     # κρατάμε τα δικά μας (το CLAUDE.md ξεκινά ήδη με @AGENTS.md)
   git add CLAUDE.md README.md
   git commit -m "P00: merge dgsmartbi base (upstream)"
   ```
   Μην κάνεις force push και μην ξαναγράψεις το ιστορικό του `master`. Το dgsmartbi μένει ως `upstream` για cherry-pick διορθώσεων.
2. Τα `docs/DEPLOY.md` και `docs/PLAN.md` του dgsmartbi μετακινούνται στο `docs/legacy-dgsmartbi/` (αναφορά, όχι πηγή αλήθειας). Το `.claude/launch.json` του dgsmartbi μένει δίπλα στο δικό μας `.claude/settings.json`. Μην αγγίξεις τα `docs/00–26`, τα `prompts/` και το `design/`.
3. Αφαίρεσε ό,τι λέει το docs/15 §3 (Cube, BI σελίδες/API/lib, BI μοντέλα και πεδία Tenant). Τρέξε `npm run typecheck` και καθάρισε κάθε αναφορά μέχρι να περνά. Μην αλλάξεις αρχεία που κρατάμε, πέρα από τα απαραίτητα imports.
   **Οι συγχρονισμοί με το SoftOne της DGsoft μένουν ακέραιοι** (πελάτες → tenants, jobs, ιστορικό, `/admin/customers`, `/admin/settings/sync`, `/admin/settings/softone`): αφαιρείς μόνο τον προορισμό `WAREHOUSE` και τις συνδέσεις SoftOne των πελατών (scope `TENANT`).
4. Δημιούργησε migration που αφαιρεί τα BI μοντέλα (νέα βάση `DG_COMPLETE`, οπότε προτίμησε **reset**: σβήσε τα παλιά migrations και φτιάξε ένα αρχικό `init` από το καθαρό schema).
5. Μετονομασία: `appName` του Better Auth, `metadata` στο `app/layout.tsx`, `package.json` name `dg-complete`, email templates/αποστολέας, λογότυπα (`public/brand`) — κείμενο «DG Complete».
6. Upgrade: `npx next upgrade` σε **16.4+** (React 19.3), `cacheComponents: true` στο `next.config.ts`· Node 24 στο Dockerfile. Pin `prisma`/`@prisma/client`/`@prisma/adapter-pg` σε `^7`.
7. Δομή φακέλων: κενά `lib/dsl`, `lib/engine`, `lib/queue`, `lib/storage`, `lib/billing`, `lib/recorder`, `worker/index.ts` (συνδέεται σε Valkey και κάνει log), `extension/` (`npx wxt@latest init` με React), `sandbox/` (μικρό Next ή Hono app στο port 4100).
8. Scripts στο `package.json`: `worker:dev` (`tsx --conditions=react-server worker/index.ts`), `sandbox:dev`, `seed:dev`, `test`, `test:int`, `test:e2e`.
9. `docker-compose.dev.yml`: postgres, valkey, mailpit. `.env.example` με τις μεταβλητές του docs/10 §3. `lib/env.ts` (zod) που φορτώνεται από web και worker.
10. Ενημέρωσε τον πίνακα «αρχείο → κατάσταση» στο docs/15 §6.
11. Commit και `git push origin master` (χωρίς force).

## Γνωστά σημεία από δοκιμαστική εκτέλεση (25/10)
Μια δοκιμή του P00 πάνω στο commit `87bfae5` έδειξε τα εξής — ακολούθησέ τα για να μη χαθεί χρόνος:
1. **Schema:** αφαίρεσε τα μοντέλα `DataConnection`, `Pnl*`, `GeoSettings`, `IndustrySegmentation`, `Kimon*`, `CubeDeployment`, `DocSeriesOverride`, `ItemSubstitute`, `BudgetMonth`, `PlanningSettings`, `SavedReport` και τα enums `WarehouseStatus`, `ConnectionPurpose/Engine/Environment`, `Pnl*`. **Κράτα το enum `ConnectionTestStatus`** — το χρησιμοποιεί το `SoftOneConnection.lastTestStatus`. Από το `Tenant` φεύγουν `warehouse*`, `bi*` και οι σχέσεις προς τα παραπάνω.
2. **Χειροποίητα indexes:** τα παλιά migrations έχουν δύο partial unique indexes που ο Prisma δεν παράγει· πρόσθεσέ τα στο τέλος του νέου `init`:
   ```sql
   CREATE UNIQUE INDEX "sync_run_one_running" ON "sync_run" ("connectionId", "kind") WHERE "status" = 'RUNNING';
   CREATE UNIQUE INDEX "sync_run_one_running_job" ON "sync_run" ("jobId") WHERE "status" = 'RUNNING' AND "jobId" IS NOT NULL;
   ```
3. **`lib/kad.ts`:** σβήνεται, αλλά το `/admin/settings/registry` χρειάζεται `getAfmSettings` + `lookupAfm` → μετέφερέ τα σε νέο `lib/afm.ts` (χωρίς τα κομμάτια warehouse).
4. **`lib/softone-sync.ts`:** αφαίρεσε `runWarehouseJob`, `seedTenantJobs`, `upgradeTenantJob`, τα imports `pnl`/`tenant-presets`/`warehouse-writer` και τον κλάδο `WAREHOUSE` στο `runSyncJob` (αντί γι' αυτόν: `throw` με σαφές μήνυμα). Ο συγχρονισμός πελατών μένει ίδιος.
5. **`lib/dashboards.ts`** → νέο `lib/tenant.ts` με `requireTenant(tenantId)` / `userTenants(user)`· placeholder σελίδα `app/t/[tenantId]` (layout + page) ώστε το portal να δείχνει `/t/<id>`. Ενημέρωσε `proxy.ts` matcher (`/t/:path*` αντί για `/dashboards/:path*`) και `app/page.tsx` (redirect σε `/portal`).
6. **`lib/services.ts`:** ξαναγράψε τις υπηρεσίες για το DG Complete (`workflows`, `recorder`, `api`, `bulk`, `webhooks`, `artifacts_long`, `ai`, `ai_repair`) χωρίς `cubes`· `NO_PLAN_SERVICES = []`. Αφαίρεσε `cubesOf`/`cubes` από το `lib/tenant-services.ts`.
7. **Σελίδες admin που σπάνε:** `/admin` (κάρτες Cube/συνδέσεων, `AiOverviewCard`), `/admin/settings/logs` (`dataConnection`, `warehouseStatus` → σφάλματα `softOneConnection`), `/admin/tenants` και `tenants-table` (στήλες Cube/συνδέσεις, provisioning), `/admin/tenants/[id]` (κρατάς: header με κουμπί «Περιοχή πελάτη» → `/t/<id>`, AI tokens, Πελάτης SoftOne, Χρήστες, Συνδρομή, Πληρωμές), `users-actions.ts` (`kimonChat`), `app/api/health` (χωρίς `lib/connections`), `app/api/v1/route.ts` + `lib/api-v1.ts` (χωρίς Cube/Kimon), `app/api/internal/cron/run` (χωρίς geocoding/kad/weekly). Sidebar: φεύγουν Dashboards, Mapbox, Cube, Συνδέσεις.
8. **RBAC:** αφαίρεσε `connections.warehouse.manage`, `tenant.dashboards.edit`, `tenant.orders.create`· τα νέα δικαιώματα έρχονται στο P03.
9. **Next 16.4.3 + `cacheComponents: true`:** το build αποτυγχάνει με «uncached or runtime data during prerendering» επειδή όλες οι σελίδες διαβάζουν session. Λύση για το P00: `<Suspense>` γύρω από το `{children}` στο `app/layout.tsx` (το P01 φέρνει τα shells στο static shell). Το `new Date().getFullYear()` στο `components/auth/auth-shell.tsx` δεν επιτρέπεται στο static shell → μικρό component με `"use cache"` + `cacheLife("days")`. Διάβασε `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`.
10. **Εξαρτήσεις που φεύγουν:** `maplibre-gl` (+ script `maplibre:worker`, `public/vendor`), `mssql`, `mysql2`, `@react-pdf/renderer`, `@types/mssql`· `next.config.ts` χωρίς `outputFileTracingIncludes` του Cube και `serverExternalPackages: ["pg", "exceljs"]`. Dockerfile: χωρίς `COPY … /app/cube`.
11. **Prisma config:** `datasource.url = DATABASE_URL_MIGRATOR ?? DATABASE_URL` (CLI απευθείας στο 5432)· `lib/prisma.ts` με `max: Number(process.env.DB_POOL_MAX ?? 10)` για τον PgBouncer.
12. **Branding:** «DGsmart BI» → «DG Complete», `bi.dgsmart.gr` → `complete.dgsmart.gr` (auth appName, layout metadata, email templates/footer, openrouter `X-Title`, excel creator, auth-shell, admin header). Σβήσε το template `weekly_report` και αναφορές στον «Κίμωνα». Στο auth-shell όχι radial‑gradient glow (κανόνας design).

## Κριτήρια αποδοχής
- [ ] `npm ci && npm run typecheck && npm run lint && npm run build` πράσινα.
- [ ] `npm run db:migrate && npm run seed:admin` σε κενή βάση `DG_COMPLETE`· login του SUPER_ADMIN στο `/login` → `/admin`.
- [ ] `grep -ri "cube\|kimon\|dgsmart bi" app lib` → μόνο σχόλια/τίποτα.
- [ ] Στο `/admin/settings/sync` το job «Πελάτες» τρέχει χειροκίνητα, γεμίζει το `/admin/customers` και από εκεί δημιουργείται tenant συνδεδεμένος με πελάτη (TRDR).
- [ ] `npm run worker:dev` ξεκινά και συνδέεται σε Valkey χωρίς σφάλμα `server-only`.
- [ ] `git remote -v` δείχνει `origin` (`cloudzeus/DG-Complete`) και `upstream` (`cloudzeus/dgsmartbi`)· το `master` έχει γίνει push χωρίς force.

## Μην κάνεις
- Μην μετονομάσεις/μετακινήσεις κοινά αρχεία του dgsmartbi (auth, rbac, crypto, payments, email) — χρειάζονται για cherry-pick.
- Μην εγκαταστήσεις Prisma 8 ή Auth.js.
