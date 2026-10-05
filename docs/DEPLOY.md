# DGsmart BI — Deploy στο Coolify

Η εφαρμογή (`bi.dgsmart.gr`) και ο Cube server (`cube.dgsmart.gr`) τρέχουν στο Coolify και χρησιμοποιούν τον PostgreSQL server `100.70.50.43:5432` (Tailscale).

| Βάση | Χρήση |
|---|---|
| `dgsmartbi` | Η εφαρμογή (χρήστες, tenants, πληρωμές, συγχρονισμοί, ρυθμίσεις) |
| `cubebiproduction` | Δεδομένα πελατών για το Cube — schema `t_<tenant>`, ρόλος `r_<tenant>` |
| `cubebidev` | Δεδομένα δοκιμών για το Cube Playground |

---

## 0. Προαπαιτούμενα

- [ ] Ο server του Coolify είναι στο ίδιο **Tailscale** δίκτυο με το `100.70.50.43`.
  Έλεγχος από τον server του Coolify:
  ```bash
  docker run --rm postgres:16-alpine pg_isready -h 100.70.50.43 -p 5432
  ```
- [ ] **DNS**: εγγραφή `A` (ή `CNAME`) για `bi.dgsmart.gr` → IP του server του Coolify.
- [ ] Το Coolify έχει πρόσβαση στο GitHub repo `cloudzeus/dgsmartbi` (GitHub App ή deploy key).
- [ ] Έχεις πρόχειρο το τοπικό `.env` — οι τιμές του χρειάζονται στο βήμα 3.

## 1. Πρόσβαση στη βάση (`pg_hba.conf` στο 100.70.50.43)

Πρόσθεσε **πάνω από τους γενικούς κανόνες** (αντικατέστησε `<IP_COOLIFY>` με την Tailscale IP του server του Coolify):

```
# DGsmart BI — εφαρμογή
host  dgsmartbi         <χρήστης-εφαρμογής>  <IP_COOLIFY>/32   scram-sha-256

# DGsmart BI — Cube
host  cubebiproduction  +cube_tenants        <IP_COOLIFY>/32   scram-sha-256
host  cubebiproduction  +cube_tenants        100.69.88.19/32   scram-sha-256   # Mac — έλεγχοι από το dev
host  cubebidev         <χρήστης-dev>        <IP_COOLIFY>/32   scram-sha-256
host  all               +cube_tenants        0.0.0.0/0         reject          # οι ρόλοι πελατών ΜΟΝΟ στην cubebiproduction
```

Εφαρμογή χωρίς restart:
```sql
SELECT pg_reload_conf();
```

> Το group `cube_tenants` το δημιουργεί αυτόματα το πρώτο provisioning πελάτη. Η τελευταία γραμμή (`reject`) εμποδίζει τους ρόλους πελατών να συνδεθούν σε οποιαδήποτε άλλη βάση του server.

## 2. Νέο resource στο Coolify

**Project → + New → Public / Private Repository**

| Ρύθμιση | Τιμή |
|---|---|
| Repository | `cloudzeus/dgsmartbi` |
| Branch | `master` |
| Build Pack | **Dockerfile** (χρησιμοποιεί το `Dockerfile` στη ρίζα) |
| Ports Exposes | `3000` |
| Domains | `https://bi.dgsmart.gr` |
| Health check | Ενεργό — path `/api/health`, port `3000` (το image έχει και δικό του `HEALTHCHECK`) |

## 3. Environment variables

**Developer view** → επικόλληση. Καμία **δεν** χρειάζεται ως *Build Variable* (το build χρησιμοποιεί placeholders).

```env
DATABASE_URL=postgresql://<χρήστης>:<κωδικός>@100.70.50.43:5432/dgsmartbi
BETTER_AUTH_SECRET=<ίδιο με το τοπικό .env>
BETTER_AUTH_URL=https://bi.dgsmart.gr
DATA_ENCRYPTION_KEYS=<ΑΚΡΙΒΩΣ ίδιο με το τοπικό .env>
CRON_SECRET=<ίδιο με το τοπικό .env>
```

| Μεταβλητή | Σημείωση |
|---|---|
| `DATABASE_URL` | Ειδικοί χαρακτήρες στον κωδικό σε URL-encoding (`@` → `%40`). |
| `BETTER_AUTH_SECRET` | Αν αλλάξει, όλοι οι χρήστες αποσυνδέονται (οι κωδικοί δεν επηρεάζονται). |
| `BETTER_AUTH_URL` | Το δημόσιο URL — χωρίς `/` στο τέλος. |
| `DATA_ENCRYPTION_KEYS` | ⚠️ **Κρίσιμο.** Κρυπτογραφεί τα credentials των συνδέσεων, του SoftOne και τα secrets του Cube. Αν διαφέρει από το τοπικό, τίποτα από αυτά δεν αποκρυπτογραφείται. Κράτα αντίγραφο σε password manager. |
| `CRON_SECRET` | Απαραίτητο για τον scheduler των συγχρονισμών. Χωρίς αυτό ο scheduler **δεν ξεκινά**. |
| `SCHEDULER` | Προαιρετικό. Στην παραγωγή ο scheduler είναι ενεργός· `off` μόνο αν τρέχουν πολλά replicas και θες να τον έχει ένα. |

> Τα `SEED_ADMIN_*` **δεν** χρειάζονται στην παραγωγή — ο super admin υπάρχει ήδη στη βάση `dgsmartbi`.

## 4. Deploy

Πάτα **Deploy**. Το container σε κάθε εκκίνηση:
1. εφαρμόζει όσα migrations εκκρεμούν (`prisma migrate deploy`),
2. ξεκινά τον server στη θύρα 3000,
3. ξεκινά τον **scheduler** των συγχρονισμών SoftOne (πρώτος έλεγχος μετά από 15″, μετά κάθε λεπτό).

Στο log θα δεις:
```
… migrations … No pending migrations to apply.
✓ Ready
[scheduler] started — SoftOne sync jobs run every minute
```

## 5. Έλεγχος μετά το deploy

```bash
curl -s https://bi.dgsmart.gr/api/health
```
Αναμενόμενο: `{"ok":true,"encryption":"ok"}`
- `ok:true` → η εφαρμογή βλέπει τη βάση.
- `encryption:"ok"` → το `DATA_ENCRYPTION_KEYS` αποκρυπτογραφεί τα αποθηκευμένα credentials. Με `"mismatch"` οι σελίδες SoftOne / Συνδέσεις δεδομένων δίνουν σφάλμα — διόρθωσε την τιμή (βλ. πίνακα στο τέλος).

- [ ] Σύνδεση στο `https://bi.dgsmart.gr` με τον super admin.
- [ ] **Ρυθμίσεις → SoftOne DGsoft**: «Συνδεδεμένο» (αν όχι → «Δοκιμή σύνδεσης»· σφάλμα αποκρυπτογράφησης = λάθος `DATA_ENCRYPTION_KEYS`).
- [ ] **Ρυθμίσεις → Συγχρονισμοί**: ο Scheduler «Ενεργός» και ο «Τελευταίος έλεγχος» ανανεώνεται κάθε λεπτό.
- [ ] **Ρυθμίσεις → Αρχεία καταγραφής → Σφάλματα**: κενό.

## 6. Ενημέρωση του Cube server

Η εφαρμογή είναι πλέον στο `bi.dgsmart.gr`, οπότε το Cube πρέπει να ξέρει πού να ζητά τη λίστα των tenants.

1. **Ρυθμίσεις → Cube server**: «URL εφαρμογής» = `https://bi.dgsmart.gr` → Αποθήκευση.
2. Αντέγραψε το νέο **docker-compose** στο resource του Cube στο Coolify.
3. **Environment variables** → «Εμφάνιση» → επικόλληση στο resource του Cube (`CUBEJS_API_SECRET`, `WH_ROLE_SECRET`, `CONTROL_PLANE_TOKEN`, …).
4. Redeploy το Cube.

Έλεγχος: σε έναν tenant → «Έλεγχος απομόνωσης & Cube» → όλα τα βήματα πράσινα.

## 7. Ενημερώσεις εφαρμογής

Κάθε `git push` στο `master` → **Redeploy** στο Coolify (ή ενεργοποίηση *Auto Deploy* στο resource). Τα migrations εφαρμόζονται αυτόματα στην εκκίνηση.

**Rollback**: Coolify → Deployments → προηγούμενο deployment → *Redeploy*.
> Αν το νέο deployment είχε migration που άλλαξε σχήμα, το rollback του κώδικα δεν αναιρεί το migration — έλεγξε πρώτα το `prisma/migrations`.

## 8. Πολλά replicas (προαιρετικό)

Οι συγχρονισμοί είναι ασφαλείς με πολλά replicas (κάθε job κλειδώνει στη βάση και τρέχει μία φορά τη φορά). Για λιγότερο θόρυβο, όρισε `SCHEDULER=off` σε όλα εκτός από ένα.

## 9. Αντίγραφα ασφαλείας

- [ ] Backup της βάσης `dgsmartbi` (π.χ. scheduled `pg_dump` στο Coolify ή στον DB server).
- [ ] Το `DATA_ENCRYPTION_KEYS` σε ασφαλές μέρος, **χωριστά** από το backup της βάσης.
- [ ] Τα `cubebiproduction` δεδομένα αναπαράγονται από το SoftOne με «Πλήρη εκτέλεση» των συγχρονισμών· backup είναι προαιρετικό.

## 10. Αντιμετώπιση προβλημάτων

| Σύμπτωμα | Αιτία / λύση |
|---|---|
| Το build αποτυγχάνει στο `npm ci` | Το `package-lock.json` δεν είναι συγχρονισμένο — `npm install` τοπικά, commit, push. |
| Το container κάνει restart, στο log `P1001` / `Can't reach database` | Το Coolify δεν βλέπει το `100.70.50.43` (Tailscale) ή λείπει γραμμή στο `pg_hba.conf`. |
| `no pg_hba.conf entry for host …` | Πρόσθεσε την IP που αναφέρει το μήνυμα στο `pg_hba.conf` (βήμα 1) και `SELECT pg_reload_conf();`. |
| Σελίδες «SoftOne DGsoft» / «Συνδέσεις δεδομένων» δίνουν *This page couldn't load*, ή `/api/health` → `"encryption":"mismatch"` | Το `DATA_ENCRYPTION_KEYS` δεν είναι ίδιο με το τοπικό. Αντέγραψε **μόνο** την τιμή `k1:…` (χωρίς κενά/αλλαγή γραμμής), αποθήκευσε και κάνε **Restart** (όχι μόνο save). |
| Σύνδεση χρήστη επιστρέφει στη σελίδα login | Λάθος `BETTER_AUTH_URL` (πρέπει να είναι ακριβώς `https://bi.dgsmart.gr`). |
| Ο scheduler εμφανίζεται «Ανενεργός» | Λείπει το `CRON_SECRET` ή έχει οριστεί `SCHEDULER=off`. |
| Συγχρονισμοί «Σφάλμα» | Ρυθμίσεις → Αρχεία καταγραφής → Σφάλματα: το μήνυμα του SoftOne (π.χ. λάθος πεδίο/φίλτρο → διόρθωση στη φόρμα του συγχρονισμού). |

> ⚠️ **Τοπικό περιβάλλον**: το τοπικό `.env` δείχνει στην **ίδια** βάση `dgsmartbi` με την παραγωγή. Αλλαγές από το `localhost:3000` (χρήστες, ρυθμίσεις, migrations) επηρεάζουν άμεσα την παραγωγή. Για ανεξάρτητη ανάπτυξη, δημιούργησε ξεχωριστή βάση (π.χ. `dgsmartbi_dev`) και άλλαξε το `DATABASE_URL` του τοπικού `.env`.
