# 00 — Επισκόπηση προϊόντος

## 1. Το πρόβλημα

Πολλές επιχειρήσεις (και οι πελάτες της DGSoft) καταχωρίζουν καθημερινά τα ίδια δεδομένα χειροκίνητα σε τρίτα web συστήματα που **δεν έχουν API** ή έχουν ελλιπές API: κρατικές πύλες, portals προμηθευτών/τραπεζών, παλιά ERP web clients, B2B πλατφόρμες, συστήματα ασφαλιστικών κ.λπ. Η δουλειά είναι επαναλαμβανόμενη, αργή και επιρρεπής σε λάθη.

## 2. Η λύση

Ένα **multi‑tenant SaaS** που:

```
Καταγραφή (Record) ─▶ Ροή (Workflow) ─▶ Μέθοδος API (Method) ─▶ Μαζική εκτέλεση (Jobs/Runs) ─▶ Πλήρη logs + screenshots
```

- Ο **σχεδιαστής** ανοίγει το τρίτο σύστημα, πατά «Έναρξη καταγραφής» στο extension και κάνει μία φορά την καταχώριση.
- Η πλατφόρμα παράγει **draft workflow**. Ο σχεδιαστής ορίζει ποια πεδία είναι **παράμετροι** (π.χ. ΑΦΜ, ποσό, ημερομηνία), προσθέτει ελέγχους (assertions) και τι **εξάγεται** στο τέλος (π.χ. αριθμός πρωτοκόλλου).
- Δημοσιεύει (publish) μια **έκδοση** του workflow και τη συνδέει σε μια **Μέθοδο** μέσα σε μια **Συλλογή Μεθόδων**.
- Οι εξωτερικές εφαρμογές (SoftOne, e‑shop, middleware, Excel/CSV upload) καλούν `POST /api/v1/collections/{c}/methods/{m}/runs` ή `/jobs` για μαζικά.
- Οι workers εκτελούν, καταγράφουν και επιστρέφουν αποτέλεσμα (sync/async/webhook).

**Pilot:** World Wide Associates (σύμβουλοι ΕΣΠΑ) σε **TAXIS** και **ΟΠΣΚΕ** — docs/18. Domain: `https://complete.dgsmart.gr`.

## 3. Personas

| Persona | Ρόλος | Τι θέλει |
|---|---|---|
| **Σχεδιαστής ροών** (Designer) | Power user / συνεργάτης DGSoft | Γρήγορη καταγραφή, εύκολη παραμετροποίηση, test run |
| **Χειριστής** (Operator) | Υπάλληλος πελάτη | Ανέβασμα Excel, παρακολούθηση προόδου, επανάληψη αποτυχημένων |
| **Integrator** | Developer τρίτης εφαρμογής | Σταθερό API, OpenAPI, idempotency, webhooks |
| **Tenant Admin** | IT/υπεύθυνος πελάτη | Μέλη, ρόλοι, API keys, διαπιστευτήρια, **έγκριση δημοσιεύσεων**, πακέτο & αγορές εκτελέσεων |
| **Platform Admin** | DGSoft | Tenants, πακέτα & τιμές, πληρωμές, workers, υγεία ουρών |

## 4. Γλωσσάρι (canonical όροι — ίδιοι σε κώδικα & UI)

| Κώδικας | UI (ελληνικά) | Ορισμός |
|---|---|---|
| `Tenant` | Οργανισμός | Ο πελάτης του SaaS· απομονωμένα δεδομένα (μοντέλο του dgsmartbi) |
| `TargetSystem` | Σύστημα‑στόχος | Το τρίτο web σύστημα (base URL, login, όρια) |
| `Credential` | Διαπιστευτήριο | Κρυπτογραφημένα στοιχεία σύνδεσης σε TargetSystem |
| `Recording` | Καταγραφή | Ακατέργαστα events από το recorder |
| `Workflow` | Ροή | Λογική οντότητα διεργασίας (π.χ. «Καταχώριση τιμολογίου») |
| `WorkflowVersion` | Έκδοση ροής | Αμετάβλητος ορισμός βημάτων (DSL JSON) |
| `Step` | Βήμα | Μία ενέργεια: navigate, fill, click, assert, extract… |
| `MethodCollection` | Συλλογή μεθόδων | Ομάδα μεθόδων με κοινό base path και OpenAPI |
| `Method` | Μέθοδος | API endpoint που δείχνει σε δημοσιευμένη έκδοση ροής |
| `Job` | Μαζική εργασία | Batch πολλών εγγραφών (items) |
| `Run` | Εκτέλεση | Μία εκτέλεση ροής για ένα input |
| `RunStep` | Βήμα εκτέλεσης | Αποτέλεσμα ενός βήματος σε ένα Run |
| `Artifact` | Τεκμήριο | Screenshot, DOM snapshot, trace, HAR, console log |
| `ApiKey` | Κλειδί API | Bearer token tenant με scopes (`dgc_…`) |
| `Plan` | Πακέτο | Συνδρομή με εκτελέσεις/μήνα και όρια |
| `RunCreditLedger` | Κινήσεις εκτελέσεων | Χορηγήσεις, αγορές, χρεώσεις, επιστροφές εκτελέσεων |
| `Webhook` | Webhook | Callback URL για events |

## 5. Λειτουργικές απαιτήσεις (MVP)

- FR‑01 Multi‑tenant πάνω στη βάση του dgsmartbi (tenants, πακέτα, πληρωμές) με απομόνωση δεδομένων· περιοχή tenant στο `/t/[tenantId]`.
- FR‑02 Χρήστες, προσκλήσεις, ρόλοι (Tenant Admin / Designer / Operator / Viewer + platform staff) με editable πίνακα δικαιωμάτων.
- FR‑03 Διαχείριση Συστημάτων‑στόχων και κρυπτογραφημένων διαπιστευτηρίων (συμπ. TOTP).
- FR‑04 Καταγραφή βημάτων μέσω Chrome extension (MV3) με πολλαπλές στρατηγικές locator.
- FR‑05 Μετατροπή καταγραφής σε workflow, οπτικός editor βημάτων, παραμετροποίηση, input/output schema.
- FR‑06 Test run από τον editor με δείγμα input και live πρόοδο.
- FR‑07 Versioning (πρόχειρο → προς έγκριση → δημοσιευμένη → αρχειοθετημένη), διαφορές μεταξύ εκδόσεων· **η δημοσίευση απαιτεί έγκριση Tenant Admin**.
- FR‑08 Συλλογές μεθόδων, μέθοδοι, auto OpenAPI 3.1 ανά συλλογή, «Try it».
- FR‑09 Εκτέλεση sync/async, batch jobs έως 10.000 items, idempotency keys.
- FR‑10 Μαζική εισαγωγή CSV/XLSX από UI με αντιστοίχιση στηλών.
- FR‑11 Webhooks με HMAC υπογραφή και retries.
- FR‑12 Λεπτομερή logs ανά βήμα· **screenshot σε κάθε σφάλμα** + DOM snapshot + trace· προαιρετικά screenshot σε κάθε βήμα.
- FR‑13 Επανάληψη (retry) αποτυχημένων runs μεμονωμένα ή μαζικά.
- FR‑14 Dashboard: όγκος, ποσοστό επιτυχίας, πιο προβληματικές μέθοδοι/βήματα.
- FR‑15 Audit log για κάθε ενέργεια διαχείρισης.
- FR‑16 Πολιτικές διατήρησης (retention) logs/artifacts ανά πακέτο.
- FR‑17 Τιμολόγηση ανά εκτέλεση με πακέτα (μηνιαίες εκτελέσεις, πακέτα επιπλέον εκτελέσεων, overage) · χρεώσεις, παραστατικά και πληρωμές στο SoftOne της DGsoft, με τους πελάτες SoftOne συγχρονισμένους ως tenants (docs/14, docs/15).
- FR‑18 Αποθήκευση στιγμιοτύπων/artifacts στο Bunny (ιδιωτικό Storage zone + signed CDN URLs).
- FR‑19 Ανάλυση DOM με OpenRouter: προτάσεις ονομάτων/τύπων πεδίων, εξήγηση σφαλμάτων, προτάσεις locators (docs/16).
- FR‑20 Τεκμηρίωση ανά σύστημα‑στόχο (σελίδα, Markdown, PDF) και Postman collection v2.1 με environment (docs/17).
- FR‑21 Πολλαπλά διαπιστευτήρια ανά σύστημα (ένα ανά δικαιούχο, με ΑΦΜ) και επιλογή τους από το API (`credentialRef`).
- FR‑22 Δώρα εκτελέσεων και πίστωσης AI (ποσό) από τον SUPER_ADMIN, με αιτιολογία και audit.

## 6. Μη λειτουργικές απαιτήσεις

| Θέμα | Στόχος |
|---|---|
| Διαθεσιμότητα API | 99.5% (MVP) |
| Latency API (enqueue) | p95 < 150 ms |
| Throughput | ≥ 20 παράλληλα runs ανά worker node (4 vCPU/8 GB) |
| Ασφάλεια | OWASP ASVS L2, κρυπτογράφηση secrets AES‑256‑GCM, TLS παντού |
| GDPR | Masking PII σε logs/screenshots, retention, DPA, export/delete tenant |
| Γλώσσα | UI στα ελληνικά (canonical), αγγλικά δευτερεύοντα (next‑intl) |
| Προσβασιμότητα | WCAG 2.1 AA |

## 7. Μη‑στόχοι (out of scope)

- Παράκαμψη CAPTCHA ή μηχανισμών anti‑bot. Όταν εμφανίζεται CAPTCHA → **human‑in‑the‑loop** (το run πάει σε `NEEDS_ATTENTION`).
- Desktop (μη web) εφαρμογές και συστήματα μόνο εντός LAN πελάτη — όλα τα συστήματα‑στόχοι είναι web, οπότε δεν υπάρχει on‑prem agent.
- Παραβίαση όρων χρήσης τρίτων συστημάτων: ο tenant δηλώνει ότι έχει δικαίωμα αυτοματοποίησης (checkbox + ToS).
- Γενικό scraping.

## 8. Δείκτες επιτυχίας

- Χρόνος από καταγραφή σε δημοσιευμένη μέθοδο < 30 λεπτά για απλή φόρμα.
- Ποσοστό επιτυχίας runs > 97% σε σταθερά συστήματα.
- Mean time to diagnose σφάλματος < 2 λεπτά (χάρη σε screenshot + βήμα + μήνυμα).
