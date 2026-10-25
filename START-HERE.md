# Ξεκίνημα ανάπτυξης στον server με Claude Code

Οδηγίες για να στήσεις το DG Complete **στον δικό σου server** (dev VPS / μηχάνημα ανάπτυξης) και να τρέξεις τα prompts `P00 → P17` με το Claude Code. Τίποτα δεν τρέχει τοπικά στο Mac.

---

## 1. Προαπαιτούμενα στον server (μία φορά)

```bash
# Node 24 LTS + git + gh
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git gh postgresql-client redis-tools
gh auth login                      # λογαριασμός με δικαίωμα στο org cloudzeus

# Claude Code
npm install -g @anthropic-ai/claude-code
claude --version

# Docker (για Valkey/Postgres/Mailpit του dev και για το Playwright αργότερα)
docker --version                   # αν λείπει: https://docs.docker.com/engine/install/
```

Για το P08 και μετά (Playwright worker): `npx playwright install --with-deps chromium` μέσα στο repo, όταν το ζητήσει το prompt.

## 2. Κάνε clone το repo στον server

Όλη η τεκμηρίωση (αυτό το αρχείο, `CLAUDE.md`, `docs/`, `prompts/`, `design/`, `docs/schema-additions.prisma`) είναι στο repo:

```bash
cd ~
git clone https://github.com/cloudzeus/DG-Complete.git dg-complete
cd dg-complete
```

## 3. Βάση δεδομένων (μία φορά, στον Postgres server 100.70.50.43)

Ξεχωριστή βάση `DG_COMPLETE` στον ίδιο server με το dgsmartbi (ADR‑019), με PgBouncer μπροστά (ADR‑020):

```sql
-- ως superuser στο 100.70.50.43
CREATE ROLE dgcomplete_migrator LOGIN PASSWORD '…';
CREATE ROLE dgcomplete_app LOGIN PASSWORD '…';
CREATE DATABASE "DG_COMPLETE" OWNER dgcomplete_migrator;
-- για το dev, προαιρετικά: CREATE DATABASE "DG_COMPLETE_DEV" OWNER dgcomplete_migrator;
```

- `pg_hba.conf`: ο `dgcomplete_migrator` από την IP του dev server/Coolify, ο `dgcomplete_app` μόνο από τον PgBouncer.
- PgBouncer: `pool_mode = transaction`, port `6432`, `max_prepared_statements = 200` (docs/10 §4α). Το P16 φτιάχνει τα config files· για το dev μπορείς να συνδεθείς απευθείας στο 5432.
- Τα GRANT του `dgcomplete_app` (χωρίς ownership πινάκων) τα γράφει το P02 (`scripts/db-roles.sql`).

## 4. Δικαιώματα του Claude Code στο repo

Το `.claude/settings.json` υπάρχει ήδη στο repo με αυτό το περιεχόμενο (άλλαξέ το αν θέλεις):

```json
{
  "permissions": {
    "allow": [
      "Bash(npm *)", "Bash(npx *)", "Bash(node *)", "Bash(git *)", "Bash(gh repo *)",
      "Bash(docker compose *)", "Bash(psql *)", "Bash(redis-cli *)",
      "Read", "Edit", "Write"
    ],
    "deny": ["Bash(git push --force*)", "Bash(rm -rf /*)"]
  }
}
```

## 5. P00 — fork και καθαρισμός

```bash
cd ~/dg-complete
claude
```

Πρώτο μήνυμα στο Claude Code:

```
Διάβασε CLAUDE.md, START-HERE.md και prompts/P00-bootstrap.md (μαζί με την ενότητα «Γνωστά σημεία από δοκιμαστική εκτέλεση»).
Κάνε πρώτα σύντομο πλάνο, μετά υλοποίησε το P00 στον τρέχοντα φάκελο (merge του dgsmartbi ως upstream).
Για βάση στο dev χρησιμοποίησε docker compose (postgres + valkey + mailpit) — όχι την παραγωγική βάση.
Στο τέλος επιβεβαίωσε ένα-ένα τα κριτήρια αποδοχής με εντολές και δείξε μου το output.
```

Το `origin` είναι το **`https://github.com/cloudzeus/DG-Complete`** (branch `master`, ξεκινά με τα specs). Το P00 προσθέτει το dgsmartbi ως `upstream` και κάνει merge χωρίς force push. Ο server χρειάζεται δικαίωμα push στο repo (`gh auth login` ή deploy key).

## 6. P01 → P17

Συνεχίζεις στον ίδιο φάκελο:

```bash
cd ~/dg-complete
claude
```

Για κάθε prompt (με τη σειρά του `prompts/README.md`), νέο session (`/clear`) και:

```
Διάβασε CLAUDE.md και prompts/P0X-….md. Κάνε πρώτα σύντομο πλάνο, μετά υλοποίησε.
Στο τέλος επιβεβαίωσε ένα-ένα τα κριτήρια αποδοχής με εντολές και δείξε μου το output.
```

Μετά από κάθε πράσινη φάση:

```bash
git add -A && git commit -m "P0X: …" && git tag p0X-done && git push origin master --follow-tags
```

Σειρά και milestones:

| Milestone | Prompts | Αποτέλεσμα |
|---|---|---|
| M1 | P00, P01, P02, P03 | Fork, shell `/t/[tenantId]`, schema + RLS, ρόλοι/Entra ID |
| M2 | P04, P05, P08 | Συστήματα‑στόχοι, θυρίδα κωδικών, DSL, worker + Bunny |
| M3 | P06, P07, P07c, P09, P07b, P09b | Recorder extension, «Ολοκληρώθηκε» + REST μέθοδος + επανάληψη, editor/εγκρίσεις, logs & run viewer, οπτικός καμβάς ροών, live assist για OTP/CAPTCHA |
| M4 | P10, P10b, P11, P11b, P11c, P11d | Συλλογές μεθόδων, public API, αρχεία, μαζικές με data mapping, webhooks, αναγνώριση αλλαγών & παύση, εξαγωγή δεδομένων σε JSON/Excel/webhook |
| M4b | P12, P13 | AI (OpenRouter), τεκμηρίωση + Postman ανά σύστημα |
| M5 | P14, P15, P16 | Τιμολόγηση/SoftOne, hardening, deploy στο Coolify |
| M6 | pilot WWA, P17 | TAXIS & ΟΠΣΚΕ (docs/18), φάση 3 |

## 7. Κανόνες που ισχύουν σε κάθε φάση (υπάρχουν και στο CLAUDE.md)

- Prisma **^7** (όχι 8), Better Auth (όχι Auth.js), Next.js **16.4+** με `cacheComponents: true`.
- Cron jobs **μόνο στον κώδικα** (`lib/jobs/registry.ts`) — τίποτα στα Scheduled Tasks του Coolify.
- PgBouncer σε transaction mode: RLS μόνο με `withTenantTx` (`set_config(…, true)`), όχι session locks, όχι LISTEN/NOTIFY.
- Χρεώνονται **μόνο οι επιτυχημένες** εκτελέσεις· το AI χρεώνεται ξεχωριστά (κόστος OpenRouter + markup πακέτου).
- Δεν μετακινούμε/μετονομάζουμε κοινά αρχεία του dgsmartbi (cherry-pick από `upstream`).
- Κωδικοί δικαιούχων WWA: ένα σετ ανά ΑΦΜ (`credentialRef`), όχι λογαριασμός συντονιστή.
