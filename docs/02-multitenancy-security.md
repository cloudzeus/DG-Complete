# 02 — Multi‑tenancy & Ασφάλεια

Βάση: το μοντέλο tenancy και δικαιωμάτων του **dgsmartbi** (βλ. [15-fork-dgsmartbi.md](15-fork-dgsmartbi.md)), επεκτεταμένο για τα ευαίσθητα δεδομένα του DG Complete.

## 1. Μοντέλο tenancy

**Μία βάση (`DG_COMPLETE`), κοινό schema, `tenantId` σε κάθε tenant‑scoped πίνακα.** Ο tenant προκύπτει:

| Κανάλι | Πώς |
|---|---|
| UI | Από το path `/t/[tenantId]/…` + έλεγχος membership στο `requireTenant(tenantId)` (ίδιο pattern με το `requireDashboardTenant` του dgsmartbi). Platform staff (SUPER_ADMIN/ADMIN) μπαίνουν σε κάθε tenant. |
| Public API | Από το API key (κάθε key ανήκει σε έναν tenant) |
| Extension | Recorder token (JWT 2 ωρών με tenantId + recordingId) |
| Worker | Από το job payload — ξαναδιαβάζεται από το `Run` στη βάση |

### 1.1 Δύο επίπεδα απομόνωσης

1. **Εφαρμογή (κύριο, όπως dgsmartbi):** κάθε query σε tenant data περνά από `lib/tenant-db.ts`:
   ```ts
   // Prisma 7 client extension: προσθέτει tenantId σε where/data για τα tenant μοντέλα
   export function tenantDb(tenantId: string) {
     return prisma.$extends({
       query: {
         $allModels: {
           async $allOperations({ model, operation, args, query }) {
             if (!TENANT_MODELS.has(model)) return query(args);
             return query(scopeArgs(operation, args, tenantId)); // where.tenantId / data.tenantId
           },
         },
       },
     });
   }
   ```
   Κανόνας ESLint: στα `app/t/**` και `app/api/v1/**` απαγορεύεται import του `prisma` απευθείας — μόνο `tenantDb()`.
2. **Βάση (άμυνα σε βάθος) για τα ευαίσθητα νέα μοντέλα:** PostgreSQL RLS σε `Credential`, `BrowserSession`, `Run`, `RunStep`, `RunLog`, `RunArtifact`, `Recording`. Η εφαρμογή θέτει `set_config('app.tenant_id', …, true)` μέσα σε interactive transaction (`prisma.$transaction(async tx => …)`) πριν από κάθε query σε αυτά τα μοντέλα. Ο ρόλος σύνδεσης δεν έχει `BYPASSRLS`· τα admin/scheduler paths χρησιμοποιούν policy `app.platform = 'on'`.

```sql
ALTER TABLE "run" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "run"
  USING ("tenantId" = current_setting('app.tenant_id', true)
         OR current_setting('app.platform', true) = 'on');
```
> Αν η RLS αποδειχθεί δύσχρηστη με το Prisma 7 στο P02, κρατάμε μόνο το επίπεδο εφαρμογής + tests απομόνωσης και καταγράφουμε την απόφαση στο ADR‑006.

## 2. Ταυτοποίηση (Better Auth — από dgsmartbi)

- Email + κωδικός (min 10 χαρακτήρες), **χωρίς δημόσια εγγραφή**: χρήστες δημιουργούνται από admins ή με πρόσκληση.
- Reset κωδικού μέσω Mailgun (link 1 ώρας, ανάκληση όλων των sessions).
- Sessions 7 ημερών, ανανέωση ανά 24 ώρες.
- **Νέο:** Microsoft Entra ID ως social provider (οι πελάτες είναι σε M365), με αντιστοίχιση σε υπάρχοντα χρήστη μόνο αν υπάρχει ήδη ο λογαριασμός ή πρόσκληση.
- **Νέο:** 2FA (plugin `twoFactor` του Better Auth) υποχρεωτικό για platform staff και TENANT_ADMIN — φάση 2.
- Brute force: rate limit στο login (Valkey).

## 3. Ρόλοι & δικαιώματα

Πλατφόρμα (από dgsmartbi): `SUPER_ADMIN`, `ADMIN`, `USER`. Tenant: **`TENANT_ADMIN`, `TENANT_DESIGNER`, `TENANT_OPERATOR`, `TENANT_USER`** (viewer). Ο πίνακας είναι editable από το `/admin/settings/access` (πίνακας `RolePermission`)· παρακάτω τα defaults που μπαίνουν στο `lib/rbac.ts`.

| Permission | TENANT_ADMIN | TENANT_DESIGNER | TENANT_OPERATOR | TENANT_USER |
|---|:-:|:-:|:-:|:-:|
| tenant.users.manage | ✔ | | | |
| tenant.billing.manage (πακέτο, αγορές εκτελέσεων) | ✔ | | | |
| tenant.apikeys.manage | ✔ | | | |
| tenant.webhooks.manage | ✔ | | | |
| tenant.targets.manage / tenant.credentials.manage | ✔ | ✔ | | |
| tenant.credentials.reveal | ✔ | | | |
| tenant.recordings.create | ✔ | ✔ | | |
| tenant.workflows.edit | ✔ | ✔ | | |
| tenant.workflows.submit (για έγκριση) | ✔ | ✔ | | |
| **tenant.workflows.approve** (δημοσίευση) | ✔ | | | |
| tenant.methods.manage | ✔ | ✔ | | |
| tenant.runs.execute (UI, Excel) | ✔ | ✔ | ✔ | |
| tenant.runs.retry / cancel | ✔ | ✔ | ✔ | |
| tenant.runs.view / tenant.artifacts.view | ✔ | ✔ | ✔ | ✔ |
| tenant.audit.view | ✔ | | | |

**Έγκριση δημοσίευσης (υποχρεωτική):** ο Designer υποβάλλει έκδοση → `PENDING_APPROVAL` → ειδοποίηση στους TENANT_ADMIN (in‑app + email) → έγκριση ή απόρριψη με σχόλιο. Ο εγκρίνων βλέπει diff με την προηγούμενη δημοσιευμένη έκδοση και το τελευταίο επιτυχημένο test run. Δεν επιτρέπεται έγκριση έκδοσης χωρίς επιτυχημένο test run.

### API key scopes
Επέκταση του `ApiKey` του dgsmartbi: `scopes[]` (`runs:write`, `runs:read`, `jobs:write`, `jobs:read`, `artifacts:read`, `collections:read`, `usage:read`), `collectionIds[]` (κενό = όλες), `ipAllowlist[]`, `expiresAt`. Μορφή `dgc_` + 32 bytes base64url, αποθήκευση SHA‑256, εμφάνιση μία φορά. Rate limit σε Valkey (sliding window ανά key), όχι in‑process.

## 4. Θυρίδα διαπιστευτηρίων

Χρησιμοποιούμε το `lib/crypto.ts` του dgsmartbi (AES‑256‑GCM, keyring `DATA_ENCRYPTION_KEYS` με rotation), με δύο προσθήκες:
- **AAD** = `tenantId:credentialId` ώστε ένα ciphertext να μην μπορεί να μεταφερθεί σε άλλη εγγραφή (`encrypt(plain, aad)` overload).
- Αποκρυπτογράφηση **μόνο στον worker** τη στιγμή της εκτέλεσης· το web δεν επιστρέφει ποτέ secrets εκτός από `tenant.credentials.reveal` με επανεπιβεβαίωση κωδικού και audit.

Το ίδιο ισχύει για αποθηκευμένα browser sessions (`BrowserSession.storageStateEnc`), το πλήρες input των runs (`Run.inputEnc`) και τα secrets των webhooks.

## 5. Προστασία δεδομένων (GDPR)

- Masking πεδίων `sensitive`/`pii` σε logs, DOM snapshots και **screenshots** (`page.screenshot({ mask })`).
- Retention ανά πακέτο (`Plan.artifactRetentionDays`, `logRetentionDays`) — ο scheduler σβήνει αρχεία από το Bunny Storage και εγγραφές από τη βάση.
- Export tenant (ZIP) και οριστική διαγραφή (2 βήματα, 7 ημέρες περιθώριο).
- Φιλοξενία: Contabo (EU) + Bunny Storage zone σε ευρωπαϊκή περιοχή (π.χ. Falkenstein/DE) χωρίς replication εκτός EU.
- Audit log για κάθε ενέργεια διαχείρισης (ήδη στο dgsmartbi).

## 6. Ασφάλεια εφαρμογής (checklist)

- [ ] CSP αυστηρό, `frame-ancestors 'none'`, HSTS.
- [ ] Server Actions: πάντα `requirePermission(perm, tenantId)` πρώτα (pattern dgsmartbi).
- [ ] Rate limiting σε Valkey: API ανά key, login ανά IP.
- [ ] SSRF: ο worker ανοίγει **μόνο** URLs των `TargetSystem.allowedOrigins`· μπλοκ private IP ranges.
- [ ] Webhook URLs: μόνο https, όχι private IPs, timeout 10s.
- [ ] Worker container non‑root, read‑only FS εκτός `/tmp`.
- [ ] Καμία εκτέλεση αυθαίρετου JS από tenants (το DSL δεν έχει `eval` step).
- [ ] Bunny: Storage API key μόνο στον server· το Pull Zone έχει Token Authentication και «Block root path access»· κανένα δημόσιο URL artifact.
- [ ] Uploads (CSV/XLSX) έως 20 MB, parsing στον worker.
