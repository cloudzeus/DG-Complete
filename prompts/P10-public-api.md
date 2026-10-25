# P10 — Συλλογές μεθόδων & Public API

## Πλαίσιο
Διάβασε: `docs/07-public-api.md` (όλο), `docs/02` §3 (API key scopes), `docs/14` §2 (έλεγχος υπολοίπου), `lib/api-keys.ts`, `lib/api-v1.ts`, `docs/09` οθόνες 9–11, 16.

## Στόχος
Οι δημοσιευμένες ροές εκτίθενται ως μέθοδοι σε συλλογές, με API keys, OpenAPI, sync/async εκτέλεση, idempotency και έλεγχο υπολοίπου εκτελέσεων.

## Εργασίες
1. `lib/collections.ts`, `lib/methods.ts`.
2. UI: `/t/[tenantId]/collections` (κάρτες), `/collections/[c]` (μέθοδοι, Τεκμηρίωση API με `@scalar/api-reference-react`, κλειδιά με πρόσβαση), `/collections/[c]/methods/[m]` (ρυθμίσεις, pinned έκδοση + «Αναβάθμιση» με breaking‑change προειδοποίηση, «Χειροκίνητη εκτέλεση» με auto‑form από το inputSchema, δείγματα curl / TypeScript / C#).
3. `lib/api-keys.ts`: prefix `dgc_`, scopes, `collectionIds`, `ipAllowlist`, `expiresAt`· το rate limit μεταφέρεται στον Postgres (`lib/rate-limit.ts`, πίνακας `RateLimitBucket`, ADR‑022) με headers `RateLimit-*`. Έλεγχος ότι το πακέτο έχει την υπηρεσία `api` (όπως ήδη κάνει). `/t/[tenantId]/settings/api-keys` για διαχείριση.
4. `lib/api-v1.ts`: κράτα το `apiHandler`/`apiJson`· πρόσθεσε problem+json (RFC 9457) και header `X-DGComplete-Runs-Remaining`.
5. Route handlers (Node runtime, χωρίς cache) για όλα τα endpoints του docs/07 §3 πλην jobs: runs create (sync/async), validate, get, list, steps, artifacts (signed URLs), retry, cancel, collections, openapi.json, usage.
6. Input validation με Ajv (compiled ανά `workflowVersionId`, LRU cache).
7. `credentialRef` / `credentialId` στο σώμα του run (docs/07 §3.1, docs/18 §2): επίλυση σε credential του tenant για το σύστημα της μεθόδου· άγνωστο → 422.
8. Idempotency: unique `(tenantId, idempotencyKey)` + `requestHash`· ίδιο body → υπάρχον run, διαφορετικό → 409.
9. Πριν το enqueue: `lib/billing.canEnqueue(tenantId, 1)` → αλλιώς 429 `E_QUOTA_EXCEEDED`.
10. Sync mode: subscribe `run:{id}` πριν το enqueue, αναμονή έως `syncTimeoutSec`, μετά 202.
11. OpenAPI 3.1 generator (docs/07 §6) — το Postman collection γίνεται στο P13.
12. `sdk/` φάκελος: `openapi-typescript` + `openapi-fetch`, helper `waitForRun`, README.
13. Tests: auth (λάθος/ανακληθέν/ληγμένο key, scope, IP), idempotency, sync/async, quota, εγκυρότητα OpenAPI.

## Κριτήρια αποδοχής
- [ ] `curl -X POST …/api/v1/collections/erp/methods/create-customer/runs` με το seed key → 202 και το run εκτελείται.
- [ ] `mode: sync` → 200 με `output.customerCode`.
- [ ] Tenant με μηδενικό υπόλοιπο και χωρίς overage → 429.
- [ ] Όλα τα `/api/v1` έχουν `Cache-Control: no-store`.
