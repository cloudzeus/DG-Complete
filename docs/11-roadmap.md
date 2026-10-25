# 11 — Roadmap & φάσεις υλοποίησης

Κάθε φάση αντιστοιχεί σε ένα prompt στο `prompts/`. Εκτίμηση για 1 developer με Claude Code.

```mermaid
gantt
  title DG Complete — Πλάνο υλοποίησης
  dateFormat  YYYY-MM-DD
  axisFormat  %d/%m
  section Θεμέλια
  P00 Fork dgsmartbi + καθαρισμός   :p0, 2026-11-02, 2d
  P01 Shell /t/[tenantId] + IA      :p1, after p0, 2d
  P02 Schema Prisma 7 + απομόνωση   :p2, after p0, 3d
  P03 Ρόλοι, Entra ID, εγκρίσεις    :p3, after p2, 2d
  section Σχεδιασμός
  P04 Systems & credential vault    :p4, after p3, 3d
  P05 Workflow DSL package          :p5, after p2, 5d
  P06 Recorder extension            :p6, after p5, 6d
  P07 Recording→Workflow + editor   :p7, after p6, 8d
  section Εκτέλεση
  P08 Engine & worker               :p8, after p5, 8d
  P09 Logs & run viewer             :p9, after p8, 5d
  P07c Ολοκλήρωση, REST & replay    :p7c, after p7, 6d
  P07b Οπτικός καμβάς (React Flow)  :p7b, after p9, 6d
  P09b Live assist (OTP/CAPTCHA)    :p9b, after p7b, 4d
  P10 Collections & public API      :p10, after p9, 5d
  P10b Αρχεία μέσω API              :p10b, after p10, 3d
  P11 Jobs, CSV/XLSX, webhooks      :p11, after p10b, 5d
  P11b Data mapping Excel           :p11b, after p11, 5d
  P11c Αλλαγές & αυτόματη παύση     :p11c, after p11b, 4d
  P11d Εξαγωγή δεδομένων & προορ.   :p11d, after p11c, 6d
  section Ολοκλήρωση
  P12 AI ανάλυση DOM (OpenRouter)   :p12, after p11, 4d
  P13 Τεκμηρίωση & Postman          :p13, after p12, 4d
  section Ολοκλήρωση & pilot
  P14 Dashboard + τιμολόγηση        :p14, after p13, 5d
  P15 Hardening & e2e               :p15, after p14, 5d
  P16 Deploy Coolify                :p16, after p15, 2d
  Pilot WWA (TAXIS, ΟΠΣΚΕ)          :pl, after p16, 15d
  P17 Φάση 3 extras                 :p17, after pl, 10d
```

## Milestones

| Milestone | Περιλαμβάνει | Demo κριτήριο |
|---|---|---|
| **M1 — Θεμέλια** (P00–P03) | Fork dgsmartbi, νέο IA, ρόλοι, Entra ID | Δύο tenants· ο ένας δεν βλέπει δεδομένα του άλλου (tests απομόνωσης πράσινα) |
| **M2 — Πρώτη εκτέλεση** (P04, P05, P08) | Χειρόγραφο JSON workflow εκτελείται στο sandbox | Run με screenshot σε σκόπιμο σφάλμα |
| **M3 — Record to run** (P06, P07, P07c, P07b, P09, P09b) | Καταγραφή → editor/καμβάς → test run → viewer με live κατάσταση βημάτων | Καταγραφή φόρμας sandbox και επιτυχής εκτέλεση σε < 15′ |
| **M4 — API** (P10, P10b, P11, P11b, P11c, P11d) | Μέθοδοι, API keys, αρχεία, batch με data mapping, webhooks, incidents/παύση | Excel WWA (αιτήματα με παραστατικά + ZIP) → runs με report πάνω στο αρχικό αρχείο· αλλαγή στο sandbox → παύση και επανεκκίνηση χωρίς απώλεια |
| **M4b — Νοημοσύνη & τεκμηρίωση** (P12–P13) | OpenRouter στην καταγραφή/διάγνωση, τεκμηρίωση συστημάτων, Postman | Τεκμηρίωση «Sandbox ERP» με στιγμιότυπα + Postman που τρέχει |
| **M5 — Production** (P14–P16) | Dashboard, τιμολόγηση ανά εκτέλεση & πακέτα, hardening, deploy | Pilot WWA σε TAXIS & ΟΠΣΚΕ (docs/18) με πραγματική χρέωση μέσω SoftOne |
| **M6 — Φάση 3** (P17) | Remote recorder, MCP server, προγραμματισμένες εκτελέσεις, visual change detection | |

## Backlog φάσης 3+
- Remote browser recorder (CDP screencast).
- AI locator repair & «περιέγραψε τη ροή με φυσική γλώσσα» μέσω εταιρικού AI gateway.
- MCP server για τις μεθόδους.
- Προγραμματισμένες εκτελέσεις (cron) και triggers από email/αρχεία σε φάκελο Synology.
- Visual regression: σύγκριση screenshot της σελίδας με το baseline της καταγραφής για έγκαιρη ανίχνευση αλλαγών UI.
