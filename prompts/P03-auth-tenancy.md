# P03 — Ρόλοι, Microsoft Entra ID, εγκρίσεις

## Πλαίσιο
Διάβασε: `docs/02-multitenancy-security.md` §2–§3, `lib/auth.ts`, `lib/rbac.ts`, `app/admin/settings/access`, `app/admin/tenants/[id]/tenant-users.tsx`.

## Στόχος
Οι νέοι ρόλοι και permissions του DG Complete, σύνδεση με Microsoft, διαχείριση μελών μέσα στον tenant και ο μηχανισμός ειδοποιήσεων για εγκρίσεις.

## Εργασίες
1. `lib/rbac.ts`: πρόσθεσε στο `ROLES` τους `TENANT_DESIGNER`, `TENANT_OPERATOR`· νέα `PERMISSION_DEFS` και `DEFAULT_GRANTS` ακριβώς όπως docs/02 §3 (ομάδα «DG Complete»). Η σελίδα `/admin/settings/access` πρέπει να τα δείχνει αυτόματα.
2. Better Auth: social provider **Microsoft** (Entra ID, `tenantId: common`), με κανόνα: σύνδεση επιτρέπεται μόνο αν υπάρχει ήδη χρήστης με το ίδιο email ή εκκρεμής πρόσκληση (κράτα `disableSignUp`). Κουμπί «Σύνδεση με Microsoft» πρώτο στο `/login`.
3. `/t/[tenantId]/settings/members`: λίστα μελών, πρόσκληση με email (επαναχρησιμοποίησε τη ροή προσκλήσεων/δημιουργίας χρήστη του dgsmartbi), αλλαγή ρόλου, αφαίρεση· τουλάχιστον ένας TENANT_ADMIN.
4. `lib/notifications.ts`: `notify(tenantId, { kind, title, link }, { permission })` → γραμμές `Notification` για όλους με το δικαίωμα + email (Mailgun template). Καμπανάκι στο header με μη αναγνωσμένα.
5. Rate limit login στον Postgres — πίνακας `RateLimitBucket` (ADR‑022) (5/λεπτό ανά IP+email) — `lib/rate-limit.ts` (θα το χρησιμοποιήσει και το API στο P10).
6. `audit()` σε login, πρόσκληση, αλλαγή ρόλου.
7. Tests: πίνακας permissions (snapshot), Designer δεν έχει `tenant.workflows.approve`, Operator δεν βλέπει «Μέλη».

## Κριτήρια αποδοχής
- [ ] Χρήστες κάθε ρόλου από το seed βλέπουν μόνο ό,τι επιτρέπει ο πίνακας.
- [ ] Login με Microsoft λειτουργεί για υπάρχοντα χρήστη και απορρίπτεται για άγνωστο email.
- [ ] Ειδοποίηση εμφανίζεται στο καμπανάκι και φτάνει email στο mailpit.
