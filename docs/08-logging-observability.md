# 08 — Καταγραφές, στιγμιότυπα & observability

## 1. Τρία επίπεδα καταγραφής

| Επίπεδο | Τι | Πού | Ποιος το βλέπει |
|---|---|---|---|
| **Run timeline** | `RunStep` ανά βήμα: κατάσταση, χρόνος, locator που χρησιμοποιήθηκε, masked τιμή, URL | Postgres | Tenant (UI + API) |
| **Run logs** | `RunLog`: engine logs, `page.on('console')`, network errors (4xx/5xx), μηνύματα συστήματος‑στόχου | Postgres (partitioned) | Tenant |
| **Artifacts** | Screenshots, DOM snapshot, HAR, Playwright trace | Bunny Storage | Tenant (signed CDN URLs) |
| Platform logs | pino JSON (web, worker), OTel traces, metrics | Coolify logs (+ Grafana προαιρετικά) | DGSoft |

## 2. Στιγμιότυπα οθόνης σε σφάλμα (απαίτηση‑κλειδί)

Σε **κάθε** αποτυχία βήματος (και πριν από retry) ο Artifact Collector παράγει:

1. **`SCREENSHOT_FULL`** — `page.screenshot({ fullPage: true, mask: sensitiveLocators, maskColor: '#201F1E', animations: 'disabled' })` (PNG, max 8000px ύψος, μετά συμπίεση σε WebP q80).
2. **`SCREENSHOT_ELEMENT`** — αν ο locator βρέθηκε: crop γύρω από το στοιχείο με περιθώριο 80px **και** overlay highlight (2px `#E31E2A` περίγραμμα) που εγχέεται προσωρινά με `page.evaluate` πριν το screenshot.
3. **`SCREENSHOT_VIEWPORT`** — ό,τι «έβλεπε» ο χρήστης (για modals/overlays).
4. **`DOM_SNAPSHOT`** — `page.content()` (gzip), με αφαίρεση τιμών από `input[type=password]` και sensitive πεδία.
5. **`CONSOLE_LOG`** — τελευταία 200 console μηνύματα (JSONL).
6. **`NETWORK_HAR`** — (προαιρετικό ανά μέθοδο) τελευταία 60s, χωρίς bodies, headers `Authorization/Cookie` αφαιρούνται.
7. **`PLAYWRIGHT_TRACE`** — αν `traceOnError`: το trace.zip του run (ανοίγει στο trace.playwright.dev ή στον ενσωματωμένο viewer).

Επιπλέον, το `RunStep` που απέτυχε κρατά `meta.bbox` και το `pageUrl`, ώστε το UI να σχεδιάσει το highlight και πάνω στο full screenshot.

**Πολιτικές ανά μέθοδο (`screenshotPolicy`)**: `ON_ERROR` (default) · `EVERY_STEP` (debug/test runs· JPEG viewport 1280px) · `NEVER` (ευαίσθητα συστήματα — μόνο logs). Ρητό `screenshot` step πάντα αποθηκεύεται (π.χ. απόδειξη υποβολής). Επιπλέον, για τον οπτικό καμβά (docs/19 §7) κρατιέται μικρογραφία `STEP_THUMB` (JPEG 480px) ανά βήμα σε test runs και στην πρώτη επιτυχημένη εκτέλεση κάθε έκδοσης.

### Αποθήκευση στο Bunny (Storage zone + Pull zone)

**Ρύθμιση (μία φορά, στον λογαριασμό Bunny της DGSoft)** — τα στοιχεία (driver, storage zone, περιοχή, access key, pull zone, token key, διάρκεια signed URL) καταχωρίζονται από την εφαρμογή στο **`/admin/settings/storage`** (μόνο SUPER_ADMIN), όχι σε μεταβλητές περιβάλλοντος· τα κλειδιά αποθηκεύονται κρυπτογραφημένα (ADR‑024) και η σελίδα έχει «Δοκιμή σύνδεσης».
- **Storage zone** `dg-complete` (ή `dg-complete-staging`) σε ευρωπαϊκή κύρια περιοχή, **χωρίς** replication εκτός EU.
- **Pull zone** `dg-complete-artifacts` με origin το storage zone, **Token Authentication (Advanced / SHA‑256) ενεργό**, «Block root path access», χωρίς cache για `*.html.gz` (DOM) και με cache 1 ώρα για εικόνες (το URL αλλάζει ανά artifact, οπότε δεν υπάρχει πρόβλημα παλιού περιεχομένου).
- Κανένα αρχείο δεν δίνεται ποτέ με δημόσιο, μόνιμο URL.

**Layout διαδρομών:**
```
/dg-complete/
  tenants/{tenantId}/runs/{yyyy}/{mm}/{runId}/{artifactId}.webp | .html.gz | .jsonl | .har.gz | trace.zip
  tenants/{tenantId}/recordings/{recordingId}/thumbs/{eventId}.jpg
  tenants/{tenantId}/imports/{jobId}/source.xlsx
  tenants/{tenantId}/exports/{jobId}/results.xlsx
```

**`lib/storage/` (driver interface):**
```ts
export interface Storage {
  put(path: string, body: Buffer | Readable, contentType: string): Promise<{ sizeBytes: number; sha256: string }>;
  delete(path: string): Promise<void>;
  signedUrl(path: string, ttlSec?: number): Promise<string>;   // default από τις ρυθμίσεις (15′)
  get(path: string): Promise<Readable>;               // για εξαγωγές/ZIP tenant
}
// bunny.ts: Storage API — PUT/DELETE https://{region}.storage.bunnycdn.com/{zone}/{path} με header AccessKey
//           signedUrl: CDN https://{pullzone}.b-cdn.net/{path}?token=…&expires=… (Token Authentication, SHA-256)
// local.ts: δίσκος (dev/tests) — signedUrl = /api/artifacts/local?path=…&sig=… (HMAC)
```
- Ο worker ανεβάζει με `put()` και γράφει `RunArtifact { storagePath, sha256, sizeBytes }`.
- Το UI **δεν** παίρνει ποτέ απευθείας URL: καλεί `/api/artifacts/{id}` → έλεγχος `tenant.artifacts.view` + tenant → `302` σε signed URL 15′.
- Το API (`GET /runs/{id}/artifacts`) επιστρέφει signed URLs με `expiresAt`.
- Retention: ο scheduler διαβάζει `run_artifact` με `expiresAt < now()` και κάνει `delete()` σε batches (σημειώνει `deletedAt`). Η ακριβής μορφή του token (σειρά πεδίων στο hash) υλοποιείται σύμφωνα με την τεκμηρίωση «Token Authentication» του Bunny και επιβεβαιώνεται με test σε staging pull zone.

## 3. Redaction (απόκρυψη)

Κεντρικό `lib/engine/redact.ts`:
- Τιμές που προέρχονται από `secrets.*` ή inputs `sensitive: true` → `••••••`.
- `pii: true` → μερική απόκρυψη (`g***@dgsoft.gr`, `0940***01`).
- Regex δίχτυ: IBAN, αριθμοί καρτών (Luhn), JWT, `password=`.
- Εφαρμόζεται σε: RunLog.message/data, RunStep.valuePreview, Run.inputPreview, HAR, DOM snapshot, console logs.
- Unit tests με fixtures — **κριτήριο αποδοχής**: κανένα secret σε κανένα artifact στα e2e tests (scanner που ψάχνει τις γνωστές test τιμές μέσα στα παραγόμενα αρχεία).

## 4. Run viewer (UI)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Εκτέλεση 0192f1d2 · erp / create-customer v3 · ● Αποτυχία · 3η προσπάθεια    │
│ [Επανάληψη] [Λήψη trace] [Αντιγραφή input]                    8,4 s · 25/10   │
├─────────────────────────────┬────────────────────────────────────────────────┤
│ ΒΗΜΑΤΑ                      │  Στιγμιότυπο σφάλματος                         │
│ ✓ 01 Άνοιγμα νέου πελάτη 0,9s│  ┌──────────────────────────────────────────┐ │
│ ✓ 02 Συμπλήρωση ΑΦΜ     0,2s│  │  [full screenshot με κόκκινο highlight]   │ │
│ ✓ 03 Επωνυμία           0,2s│  │                                            │ │
│ ✓ 06 Αποθήκευση         1,1s│  └──────────────────────────────────────────┘ │
│ ✕ 07 Έλεγχος μηνυμάτων  0,4s│  [Ολόκληρη σελίδα] [Στοιχείο] [Viewport] [DOM] │
│   E_TARGET_VALIDATION       │                                                │
│   «Ο ΑΦΜ υπάρχει ήδη»       │  ΜΗΝΥΜΑ ΣΥΣΤΗΜΑΤΟΣ                             │
│ ○ 08 Επιβεβαίωση            │  Ο ΑΦΜ υπάρχει ήδη σε άλλο πελάτη              │
│ ○ 09 Κωδικός πελάτη         │  URL: https://erp…/customers/new               │
├─────────────────────────────┴────────────────────────────────────────────────┤
│ LOGS  [Όλα ▾] [Engine] [Console] [Network] [Σύστημα]          🔍 αναζήτηση   │
│ 10:31:02.120 INFO  engine  s06 click role=button "Αποθήκευση"                │
│ 10:31:03.233 WARN  network POST /api/customers → 409                          │
│ 10:31:03.640 ERROR target  «Ο ΑΦΜ υπάρχει ήδη σε άλλο πελάτη»                │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Κλικ σε βήμα → φιλτράρει logs και δείχνει το screenshot εκείνου του βήματος (αν υπάρχει).
- Σύγκριση προσπαθειών (attempt 1 vs 3) σε tabs.
- Lightbox με zoom/pan για screenshots, εναλλαγή highlight on/off.
- Embedded trace viewer: self‑host του `@playwright/trace-viewer` static build κάτω από `/trace-viewer` που φορτώνει το trace από signed Bunny URL (CORS στο pull zone μόνο για το domain της εφαρμογής).

## 5. Μετρικές & alerts

Prometheus (από worker/web):
- `dgcomplete_runs_total{tenant,method,status}`, `dgcomplete_run_duration_seconds` (histogram), `dgcomplete_step_failures_total{method,step,code}`, `dgcomplete_queue_depth{queue}`, `dgcomplete_locator_fallback_total{method,step}`, `dgcomplete_browser_contexts_active`.

Alerts tenant (in‑app + email):
- Ποσοστό αποτυχίας μεθόδου > 20% σε 15′.
- `E_AUTH_FAILED` → «Το διαπιστευτήριο Χ φαίνεται άκυρο».
- Job ολοκληρώθηκε με σφάλματα.

Alerts platform: queue depth > 5000, worker down, σφάλματα Bunny Storage API, DB connections > 80%.

## 6. Audit log

Ενέργειες: login, member invite/role change, credential create/update/**reveal**, workflow publish/approve, method version change, api key create/revoke, webhook change, tenant settings, data export/delete. Πεδία: actor, ip, user agent, entity, diff (χωρίς secrets). Προβολή με φίλτρα + export CSV.
