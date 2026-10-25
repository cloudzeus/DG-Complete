@AGENTS.md

# CLAUDE.md — DG Complete

Πολυ‑tenant SaaS για καταγραφή βημάτων καταχώρισης σε τρίτα web συστήματα, μετατροπή σε ροές, έκθεση ως API μεθόδων και μαζική αυτόματη εκτέλεση με πλήρη logs και στιγμιότυπα σφαλμάτων. **Fork του `cloudzeus/dgsmartbi`** (βλ. `docs/15-fork-dgsmartbi.md`).

**Πριν από κάθε εργασία διάβασε τα σχετικά αρχεία του `docs/`.** Τα docs είναι η πηγή αλήθειας· αν η υλοποίηση πρέπει να αποκλίνει, ενημέρωσε πρώτα το doc (και το ADR στο `docs/13`). Το `AGENTS.md` του Next.js ισχύει: διάβασε τον οδηγό στο `node_modules/next/dist/docs/` πριν γράψεις κώδικα Next.

## Stack (μην αλλάξεις χωρίς ADR)
- Node 24 LTS, **npm** (όπως το dgsmartbi), TypeScript strict.
- **Next.js 16.4+** App Router, React 19.3, `cacheComponents: true`, `proxy.ts`.
- **Prisma ORM 7** (`prisma-client` generator → `lib/generated/prisma`, `@prisma/adapter-pg`, `prisma.config.ts`). Pin `^7` — ποτέ `npm i prisma` χωρίς έκδοση (φέρνει το 8).
- **Better Auth** (`lib/auth.ts`) — όχι Auth.js.
- shadcn/ui (`radix-nova`) + **Vengeance UI** (`@vengeance`, skill `vengeance-ui`) + Tailwind v4· DG Design System ήδη στο `app/globals.css`· icons **lucide** (όπως dgsmartbi).
- GSAP (`@gsap/react`) μόνο για διακριτικό motion.
- zod 4, react-hook-form, TanStack Table, exceljs, Mailgun.
- BullMQ + Valkey, Playwright, **Bunny Storage + Pull zone (token auth)**, WXT για το extension.

## Δομή
`app/` (admin, t/[tenantId], api) · `lib/` (dgsmartbi modules + `dsl/`, `engine/`, `queue/`, `storage/`, `billing/`, `recorder/`) · `worker/` · `extension/` · `sandbox/` · `prisma/` — λεπτομέρειες στο `docs/01-architecture.md`.

## Κανόνες κώδικα
1. **Tenancy:** queries σε tenant data μόνο μέσω `tenantDb(tenantId)`· για credentials/sessions/runs/logs/artifacts μέσω `withTenantTx()` (RLS). Στα `app/t/**` και `app/api/v1/**` απαγορεύεται import του `prisma` απευθείας. Κάθε νέο tenant μοντέλο → `tenantId` + test απομόνωσης.
2. **Δικαιώματα:** κάθε Server Action / page / route ξεκινά με `requirePermission(perm, tenantId)` ή `requireTenant(tenantId)` (pattern `lib/rbac.ts`). Νέα permissions μπαίνουν στο `PERMISSION_DEFS` + `DEFAULT_GRANTS`.
3. **Secrets:** ποτέ σε logs, errors, responses, screenshots. `lib/crypto.ts` για κρυπτογράφηση (με AAD), `redact()` για logs. Τα credentials αποκρυπτογραφούνται μόνο στον worker.
4. **Validation:** zod σε κάθε όριο (forms, actions, API, queue payloads, env στο `lib/env.ts`).
5. **Caching:** ποτέ `"use cache"` σε run data, logs, artifacts, `/api/v1`. Τα API responses με `Cache-Control: no-store` (helper `apiJson` του dgsmartbi).
6. **API:** errors ως RFC 9457 problem+json, Idempotency‑Key σε κάθε POST που δημιουργεί runs/jobs.
7. **DSL:** καμία εκτέλεση αυθαίρετου JS· expressions μόνο μέσω του evaluator του `lib/dsl`. Τα `lib/dsl` και `lib/engine` **δεν** κάνουν import `server-only` ούτε `@/lib/prisma`.
8. **Σφάλματα engine:** μόνο κωδικοί από `docs/06 §5`.
9. **Χρέωση:** κάθε αλλαγή υπολοίπου εκτελέσεων μόνο μέσω `lib/billing` (ledger με μοναδικό key).
10. **Artifacts:** μόνο μέσω `lib/storage` (`put`, `signedUrl`)· ποτέ δημόσιο URL.
11. **Conventions dgsmartbi:** `cuid()`, `@@map` snake_case, ελληνικά μηνύματα λάθους προς τον χρήστη, `audit()` σε κάθε διαχειριστική ενέργεια. Μην μετακινείς/μετονομάζεις κοινά αρχεία με το dgsmartbi χωρίς λόγο (cherry-pick).
12. Server components by default· `"use client"` μόνο όπου χρειάζεται διάδραση.

## Κανόνες UI (DG Design System — product interior)
- Canvas `#F3F2F1`, κάρτες λευκές, primary **Sisyphus Blue `#0078D4`**· DG red `#E31E2A` μόνο για brand / destructive / highlight σφάλματος.
- Όχι gradients, glow, purple/teal, emoji, single‑layer shadows, left‑border accent cards.
- Radii 4/8/12, spacing 4‑px grid, fluid type tokens του `app/globals.css`, ισχυρή αλλά μετρημένη ιεραρχία.
- Ελληνικά labels, sentence case, eyebrows UPPERCASE 0.08em, χωρίς θαυμαστικά.
- Motion: 80/150/240/400 ms, ease `cubic-bezier(0.33,0,0.67,1)`, σεβασμός `prefers-reduced-motion`.

## Εντολές
```
npm run dev                 # web
npm run worker:dev          # worker (tsx --conditions=react-server worker/index.ts)
npm run sandbox:dev         # δοκιμαστικό σύστημα-στόχος (port 4100)
docker compose -f docker-compose.dev.yml up -d   # postgres, valkey, mailpit
npm run db:migrate          # prisma migrate dev
npm run seed:admin && npm run seed:dev
npm test                    # vitest unit
npm run test:int            # testcontainers
npm run test:e2e            # playwright
npm run lint && npm run typecheck
```

## Ροή εργασίας
- Υλοποίηση ανά φάση από `prompts/Pxx-*.md`. Στο τέλος κάθε φάσης: lint, typecheck, tests και επιβεβαίωση των «Κριτηρίων αποδοχής» ένα‑ένα.
- Μικρά, θεματικά commits (Conventional Commits).
- Αν κάτι στα docs είναι ασαφές ή αντιφατικό, σταμάτα και ρώτα.
- **PgBouncer (transaction mode):** όχι session `SET`, όχι `pg_advisory_lock`, όχι `LISTEN/NOTIFY`· RLS μόνο μέσω `withTenantTx`. Migrations με `DATABASE_URL_MIGRATOR` (απευθείας 5432).
- **Cron jobs μόνο στον κώδικα:** κάθε περιοδική εργασία δηλώνεται στο `lib/jobs/registry.ts` (cron έκφραση, Europe/Athens, handler, inline|enqueue). Ποτέ Scheduled Tasks του Coolify ή crontab στον server.
- **Αρχεία (docs/21):** μόνο ως `FileObject` στο Bunny (ιδιωτικό path, signed URLs), ποτέ base64 σε DSL/βάση/logs· έλεγχος ClamAV πριν τη χρήση· προστασία SSRF στα URLs.
- **Incidents (docs/23):** runs μεθόδου σε παύση γίνονται `HELD` (όχι FAILED) και δεν χρεώνονται· τα σφάλματα δεδομένων δεν ανοίγουν incident.
- **Εξαγωγή δεδομένων (docs/26):** στήλες πάντα ανά επικεφαλίδα (όχι θέση)· η αποτυχία προορισμού δεν αλλάζει την κατάσταση του run· στοιχεία σύνδεσης προορισμών κρυπτογραφημένα με `lib/crypto`.
- **Live assist (docs/22):** ο worker δεν εκτίθεται ποτέ απευθείας· frames δεν αποθηκεύονται· τιμές OTP δεν γράφονται πουθενά.
