# 13 — Αποφάσεις (ADRs) & ρίσκα

Αποφάσεις επικυρωμένες στις 25/10/2026.

## ADR‑001 — Prisma ORM 7 (όχι 8)
Το Prisma 8 είναι ακόμα Release Candidate (τελευταίο rc.8, 26/08/2026· GA αναμένεται «Οκτώβριο 2026») και λείπουν atomic `increment`, κωδικοί σφάλματος τύπου `P2002`, nested writes, isolation levels. **Απόφαση:** Prisma 7 (όπως το dgsmartbi: `prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`), pin `^7`. Μετάβαση στο 8 όταν βγει GA και καλυφθούν τα κενά· η Prisma υποστηρίζει παράλληλη λειτουργία 7 και 8.

## ADR‑002 — Βάση SaaS: fork του dgsmartbi
Κρατάμε auth, tenants, πακέτα, πληρωμές με έκδοση SALDOC στο SoftOne, RBAC, audit, API keys, κρυπτογράφηση, email, scheduler (docs/15). Repo `cloudzeus/DG-Complete` (branch `master`), δική του βάση και deploy, upstream remote για διορθώσεις.

## ADR‑003 — Better Auth (όχι Auth.js)
Το dgsmartbi έχει ώριμη υλοποίηση με Better Auth (προσκλήσεις, reset, sessions). Προσθέτουμε Microsoft Entra ID και αργότερα 2FA.

## ADR‑004 — Next.js 16.4 με Cache Components
Upgrade από 16.3.8. `"use cache"` μόνο σε σπάνια μεταβαλλόμενες λίστες με `cacheTag`, ποτέ σε run data / API. `proxy.ts` για optimistic έλεγχο session.

## ADR‑005 — Ξεχωριστός worker με Playwright
Browsers χρειάζονται μνήμη, λεπτά εκτέλεσης και σταθερή IP. Docker worker σε δεύτερο VPS μέσω Coolify· τρέχει με `--conditions=react-server` για να μοιράζεται τον κώδικα `lib/` του dgsmartbi.

## ADR‑006 — Απομόνωση tenants
Επίπεδο εφαρμογής με `tenantDb()` (Prisma client extension) για όλα + RLS για τα ευαίσθητα μοντέλα (credentials, sessions, runs, logs, artifacts). Αν η RLS δυσκολέψει με το Prisma 7/PgBouncer, μένει μόνο το επίπεδο εφαρμογής με tests απομόνωσης.

## ADR‑007 — Αποθήκευση στο Bunny
Bunny Storage zone (EU) + Pull zone με Token Authentication για signed URLs· ίδια υποδομή με τα υπόλοιπα projects της DGSoft. Local driver για dev/tests.

## ADR‑008 — Μόνο web συστήματα‑στόχοι
Όλες οι εφαρμογές των πελατών είναι web· **δεν** υλοποιείται on‑prem agent. Αν χρειαστεί μελλοντικά, το `lib/engine` είναι ανεξάρτητο και μπορεί να τρέξει σε agent.

## ADR‑009 — Τιμολόγηση ανά εκτέλεση + πακέτα
Ledger εκτελέσεων στο pattern του `AiTokenLedger` (docs/14). Χρεώνονται **μόνο οι επιτυχημένες** εκτελέσεις (`SUCCEEDED`)· οι αποτυχίες για οποιονδήποτε λόγο δεν χρεώνονται, με όριο αποτυχιών ανά ημέρα κατά της κατάχρησης.

## ADR‑013 — Χρεώσεις, παραστατικά και πληρωμές στο SoftOne
Το DG Complete μετρά χρήση και στέλνει χρεώσεις ως SALDOC στο SoftOne της DGsoft· οι πληρωμές καταχωρίζονται στο SoftOne και διαβάζονται πίσω με sync job. Δεν υπάρχει online πληρωμή στην εφαρμογή. Οι συγχρονισμοί πελατών SoftOne → tenants του dgsmartbi κρατιούνται ολόκληροι.

## ADR‑010 — Υποχρεωτική έγκριση δημοσίευσης
Κάθε δημοσίευση έκδοσης ροής εγκρίνεται από TENANT_ADMIN, με προϋπόθεση επιτυχημένο test run.

## ADR‑011 — JSON DSL αντί για παραγόμενο κώδικα
Ασφάλεια (καμία εκτέλεση αυθαίρετου κώδικα), οπτική επεξεργασία, versioning, diff, στατική ανάλυση.

## ADR‑012 — BullMQ + Valkey
Flows για batch, delayed retries, rate limits και το rate limiting του API (αντί για το in‑process του dgsmartbi, γιατί έχουμε πολλά replicas).

## Ρίσκα

| # | Ρίσκο | Πιθανότητα | Επίπτωση | Μετριασμός |
|---|---|:-:|:-:|---|
| R1 | Αποκλίσεις fork από το dgsmartbi δυσκολεύουν το cherry-pick | Μ | Χ | Δεν μετακινούμε κοινά αρχεία· πίνακας κατάστασης αρχείων στο docs/15 |
| R2 | Αλλαγές UI τρίτων συστημάτων σπάνε ροές | Υ | Υ | Πολλαπλοί locators, μετρήσεις fallback, alerts, γρήγορος editor |
| R3 | CAPTCHA / anti‑bot | Μ | Υ | Human‑in‑the‑loop, throttling, σταθερές IP· καμία παράκαμψη |
| R4 | Διπλοεγγραφές από retries | Μ | Υ | commitPoint, idempotencyCheck, `mayHaveCommitted` |
| R5 | Διαρροή διαπιστευτηρίων / PII | Χ | Πολύ Υ | Κρυπτογράφηση, redaction tests, masking στα screenshots, private Bunny zone |
| R6 | Όροι χρήσης τρίτων συστημάτων | Μ | Μ | Δήλωση εξουσιοδότησης ανά σύστημα‑στόχο, ToS, DPA |
| R7 | Κόστος browsers | Μ | Μ | Context pooling, resource blocking, όρια ανά πακέτο, χρέωση ανά εκτέλεση |
| R8 | Λάθος στη χρέωση (διπλή/χαμένη) | Χ | Υ | Ledger με μοναδικό key ανά run, atomic transaction, tests |

## ADR‑014 — OpenRouter για ανάλυση DOM
Χρησιμοποιούμε OpenRouter (υποδομή `lib/openrouter.ts` του dgsmartbi) για ονομασία πεδίων, κατάτμηση ροών, εξήγηση σφαλμάτων, προτάσεις locators και συγγραφή τεκμηρίωσης (docs/16). Πάντα με redaction, δομημένη έξοδο και ανθρώπινη έγκριση· ποτέ στην κρίσιμη διαδρομή εκτέλεσης.

## ADR‑015 — Τεκμηρίωση & Postman ανά σύστημα
Για κάθε σύστημα‑στόχο παράγεται τεκμηρίωση (σελίδα, Markdown, PDF) και Postman collection v2.1 με environment, σε κάθε δημοσίευση έκδοσης (docs/17).

## ADR‑016 — Pilot WWA σε TAXIS & ΟΠΣΚΕ, domain complete.dgsmart.gr
Pilot με τη World Wide Associates σε TAXIS και ΟΠΣΚΕ (docs/18). Σύνδεση **με τους κωδικούς κάθε δικαιούχου** (όχι λογαριασμός συντονιστή): διαπιστευτήρια με `externalRef` (ΑΦΜ) και `credentialRef` στο API. Domain παραγωγής `https://complete.dgsmart.gr`.

## ADR‑017 — Δώρα εκτελέσεων από SUPER_ADMIN
Ο υπερδιαχειριστής δίνει δωρεάν εκτελέσεις (και πίστωση AI σε ευρώ) με αιτιολογία και audit, χωρίς χρέωση στο SoftOne.

## ADR‑018 — Χρέωση AI ξεχωριστά, κόστος + markup ανά πακέτο
Το AI χρεώνεται χωριστά από τις εκτελέσεις: πραγματικό κόστος OpenRouter × (1 + `Plan.aiMarkupPct`), μηνιαία χρέωση `AI_USAGE` στο SoftOne (docs/14 §7). Δεν χρησιμοποιούνται προπληρωμένα AI tokens.

## ADR‑019 — Βάση `dgcomplete` στον ίδιο Postgres server με το dgsmartbi
Νέα, ξεχωριστή βάση `dgcomplete` στον υπάρχοντα server (`100.70.50.43`), με δικούς της ρόλους (`dgcomplete_app`, `dgcomplete_migrator`) χωρίς πρόσβαση στη βάση του dgsmartbi. Ξεχωριστά backups και `pg_hba.conf` κανόνες. Η εφαρμογή συνδέεται μέσω **PgBouncer** (transaction pooling, ADR‑020).

## ADR‑020 — PgBouncer μπροστά στον Postgres
Web και worker συνδέονται μέσω PgBouncer (port 6432, `pool_mode = transaction`, `max_prepared_statements` ενεργό) για να μη γεμίζουν οι συνδέσεις του κοινού server με το dgsmartbi όταν κλιμακώνονται τα replicas. Συνέπειες στον κώδικα: RLS context μόνο με `set_config(..., true)` μέσα σε transaction, όχι session advisory locks, όχι LISTEN/NOTIFY, migrations απευθείας στο 5432 (docs/10 §4α).

## ADR‑021 — Προγραμματισμένες εργασίες στον κώδικα, όχι στο Coolify
Όλες οι περιοδικές εργασίες (χρεώσεις, συγχρονισμοί SoftOne, retention, health runs κ.λπ.) ορίζονται στο `lib/jobs/registry.ts` και τρέχουν από τον in‑process scheduler του dgsmartbi, με κλείδωμα ανά εργασία στον πίνακα `ScheduledTask`. Δεν χρησιμοποιούνται Scheduled Tasks του Coolify ούτε crontab στον server: τα ωράρια είναι versioned, ελέγχονται σε review/tests και μεταφέρονται αυτούσια σε κάθε περιβάλλον (docs/10 §4β).
