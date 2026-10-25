# P05 — Workflow DSL (`lib/dsl`)

## Πλαίσιο
Διάβασε ολόκληρο το `docs/05-workflow-dsl.md` και το `docs/04-recorder.md` §3–§5.

## Στόχος
Καθαρό TypeScript module (χωρίς `server-only`, Prisma ή browser APIs) με schemas, template/expression engine, validators, JSON Schema export και compiler καταγραφών. Το χρησιμοποιούν web, worker και extension.

## Εργασίες
1. `lib/dsl/schemas/`: `LocatorCandidate`, `Locator`, `InputField`, `OutputField`, όλοι οι τύποι `Step` (discriminated union, αναδρομικά για `if`/`forEach`), `WorkflowDefinition`, `RecorderEvent`.
2. `lib/dsl/expr/`: parser με `jsep` + evaluator (whitelist τελεστών)· μπλοκ `__proto__`, `constructor`, `prototype`.
3. `lib/dsl/template/`: `render(str, scope)` με filters trim, upper, lower, default, date (date-fns + el), number (ελληνική μορφή), pad, replace, substr, json, join, greekUpper· `extractRefs()`.
4. `lib/dsl/validators/`: `afmGr`, `iban`, `phoneGr`, `amka` (αν το dgsmartbi έχει ήδη έλεγχο ΑΦΜ, επαναχρησιμοποίησέ τον).
5. `toJsonSchema(inputs)`, `toOutputSchema(outputs)`, `ajvFactory()` με custom formats.
6. `validateForPublish(def, ctx)` → `Issue[]` (docs/05 §5).
7. `canonicalize`, `checksum`, `diffDefinitions`, `detectBreakingChanges`.
8. `compileRecording(events, { targetSystem })` (docs/04 §5) και `import/chromeRecorder.ts`.
9. Vitest ≥ 85% coverage, fixtures καταγραφών με snapshots, security tests για expressions.

- Βήμα `choose` (docs/25 §2): zod schema, `dependsOn` με τοπολογική ταξινόμηση και απόρριψη κύκλων στο `validateDefinition`, κανονικοποίηση `match: normalized` (χωρίς τόνους/πεζά/κενά, καταλήξεις γενικής) ως καθαρή συνάρτηση με tests («ΑΤΤΙΚΗΣ» ≈ «Αττική», αμφισημία → σφάλμα).

## Κριτήρια αποδοχής
- [ ] Tests πράσινα, coverage ≥ 85%.
- [ ] Το παράδειγμα του docs/05 §3 περνά `parse` και `validateForPublish`.
- [ ] `"{{ input.x.constructor }}"` απορρίπτεται.
- [ ] Το `lib/dsl` γίνεται import από το `extension/` χωρίς σφάλματα build.
