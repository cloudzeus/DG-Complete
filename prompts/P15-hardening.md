# P15 — Hardening, ασφάλεια, e2e

## Πλαίσιο
Διάβασε: `docs/02` §5–§6, `docs/12-testing.md`, `docs/13` ρίσκα.

## Στόχος
Έτοιμο για pilot: ασφάλεια, GDPR, πλήρη e2e και load tests.

## Εργασίες
1. Security headers (CSP με nonces, HSTS, frame-ancestors none) στο `next.config.ts`/proxy.
2. Checklist docs/02 §6 → `docs/SECURITY-REVIEW.md` με ευρήματα και διορθώσεις.
3. GDPR: export tenant (ZIP με JSON + artifacts από το storage), διαγραφή tenant 2 βημάτων με περιθώριο 7 ημερών (σβήνει και τα αρχεία στο Bunny), ToS/DPA με καταγραφή αποδοχής.
4. Rotation κλειδιών: script που προσθέτει νέο κλειδί στο `DATA_ENCRYPTION_KEYS` και ξανακρυπτογραφεί credentials/sessions/inputs/webhook secrets.
5. Όλα τα κρίσιμα tests του docs/12 §3.
6. E2E: (α) tenant → σύστημα → καταγραφή → ροή → υποβολή → έγκριση → μέθοδος → API key → κλήση → αποτυχία → διάγνωση → διόρθωση → επιτυχία· (β) Excel job με χρέωση· (γ) humanTask· (δ) αγορά πακέτου εκτελέσεων.
7. k6: 200 rps enqueue για 5′, p95 < 150ms· fair scheduling 3 tenants.
8. axe σε όλες τις βασικές οθόνες.
9. Error boundaries / not‑found / forbidden με DG empty states.
10. Ενημέρωσε τα docs όπου η υλοποίηση απέκλινε.

## Κριτήρια αποδοχής
- [ ] Όλα τα tests πράσινα στο CI.
- [ ] Tests απομόνωσης, redaction και ledger πράσινα.
- [ ] axe: 0 serious/critical.
- [ ] `SECURITY-REVIEW.md` χωρίς ανοιχτά High.
