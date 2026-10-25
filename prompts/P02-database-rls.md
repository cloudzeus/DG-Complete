# P02 — Schema (Prisma 7) & απομόνωση tenants

## Πλαίσιο
Διάβασε: `docs/03-data-model.md`, `docs/02-multitenancy-security.md` §1, `docs/14-billing.md` §3, `docs/schema-additions.prisma`, `prisma/schema.prisma` (μετά το P00).

## Στόχος
Όλα τα μοντέλα του DG Complete στη βάση, με απομόνωση tenants (`tenantDb` + RLS στα ευαίσθητα), partitioned logs, αμετάβλητες δημοσιευμένες εκδόσεις και tests.

## Εργασίες
1. Εφάρμοσε στο `prisma/schema.prisma` τις αλλαγές του `docs/schema-additions.prisma`: νέα enums/μοντέλα, πεδία σε `Tenant`, `Plan`, `ApiKey`, νέους ρόλους στο `TenantRole`. Κράτα τα conventions (cuid, `@@map`).
2. `npm run db:migrate -- --name dg_complete_core`. Μετά δημιούργησε **custom SQL migration** (`--create-only`) για:
   - partitioning του `run_log` + partitions τρέχοντος/επόμενου μήνα + function `app_ensure_run_log_partition(date)`,
   - partial index `run_active_idx`, GIN σε `workflow.tags`,
   - RLS policies του docs/03 §5,
   - trigger αμεταβλητότητας `workflow_version` (docs/03 §6).
3. Ρόλοι βάσης: ο χρήστης της εφαρμογής **δεν** είναι owner των πινάκων με RLS (γράψε οδηγίες στο docs/10 και script `scripts/db-roles.sql`).
4. `lib/tenant-db.ts`: `tenantDb(tenantId)` (Prisma client extension που προσθέτει `tenantId` σε where/data για τα tenant μοντέλα) και `withTenantTx(tenantId, fn)` (set_config μέσα σε interactive transaction)· `withPlatformTx(fn)` για scheduler/admin.
5. ESLint `no-restricted-imports`: `@/lib/prisma` απαγορεύεται στα `app/t/**`, `app/api/v1/**`, `lib/engine/**`, `lib/dsl/**`.
6. Ενημέρωσε το `lib/services.ts` με τις υπηρεσίες του DG Complete (docs/15 §4) και το `NO_PLAN_SERVICES`.
7. `scripts/seed-dev.ts` (docs/03 §7) — idempotent.
8. Tests (Testcontainers Postgres): `tenant-isolation.test.ts` για κάθε tenant μοντέλο (μέσω `tenantDb` και raw SQL στα RLS μοντέλα), test trigger αμεταβλητότητας, test δημιουργίας partition.

## Κριτήρια αποδοχής
- [ ] Καθαρή βάση: `db:migrate`, `seed:admin`, `seed:dev` χωρίς σφάλματα.
- [ ] Tests απομόνωσης πράσινα· `SELECT * FROM run` χωρίς `app.tenant_id` → 0 γραμμές για τον χρήστη της εφαρμογής.
- [ ] UPDATE του `definition` σε PUBLISHED έκδοση → σφάλμα βάσης.
- [ ] `npm run typecheck` πράσινο.

## Μην κάνεις
- Μην αναβαθμίσεις σε Prisma 8. Μην δώσεις `BYPASSRLS` στον χρήστη της εφαρμογής.
- [ ] Το `withTenantTx` χρησιμοποιεί `set_config('app.tenant_id', …, true)` (transaction‑local) ώστε να δουλεύει πίσω από PgBouncer σε transaction mode (docs/10 §4α)· κανένα session‑level `SET`.
