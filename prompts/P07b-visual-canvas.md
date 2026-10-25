# P07b — Οπτικός καμβάς ροών (React Flow)

## Πλαίσιο
Διάβασε: `docs/19-visual-workflow-canvas.md` (όλο), `docs/05` (βήματα, ids), `docs/09` §4, `docs/06` §7 (γεγονότα run), `docs/08` (στιγμιότυπα, signed URLs). Προϋπόθεση: P07 (editor με λίστα). Το overlay εκτέλεσης ολοκληρώνεται όταν υπάρχουν P08/P09.

## Στόχος
Ο καμβάς γίνεται η προεπιλεγμένη προβολή της ροής: ο χρήστης βλέπει κάθε βήμα με μικρογραφία οθόνης και δεδομένα, το επεξεργάζεται με εντολές πάνω στο DSL και παρακολουθεί ζωντανά τις εκτελέσεις.

## Εργασίες
1. Εξαρτήσεις: `@xyflow/react@^12`, `elkjs`, `zustand`, `html-to-image`. Το `@xyflow/react/dist/style.css` φορτώνεται μόνο στις σελίδες του καμβά.
2. `lib/dsl/graph.ts`: `toGraph(definition, { collapseForms: true })` → κόμβοι/ακμές όπως ο πίνακας του docs/19 §2 (σύνθετος κόμβος «Φόρμα» για διαδοχικά fill/select/check/upload στην ίδια σελίδα, compound nodes για `forEach`/`if`, ακμές Ναι/Όχι, Είσοδος/Έξοδος). Unit tests με τα παραδείγματα του docs/05 και μία ροή ΟΠΣΚΕ με `forEach`.
3. `lib/dsl/commands.ts`: `insertAfter`, `insertInto(branch|loop)`, `move`, `remove`, `wrapInForEach`, `wrapInIf`, `extractSubflow`, `expandForm`/`collapseForm`, με ιστορικό undo/redo. Κάθε εντολή → `validateDefinition`· αν είναι άκυρη επιστρέφει σφάλμα και δεν αλλάζει τίποτα. Tests.
4. Prisma: μοντέλο `WorkflowLayout` και τιμή `STEP_THUMB` στο `ArtifactKind` (docs/19 §7)· RLS όπως τα υπόλοιπα μοντέλα tenant.
5. `components/workflow-canvas/`: `canvas.tsx` με `mode`, custom nodes (docs/19 §2, με thumbnail, chips τιμών, κονκάρδες locator/σημείου δέσμευσης/warnings), `insert-edge.tsx` («+» πάνω στην ακμή → μενού τύπων βημάτων), `layout.ts` (ELK `layered` σε Web Worker, κρατά μόνο τις χειροκίνητες θέσεις), minimap, zoom controls, «Διάταξη», εξαγωγή PNG/SVG.
6. Editor `/t/[tenantId]/workflows/[id]`: tabs **Καμβάς** (default) | Λίστα | JSON, με κοινή επιλογή βήματος και κοινό inspector. Ο inspector ανοίγει ως Sheet από τον καμβά (`step-sheet.tsx`). Autosave του layout (debounce 1s) στο `WorkflowLayout`.
7. Εσωτερικά API (session, `requireTenant` + δικαιώματα): `GET /api/internal/workflows/[id]/graph?version=`, `PUT …/layout`, `GET …/runs/[runId]/steps`, `GET …/stats?range=7d|30d`.
8. `run-overlay.ts`: σύνδεση στο SSE `run:{id}` (docs/06 §8 — τα γεγονότα αποκτούν `iteration` και `thumbKey`), κατάσταση κόμβων κατά docs/19 §4, follow mode με `setCenter`, μετρητής iterations σε `forEach`, fallback σε `GET …/steps` αν κοπεί το SSE.
9. Modes εκτέλεσης: χρήση του καμβά στο run viewer (`/t/…/runs/[id]`, P09), heatmap στη μαζική εργασία (`/t/…/jobs/[id]`, P11) και tab «Υγεία» στη ροή, με rollup `step_stats_daily` που ενημερώνεται από την εργασία `usage.rollup` του `lib/jobs/registry.ts`. Επίσης diff εκδόσεων στο `/versions` και στις εγκρίσεις.
10. Design: DG tokens (docs/19 §9) — λευκές κάρτες σε canvas, accent γραμμή ανά τύπο, crimson μόνο σε σφάλματα/σημείο δέσμευσης, GSAP μόνο για είσοδο κόμβων, παλμό τρέχοντος βήματος και κεντράρισμα, `prefers-reduced-motion`. Χωρίς gradients/glow.
11. Πληκτρολόγιο και προσβασιμότητα (docs/19 §8), mobile μόνο προβολή.

## Κριτήρια αποδοχής
- [ ] Καταγραφή sandbox → η ροή εμφανίζεται στον καμβά με σωστή σειρά, μικρογραφίες καταγραφής και σύνθετο κόμβο Φόρμας· «Ανάλυση» τον σπάει σε επιμέρους κόμβους.
- [ ] «+» σε ακμή προσθέτει βήμα· drag μέσα σε `forEach` το μετακινεί στο DSL· άκυρη κίνηση (π.χ. βήμα μετά την Έξοδο) απορρίπτεται με μήνυμα. Undo/redo λειτουργούν.
- [ ] Λίστα και καμβάς μένουν συγχρονισμένα (αλλαγή στη μία φαίνεται αμέσως στην άλλη)· το JSON περνά `validateDefinition`.
- [ ] Δοκιμαστική εκτέλεση: οι κόμβοι αλλάζουν κατάσταση ζωντανά, ο καμβάς ακολουθεί το τρέχον βήμα, σε σφάλμα ο κόμβος δείχνει κωδικό και μικρογραφία στιγμιότυπου, και κλικ ανοίγει τα πλήρη στιγμιότυπα/logs του βήματος.
- [ ] Αλλαγή θέσης κόμβου σε PUBLISHED έκδοση αποθηκεύεται χωρίς να αλλάξει το checksum.
- [ ] Heatmap μαζικής εργασίας 100 runs: σωστά ποσοστά αποτυχίας ανά κόμβο.
- [ ] Ροή 300 βημάτων: pan/zoom χωρίς ορατό lag (Chrome performance < 16ms/frame κατά μέσο όρο).
- [ ] Εξαγωγή PNG δίνει το διάγραμμα χωρίς UI controls.

## Μην κάνεις
- Μην αποθηκεύεις ακμές/κόμβους ως δεύτερο ορισμό της ροής — πηγή αλήθειας είναι μόνο το DSL.
- Μην επιτρέψεις ελεύθερες συνδέσεις μεταξύ κόμβων.
- Μην βάζεις thumbnails ως base64 μέσα στο DSL ή στη βάση — μόνο κλειδιά Bunny με signed URLs.
