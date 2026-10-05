# DGsmart BI — Πλάνο Ανάπτυξης

Multi-tenant BI πλατφόρμα της DGsoft πάνω σε έναν κοινό Cube.dev server (`https://cube.dgsmart.gr`).

---

## 0. Διορθώσεις στην αρχική αρχιτεκτονική (πριν ξεκινήσουμε)

| # | Αρχικό διάγραμμα | Πρόβλημα | Πρόταση |
|---|---|---|---|
| 1 | Το Cube συνδέεται απευθείας στη βάση SoftOne του πελάτη μέσω `driverFactory()` | Δεν υπάρχει direct DB connection στις εγκαταστάσεις των πελατών (oncloud) | **Ενδιάμεση αποθήκη (warehouse)**: τα δεδομένα αντλούνται μέσω S1 WS / SqlData και γράφονται σε PostgreSQL. Το Cube διαβάζει **μόνο** από εκεί. |
| 2 | `CUBEJS_DEV_MODE=true` στην παραγωγή | Το dev mode απενεργοποιεί ασφάλειες, κάνει recompile, εκθέτει Playground | **Δύο instances**: `cube-dev` (Playground, dev mode, μόνο για εμάς) και `cube.dgsmart.gr` (production, dev mode off, schemas από git). |
| 3 | Τα schemas ζουν μόνο σε Docker volume | Χωρίς version control, χωρίς rollback | Τα schemas μπαίνουν στο git repo (`/cube/model`) και γίνονται deploy από Coolify. Το Playground χρησιμοποιείται για πειραματισμό, όχι ως source of truth. |
| 4 | Ο browser καλεί κατευθείαν το Cube με JWT | Δεν μπορούμε να μετρήσουμε queries ανά πακέτο ούτε να κόψουμε ακαριαία πρόσβαση (το JWT ζει μέχρι να λήξει) | **Όλα τα calls περνούν από Next.js gateway** (`/api/bi/*`, `/api/v1/*`) που κάνει quota metering και υπογράφει βραχύβιο JWT (60s) προς το Cube. |
| 5 | Viva webhook με HMAC signature | Η Viva **δεν** υπογράφει τα webhooks με HMAC· κάνει GET verification με key | Επιβεβαίωση endpoint με το Viva verification key + **re-fetch της συναλλαγής** από το Viva API πριν αλλάξει οτιδήποτε. |
| 6 | Global κανόνας: Prisma + MySQL | Έχεις ήδη PostgreSQL `dgsmartbi` | Prisma over **PostgreSQL** για αυτό το project (ρητή εξαίρεση). |

---

## 1. Αρχιτεκτονική (τελική)

```
                     ┌───────────────────────── DGsoft SoftOne ─────────────────────────┐
                     │  CUSTOMER (TRDR)  ← tenant source   SALDOC/receipts ← billing sync │
                     └───────────────▲──────────────────────────────▲────────────────────┘
                                     │ S1 WS (login→authenticate)   │ setData
┌────────────────────────────────────┴──────────────────────────────┴───────────────────┐
│ NEXT.JS CONTROL PLANE (bi.dgsmart.gr)                                                  │
│  • Admin console (super admin / admin): tenants, πακέτα, συνδρομές, connectors        │
│  • Tenant portal (tenant admin / user): dashboards, χρήστες, API keys, billing        │
│  • BI Gateway  /api/bi/*   (session auth)  ─┐                                         │
│  • Public API  /api/v1/*   (API key auth)  ─┼─► quota check → JWT(60s) → Cube         │
│  • Viva webhooks /api/webhooks/viva         │                                         │
└─────────────────────────────────────────────┼─────────────────────────────────────────┘
          │ Prisma                            │
          ▼                                   ▼
┌───────────────────────┐        ┌──────────────────────────────┐
│ Postgres: dgsmartbi   │        │ Cube.dev  (cube.dgsmart.gr)  │
│ (control plane DB)    │        │  checkAuth → securityContext │
│ tenants, users, plans,│        │  contextToAppId = tenant     │
│ subscriptions, usage, │        │  driverFactory → tenant DB   │
│ connectors (encrypted)│        │  queryRewrite (defense)      │
└───────────────────────┘        └──────────────┬───────────────┘
                                                │ read-only role per tenant
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Postgres: dgsmartbi_wh (warehouse)   schema-per-tenant:  t_<tenantId>.sales_lines …   │
└───────────────────────────────────────────────▲───────────────────────────────────────┘
                                                │ upsert
┌───────────────────────────────────────────────┴───────────────────────────────────────┐
│ INGESTION WORKER (Node, pg-boss jobs)                                                  │
│  Connectors: SoftOne WS (getBrowserInfo/GetTable) · SoftOne SqlData · 3rd-party (REST) │
│  Incremental sync με watermark (UPDDATE), schedule ανά connector                      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Απομόνωση δεδομένων ανά tenant (ο πυρήνας)

Τρία ανεξάρτητα επίπεδα — αν σπάσει ένα, τα άλλα δύο κρατάνε:

1. **Φυσική απομόνωση στο warehouse**: κάθε tenant έχει δικό του Postgres schema `t_<id>` και δικό του DB role `r_<id>` με `USAGE/SELECT` **μόνο** σε αυτό το schema. Ο ingestion worker γράφει με ξεχωριστό role `r_<id>_writer`.
2. **Cube**: `checkAuth` επαληθεύει JWT (υπογεγραμμένο μόνο από το Next.js) → `securityContext = { tenantId, plan, roles }`.
   - `contextToAppId` → ξεχωριστό compile cache ανά tenant
   - `driverFactory` → σύνδεση με τα credentials του `r_<id>` (ο tenant δεν μπορεί καν να «δει» άλλο schema)
   - `COMPILE_CONTEXT` → τα cubes δείχνουν σε `${COMPILE_CONTEXT.securityContext.schema}.table`, και ενεργοποιούνται μόνο τα cubes που περιλαμβάνει το πακέτο
   - `queryRewrite` → απορρίπτει queries χωρίς έγκυρο context
   - `scheduledRefreshContexts` → pre-aggregations ανά tenant
3. **Gateway**: ο tenantId **δεν** έρχεται ποτέ από τον client· προκύπτει από το session ή το API key στον server.

**Ανά-tenant προσαρμογές**: κοινά «core» data models (πωλήσεις, αγορές, αποθήκη, πελάτες, ταμειακά) + προαιρετικά tenant-specific cubes σε `model/tenants/<id>/` που φορτώνονται μέσω `repositoryFactory`.

---

## 3. Ροή δεδομένων πελατών (Ingestion)

**Connector types** (πίνακας `Connector`, credentials κρυπτογραφημένα AES-256-GCM με master key σε env):

| Type | Χρήση | Υλοποίηση |
|---|---|---|
| `SOFTONE_WS` | Τυπικά objects (FINDOC, MTRLINES, TRDR, MTRL…) | `login → authenticate`, cached clientID ανά tenant στη DB (όχι σε αρχείο — πολλοί tenants), `getBrowserInfo/getBrowserData` με σελιδοποίηση, win1253 decode |
| `SOFTONE_SQL` | Βαριά/ειδικά datasets | `SqlData` με named SQL script που εγκαθιστούμε στο S1 του πελάτη· παράμετροι `fromDate/toDate/lastUpd` |
| `REST_GENERIC` | Τρίτα συστήματα (WooCommerce, e-shops, CRM) | Pluggable adapters με κοινό interface |
| `CSV_UPLOAD` | Fallback / ιστορικά | Upload → staging → load |

**Dataset definition**: κάθε connector έχει N datasets (π.χ. `sales_lines`) με: πηγή (object/browser/SQL script), mapping πεδίων → canonical στήλες, κλειδί, watermark πεδίο, schedule (cron). Έτσι κάθε πελάτης έχει **τις δικές του πηγές**, αλλά τα δεδομένα προσγειώνονται σε **κοινό canonical μοντέλο** που καταλαβαίνουν τα core cubes.

**Sync**: incremental upsert με watermark · πλήρες re-sync κατ' επιλογή · `SyncRun` log (rows, διάρκεια, σφάλματα) ορατό στον tenant admin · retry με backoff · re-auth σε `-100/-101` · σεβασμός rate limits του S1.

---

## 4. Πακέτα, Συνδρομές, Billing

**Plan** (διαμορφώσιμο από admin):
- `maxUsers`, `maxQueriesPerMonth`, `maxConnectors`, `syncFrequencyMin`
- `apiAccess` (bool) + `maxApiCallsPerMonth`
- `includedModules` (ποια core cubes)
- Τιμές ανά κύκλο: μηνιαία / ετήσια

**Δημιουργία tenant (super admin / admin)**:
1. Αναζήτηση πελάτη στο SoftOne της DGsoft (object `CUSTOMER`, TRDR) → επιλογή
2. Δημιουργία `Tenant` με `s1Trdr`, ΑΦΜ, επωνυμία, email
3. Επιλογή πακέτου + κύκλου χρέωσης
4. Πρόσκληση tenant admin (email magic link)
5. Αυτόματο provisioning: schema `t_<id>`, roles, κενό connector

**Viva Wallet** (Smart Checkout + recurring):
1. Πρώτη πληρωμή: δημιουργία order με `allowRecurring=true` → redirect στο Smart Checkout
2. Webhook `Transaction Payment Created` → re-fetch συναλλαγής από Viva API → `Subscription.status=ACTIVE`, αποθήκευση initial `transactionId`
3. Ανανέωση: δικός μας scheduler χρεώνει μέσω recurring API με το initial transactionId στην ημερομηνία λήξης
4. Αποτυχία → `PAST_DUE` + grace period (π.χ. 7 ημέρες, ειδοποιήσεις) → `SUSPENDED` (το gateway σταματά να εκδίδει tokens — άμεση διακοπή)
5. Idempotency ανά Viva event id · πίνακας `PaymentEvent` (inbox pattern)

**Συγχρονισμός με SoftOne DGsoft**: κάθε επιτυχής πληρωμή → job που δημιουργεί παραστατικό πώλησης (SALDOC) και είσπραξη στον αντίστοιχο TRDR μέσω `setData`, αποθήκευση `s1Findoc` για αντιστοίχιση. Read-back επιβεβαίωση (success:true ≠ persisted).

**Quota enforcement**: κάθε query/API call περνά από gateway → atomic increment `UsageCounter(tenant, period, kind)` → 429 όταν ξεπεραστεί. Soft warning στο 80%.

---

## 5. RBAC

| Ρόλος | Scope | Δικαιώματα |
|---|---|---|
| **SUPER_ADMIN** | Πλατφόρμα | Τα πάντα, διαχείριση admins, πακέτων, ρυθμίσεων συστήματος, impersonation (με audit) |
| **ADMIN** (DGsoft staff) | Πλατφόρμα | Tenants, συνδρομές, connectors, schemas, support — όχι πακέτα/τιμές, όχι άλλους admins |
| **TENANT_ADMIN** | Ένας tenant | Χρήστες (μέχρι `maxUsers`), dashboards, API keys, billing, προβολή sync |
| **TENANT_USER** | Ένας tenant | Προβολή dashboards που του έχουν ανατεθεί, δικά του saved queries |

Υλοποίηση: πίνακας `Permission` + `RolePermission` (granular, π.χ. `tenant.users.manage`, `bi.dashboard.edit`), helper `can(user, perm, tenantId)` σε server actions/route handlers, `Membership(user, tenant, role)` ώστε ένας χρήστης να μπορεί να ανήκει σε >1 tenant. Πλήρες `AuditLog`.

Auth: Auth.js (credentials + magic link, προαιρετικά Microsoft Entra), 2FA υποχρεωτικό για SUPER_ADMIN/ADMIN.

---

## 6. Webservices για τους πελάτες (Public API)

- `/api/v1/*`, auth με **API key** ανά tenant (hashed στη DB, scopes, λήξη, IP allowlist προαιρετικά)
- Endpoints: `POST /v1/query` (Cube query JSON), `GET /v1/meta` (διαθέσιμα cubes), `GET /v1/datasets/:name` (προκαθορισμένα «saved queries» με παραμέτρους) 
- Διαθέσιμο μόνο αν `plan.apiAccess=true`· ξεχωριστό quota
- OpenAPI spec + σελίδα τεκμηρίωσης στο portal
- Rate limiting ανά key

---

## 7. Data model (Prisma, control plane)

`User, Account, Session` · `Tenant(s1Trdr, afm, status, warehouseSchema)` · `Membership(userId, tenantId, role)` · `Role, Permission, RolePermission` · `Plan, PlanPrice` · `Subscription(status, currentPeriodEnd, vivaInitialTxId)` · `Payment(vivaTxId, amount, s1Findoc)` · `PaymentEvent` (webhook inbox) · `UsageCounter` · `Connector(type, configEnc)` · `Dataset` · `SyncRun` · `ApiKey(hash, scopes)` · `Dashboard, Widget` · `AuditLog`

---

## 8. Tech stack

- **Next.js 16.2+** (App Router, server components για data fetching, server actions)
- **shadcn/ui + Tailwind 4.1 + DG design system** (fluid rem typography κατά τους global κανόνες)
- **Prisma + PostgreSQL** (control plane `dgsmartbi`, warehouse `dgsmartbi_wh`)
- **Cube.dev** (self-hosted σε Coolify, Cube Store για pre-aggregations)
- **pg-boss** για jobs (ingestion, renewals, S1 billing sync) — χωρίς Redis
- **Charts**: Recharts/ECharts μέσω `@cubejs-client/core` στον server ή μέσω gateway
- **iconv-lite** για SoftOne
- Deploy: Coolify (app + worker + cube-dev + cube-prod + cube store)

---

## 9. Φάσεις υλοποίησης

| Φάση | Περιεχόμενο | Παραδοτέο / Κριτήριο επιτυχίας |
|---|---|---|
| **1. Θεμέλια** (1 εβδ.) | Repo, Next.js + DG design system, Prisma/Postgres, Auth.js, RBAC πυρήνας, layout admin/portal, audit log | Login με 4 ρόλους, προστατευμένα routes, CI |
| **2. Tenants & SoftOne DGsoft** (1 εβδ.) | S1 client (multi-session), αναζήτηση/επιλογή CUSTOMER, δημιουργία tenant, πρόσκληση tenant admin, διαχείριση χρηστών με όριο | Δημιουργώ tenant από πραγματικό πελάτη DGsoft |
| **3. Πακέτα & Συνδρομές** (1 εβδ.) | Plans CRUD, Subscription state machine, Viva Smart Checkout (demo env), webhooks, recurring, grace/suspension | Πλήρης κύκλος πληρωμή → ενεργοποίηση → αποτυχία → αναστολή σε Viva demo |
| **4. Warehouse & Ingestion** (2 εβδ.) | Provisioning schema/roles, worker, connector SOFTONE_WS + SOFTONE_SQL, canonical μοντέλο (πωλήσεις, αγορές, αποθήκη, πελάτες, ταμειακά), sync UI | Δεδομένα ενός πιλοτικού πελάτη στο `t_<id>` με incremental sync |
| **5. Cube multi-tenancy** (1-2 εβδ.) | Δύο Cube instances, `cube.js` config (checkAuth, contextToAppId, driverFactory, queryRewrite, scheduledRefreshContexts), core models από git, gateway + metering | Tenant A δεν μπορεί να δει δεδομένα tenant B (αυτοματοποιημένο test) |
| **6. BI UI** (2 εβδ.) | Dashboards, widgets, φίλτρα, KPI cards, drill-down, export, ανάθεση dashboards σε users | Πιλοτικός πελάτης χρησιμοποιεί τα dashboards |
| **7. Public API** (1 εβδ.) | API keys, `/v1/*`, quota, OpenAPI docs | Εξωτερική εφαρμογή τραβά δεδομένα με API key |
| **8. Billing → SoftOne** (½ εβδ.) | Παραστατικό + είσπραξη στο S1 DGsoft ανά πληρωμή | Κάθε Viva πληρωμή εμφανίζεται ως παραστατικό στον πελάτη |
| **9. Hardening & Go-live** | Security review, rate limits, backups, monitoring, τρίτοι connectors | Production |

---

## 10. Ανοιχτά ερωτήματα (χρειάζομαι απαντήσεις)

1. **Credentials SoftOne DGsoft** (serial, user, appId, company/branch/module/refid) για το `CUSTOMER` lookup και την έκδοση παραστατικών — ποια σειρά παραστατικού / είδος υπηρεσίας για τις συνδρομές;
2. **Viva**: Merchant ID / API key / Smart Checkout client credentials (demo πρώτα); Τιμές με ΦΠΑ ή χωρίς;
3. **Warehouse**: OK να δημιουργήσω δεύτερη βάση `dgsmartbi_wh` στον ίδιο Postgres server, ή προτιμάς schemas μέσα στην `dgsmartbi`; (Προτείνω ξεχωριστή βάση.)
4. **Cube**: έχεις SSH/Coolify API πρόσβαση για να στήσουμε το δεύτερο (dev) instance και Cube Store;
5. **Domain της εφαρμογής**: `bi.dgsmart.gr` ✓
6. **Πιλοτικός πελάτης** για τη Φάση 4 — και ποια reports/KPIs είναι προτεραιότητα;
7. **Μέτρηση «queries»**: κάθε κλήση στο Cube (και refresh dashboard) μετράει ως query, ή μόνο ad-hoc queries/API calls; (Προτείνω: dashboards ανεξάρτητα από quota με cache, μετράνε ad-hoc & API.)
8. Χρειάζεται **embedded dashboards** (iframe/SDK) στις εφαρμογές πελατών ή μόνο JSON API;
