# 07 — Public API: Συλλογές μεθόδων

## 1. Έννοιες

- **MethodCollection** = ομάδα μεθόδων με κοινό path, κοινό OpenAPI document και κοινά δικαιώματα API key. Π.χ. `erp` (Καταχωρίσεις ERP), `taxisnet`, `supplier-portal`.
- **Method** = endpoint που δείχνει σε **pinned** δημοσιευμένη έκδοση ροής. Το input του = `inputSchema` της έκδοσης.

Base URL: `https://complete.dgsmart.gr/api/v1`. Το API key ορίζει τον tenant.

## 2. Authentication & headers

```
Authorization: Bearer dgc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   (dgc_ + 32 bytes base64url, όπως τα dgbi_ keys του dgsmartbi)
Content-Type: application/json
Idempotency-Key: 2f1c…   (προαιρετικό, συνιστάται — 24h παράθυρο)
X-Request-Id: …          (επιστρέφεται πάντα)
```
Rate‑limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` · χρήση: `X-DGComplete-Runs-Remaining`.

## 3. Endpoints

> **Resource‑style endpoints (docs/24 §5):** κάθε κίνηση εκτίθεται και ως `POST /api/v1/{collection}/{resource}` (καταχώριση), `PUT|PATCH /api/v1/{c}/{r}/{key}` (τροποποίηση), `DELETE /api/v1/{c}/{r}/{key}` (διαγραφή), `GET /api/v1/{c}/{r}/{key}` (προβολή, sync) και `POST /api/v1/{c}/{r}/{key}/{action}` (ενέργεια). Ο πίνακας που ακολουθεί είναι η ενιαία, γενική μορφή που μένει διαθέσιμη.

| Method | Path | Scope | Περιγραφή |
|---|---|---|---|
| GET | `/collections` | collections:read | Λίστα συλλογών |
| GET | `/collections/{c}` | collections:read | Συλλογή + μέθοδοι |
| GET | `/collections/{c}/openapi.json` | collections:read | OpenAPI 3.1 της συλλογής |
| POST | `/collections/{c}/methods/{m}/runs` | runs:write | Μία εκτέλεση (sync ή async) |
| POST | `/collections/{c}/methods/{m}/validate` | runs:write | Μόνο validation input (dry) |
| POST | `/collections/{c}/methods/{m}/jobs` | jobs:write | Batch έως 10.000 items |
| GET | `/runs/{id}` | runs:read | Κατάσταση/αποτέλεσμα |
| GET | `/runs?method=&status=&externalRef=&from=&to=&cursor=` | runs:read | Αναζήτηση |
| GET | `/runs/{id}/steps` | runs:read | Βήματα |
| GET | `/runs/{id}/artifacts` | artifacts:read | Λίστα + presigned URLs (15′) |
| POST | `/runs/{id}/retry` | runs:write | Νέο run με ίδιο input (`retryOfRunId`) |
| POST | `/runs/{id}/cancel` | runs:write | |
| GET | `/jobs/{id}` | jobs:read | Πρόοδος |
| GET | `/jobs/{id}/runs?status=FAILED` | jobs:read | |
| POST | `/jobs/{id}/retry-failed` | jobs:write | |
| POST | `/jobs/{id}/cancel` | jobs:write | |
| GET | `/jobs/{id}/export.xlsx` | jobs:read | Αποτελέσματα ανά item (το αρχικό αρχείο + στήλες αποτελέσματος όταν υπάρχει πρότυπο, docs/20 §9) |
| POST | `/files` · `/files/from-url` · `/files/uploads` | files:write | Αρχεία για βήματα `upload` → `fileId` (docs/21) |
| GET · DELETE | `/files/{id}` | files:read / files:write | Μεταδεδομένα, κατάσταση ελέγχου ιών, διαγραφή |
| GET | `/collections/{c}/methods/{m}/mappings` | jobs:read | Πρότυπα αντιστοίχισης Excel της μεθόδου (docs/20) |
| POST | `/collections/{c}/methods/{m}/mappings/{id}/preview` | jobs:write | Dry run: αρχείο → εγγραφές + σφάλματα ανά γραμμή |
| GET | `/{c}/{resource}/options/{field}?<γονείς>` | collections:read | Επιλογές εξαρτώμενης λίστας από τον κατάλογο (`?live=true` → READ run), docs/25 §4 |
| GET | `/runs/{id}/output.xlsx` · `.csv` · `.json` | runs:read | Τα εξαγόμενα δεδομένα της εκτέλεσης σε αρχείο (docs/26 §6) |
| GET | `/collections/{c}/methods/{m}/state` | collections:read | `ACTIVE` / `PAUSED` / `HALF_OPEN` + ανοιχτό incident (docs/23) |

**Αρχεία:** τα πεδία τύπου `file` δέχονται `{ "fileId" }`, `{ "part" }` (inline multipart) ή `{ "url" }` — docs/21. **Παύση μεθόδου:** όταν μια μέθοδος είναι `PAUSED`, οι νέες κλήσεις παίρνουν `202` με `status: HELD` (default) ή `503 E_METHOD_PAUSED` + `Retry-After`, ανάλογα με το `pausePolicy` (docs/23 §4). Webhooks: `method.paused`, `method.resumed`, `incident.opened`, `incident.resolved`, `run.needs_attention`.
| GET | `/usage` | usage:read | Υπόλοιπο & κατανάλωση εκτελέσεων (docs/14) |
| GET | `/collections/{c}/postman.json` | collections:read | Postman collection v2.1 της συλλογής (docs/17) |
| GET | `/targets/{slug}/postman.json` | collections:read | Postman collection όλων των μεθόδων ενός συστήματος |
| GET | `/targets/{slug}/docs.md` | collections:read | Τεκμηρίωση συστήματος σε Markdown |

### 3.1 Run (async — default)
```http
POST /v1/collections/erp/methods/create-customer/runs
{
  "input": { "afm": "094014201", "name": "Δοκιμαστική ΑΕ", "city": "Αθήνα" },
  "externalRef": "S1-CUST-10234",
  "mode": "async",
  "callbackUrl": "https://middleware.client.gr/hooks/dgcomplete",
  "credentialRef": "afm:094014201"
}
```
`credentialRef` (ή `credentialId`) επιλέγει ποιο σετ διαπιστευτηρίων θα χρησιμοποιηθεί — απαραίτητο όταν ο tenant δουλεύει για πολλούς δικαιούχους (docs/18 §2). Χωρίς αυτό χρησιμοποιείται το default credential της μεθόδου.

```http
202 Accepted
Location: /v1/runs/0192f1d2-…
{ "id": "0192f1d2-…", "status": "QUEUED", "method": "erp/create-customer", "version": 3,
  "queuedAt": "2026-10-25T08:31:02.120Z", "links": { "self": "/v1/runs/0192f1d2-…" } }
```

### 3.2 Run (sync)
`"mode": "sync"` → το request περιμένει έως `Method.syncTimeoutSec` (max 120s). Αν τελειώσει: `200` με πλήρες αποτέλεσμα. Αν όχι: `202` όπως πάνω (ο client συνεχίζει με polling/webhook). Υλοποίηση: LISTEN στο κανάλι `run_events` (φιλτράρισμα ανά `runId`) πριν το enqueue.

```json
{
  "id": "0192f1d2-…", "status": "SUCCEEDED", "durationMs": 8421,
  "output": { "customerCode": "ΠΕΛ-004512" },
  "steps": { "total": 9, "succeeded": 9 }
}
```

### 3.3 Αποτυχία
```json
{
  "id": "0192f1d2-…", "status": "FAILED", "attempt": 3,
  "error": {
    "code": "E_TARGET_VALIDATION",
    "message": "Το σύστημα απέρριψε την καταχώριση",
    "targetMessage": "Ο ΑΦΜ υπάρχει ήδη σε άλλο πελάτη",
    "stepId": "s07", "stepLabel": "Έλεγχος μηνυμάτων συστήματος",
    "mayHaveCommitted": false
  },
  "artifacts": [
    { "kind": "SCREENSHOT_FULL", "url": "https://s3…/…png?X-Amz-…", "expiresAt": "…" },
    { "kind": "PLAYWRIGHT_TRACE", "url": "…" }
  ]
}
```

### 3.4 Batch job
```http
POST /v1/collections/erp/methods/create-customer/jobs
{
  "name": "Μεταφορά πελατών Οκτώβριος",
  "items": [
    { "externalRef": "C-1", "input": { "afm": "…", "name": "…" } },
    { "externalRef": "C-2", "input": { "afm": "…", "name": "…" } }
  ],
  "callbackUrl": "https://…",
  "options": { "stopOnErrorRate": 0.3 }   // σταματά αν > 30% αποτυχίες μετά τα πρώτα 20
}
```
```http
202 { "id": "job_…", "status": "PENDING", "totalItems": 2, "invalidItems": [] }
```
Αν κάποια items είναι άκυρα: `invalidItems: [{ index, errors: [...] }]` και αυτά **δεν** δημιουργούν runs (ή `"rejectOnInvalid": true` → 422 για όλο το job).

## 4. Σφάλματα HTTP (RFC 9457 problem+json)

```json
{ "type": "https://docs.complete.dgsmart.gr/errors/input-validation",
  "title": "Μη έγκυρα δεδομένα εισόδου", "status": 422,
  "errors": [ { "path": "/afm", "message": "Μη έγκυρος ΑΦΜ" } ], "requestId": "…" }
```
`400` κακό JSON · `401` key · `403` scope/collection/IP · `404` · `409` idempotency conflict (ίδιο key, άλλο body) · `422` validation · `429` rate/quota · `503` maintenance.

## 5. Webhooks

Events: `run.succeeded`, `run.failed`, `run.needs_attention`, `job.completed`.
```http
POST https://client/hook
X-DGComplete-Event: run.failed
X-DGComplete-Delivery: dlv_…
X-DGComplete-Signature: t=1761381062,v1=hex(hmac_sha256(secret, t + "." + body))
```
Ο client επαληθεύει υπογραφή και `|now - t| < 300s`. Retries: 6 προσπάθειες (βλ. 06 §2). UI: λίστα deliveries με «Επαναποστολή».

## 6. OpenAPI generation

`GET /collections/{c}/openapi.json` παράγεται δυναμικά (cache tag `tenant:{t}:collection:{c}`):
- ένα `operationId` ανά method: `createCustomer_run`, `createCustomer_job`,
- `requestBody` schema = `inputSchema` της pinned έκδοσης, `output` = `outputSchema`,
- κοινά components (Run, Job, Problem, Artifact),
- παραδείγματα από `InputField.example`.

Στο UI: σελίδα «Τεκμηρίωση API» με **Scalar** (`@scalar/api-reference-react`) και κουμπί «Δοκιμή» με προσωρινό test key. Επίσης download Postman collection (μετατροπή OpenAPI → Postman v2.1).

## 7. SDK & integrations

- `sdk/ (φάκελος στο repo)`: TypeScript client generated (openapi-typescript + openapi-fetch) με helper `waitForRun(id)`.
- Παράδειγμα κλήσης από **SoftOne** (S1 script / web service) και από το WooCommerce→SoftOne middleware.
- Φάση 3: **MCP server** που εκθέτει κάθε method ως MCP tool (ώστε AI agents να καταχωρίζουν).

## 9. Υλοποίηση (πρώτη έκδοση)

- **Μέθοδος από τη ροή:** στη δημοσίευση (`publish`) δημιουργείται η μέθοδος στη συλλογή του συστήματος‑στόχου (slug = slug του συστήματος): `httpMethod` από το `Workflow.intent` (READ→GET, CREATE→POST, UPDATE→PATCH, DELETE→DELETE, ACTION→POST), `resource` = `resourceSlug` ή kebab του ονόματος, GET → `SYNC` εξ ορισμού. Σε επόμενη δημοσίευση η μέθοδος δείχνει τη νέα έκδοση, εκτός αν υπάρχει breaking change (νέα υποχρεωτική είσοδος / αφαίρεση εξόδου) — τότε μένει και προτείνεται αναβάθμιση (`lib/methods`).
- **Κλήση:** `{GET|POST|PATCH|PUT|DELETE} /api/v1/{collection}/{resource}` — είσοδος από το JSON (`{ input, externalRef, mode, callbackUrl }` ή σκέτα πεδία) ή από το query string (GET/DELETE)· `mode=sync` περιμένει έως `syncTimeoutSec` (≤120″) → 200 ή problem 422 με `code`/`targetMessage`· αλλιώς 202 + `Location: /api/v1/runs/{id}`. Idempotency‑Key: ίδιο αίτημα → ίδια εκτέλεση, διαφορετικό → 409 (`Run.requestHash`). `GET /api/v1/runs/{id}`, `GET /api/v1/collections/{c}/openapi.json`. Σφάλματα RFC 9457.
- **Κλειδιά:** `dgc_…` (Ρυθμίσεις → Κλειδιά API, SHA‑256 με `API_KEY_PEPPER`), scopes `runs:write` / `runs:read` / `collections:read`, περιορισμός συλλογών, λήξη· τα παλιά `dgbi_` ισχύουν.
- **Τεκμηρίωση στη σελίδα της μεθόδου:** endpoint, curl/TypeScript, απαντήσεις 200/202, παράμετροι, «Τι κάνει στο σύστημα, σελίδα‑σελίδα» με τα στιγμιότυπα της καταγραφής και ποιο πεδίο γεμίζει ποια παράμετρος, σφάλματα, λήψη OpenAPI. Εκκρεμούν: Postman collection, `docs.md` ανά σύστημα, jobs/batch.
