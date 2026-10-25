# P16 — Deployment σε Coolify

## Πλαίσιο
Διάβασε: `docs/10-deployment.md` (όλο) και το `docs/DEPLOY.md` που ήρθε από το dgsmartbi. Αν υπάρχει το skill `coolify-manager`, φόρτωσέ το.

## Στόχος
Staging και production σε Coolify (Contabo) με web + worker, Valkey, Postgres και Bunny.

## Εργασίες
1. Dockerfile: Node 24, νέο target `worker` (Playwright image ίδιας έκδοσης με το package, non‑root, `--conditions=react-server`)· CI check εκδόσεων.
2. Ξαναγράψε το `docs/DEPLOY.md` για το DG Complete: βάση `DG_COMPLETE` και ρόλοι (`scripts/db-roles.sql`), **PgBouncer** (`deploy/pgbouncer/pgbouncer.ini` + `userlist.txt` template, transaction mode, port 6432, `max_prepared_statements=200`), `pg_hba.conf`, Valkey, δύο applications (web, worker σε δεύτερο server), env vars, health checks, migrations στο start, `SCHEDULER=off` στο 2ο replica.
3. Bunny: οδηγός δημιουργίας storage zone (EU) + pull zone με Token Authentication, Block root path, CORS για το domain· staging και production ξεχωριστά zones.
4. Backups Postgres (όπως dgsmartbi) + restore drill script.
5. Monitoring: `/metrics` (worker), uptime checks, alert για queue depth.
6. GitHub Actions: build & push GHCR (web, worker), deploy webhook staging, έγκριση για production, build/zip extension σε tags.
7. `docs/RUNBOOK.md`: worker κόλλησε, ουρά γεμάτη, rotation κλειδιών, restore βάσης, suspend tenant, εκτός λειτουργίας Bunny.

## Κριτήρια αποδοχής
- [ ] Staging λειτουργεί με έγκυρο TLS· run στο sandbox αποθηκεύει στιγμιότυπα στο staging Bunny zone και ανοίγουν μόνο με signed URL.
- [ ] Επιτυχής restore drill.
- [ ] Deploy χωρίς downtime (2 web replicas).
- [ ] Web και worker συνδέονται μέσω PgBouncer (6432)· migrations τρέχουν απευθείας στο 5432· integration test με PgBouncer στο docker-compose αποδεικνύει ότι το RLS (`withTenantTx`) δουλεύει σε transaction mode και ότι δύο tenants δεν βλέπουν ο ένας τα δεδομένα του άλλου.
- [ ] Κανένα Scheduled Task στο Coolify και κανένα crontab· όλες οι εργασίες του docs/10 §4β υπάρχουν στο `lib/jobs/registry.ts`, φαίνονται στο `/admin/settings/scheduler` και τρέχουν μία φορά ακόμα και με 2 replicas web (test με δύο instances).
