// Parse + publish checks (docs/05 §5). Returns issues instead of throwing, so the editor can list them.
import { ExprError, refsOf } from "./expr";
import { normalizeDefinition } from "./normalize";
import { STEP_TYPES, WorkflowDefinition, type Locator, type Step } from "./schema";
import { extractRefs, hasTemplate } from "./template";

export type Issue = { severity: "error" | "warning"; stepId?: string; code: string; message: string };

export type ParseResult = { ok: true; def: WorkflowDefinition; issues: Issue[] } | { ok: false; issues: Issue[] };

/** Editor/legacy JSON → validated definition. */
export function parseDefinition(raw: unknown, schemas?: { inputSchema?: unknown; outputSchema?: unknown; name?: string }): ParseResult {
  const normalized = normalizeDefinition(raw, schemas);
  const unknownTypes: Issue[] = [];
  const known = new Set<string>(STEP_TYPES);
  const walk = (steps: unknown) => {
    for (const s of (Array.isArray(steps) ? steps : []) as Record<string, unknown>[]) {
      if (!known.has(String(s.type))) {
        unknownTypes.push({ severity: "error", stepId: String(s.id ?? ""), code: "STEP_TYPE_UNSUPPORTED", message: `Ο τύπος βήματος «${String(s.type)}» δεν υποστηρίζεται ακόμη από τη μηχανή.` });
      }
      walk(s.steps);
      walk(s.then);
      walk(s.else);
    }
  };
  walk(normalized.steps);
  if (unknownTypes.length) return { ok: false, issues: unknownTypes };
  const r = WorkflowDefinition.safeParse(normalized);
  if (!r.success) {
    return {
      ok: false,
      issues: r.error.issues.map((i) => ({ severity: "error" as const, stepId: stepIdAt(normalized, i.path), code: "SCHEMA", message: `${i.path.join(".")}: ${i.message}` })),
    };
  }
  return { ok: true, def: r.data, issues: [] };
}

function stepIdAt(def: Record<string, unknown>, path: PropertyKey[]): string | undefined {
  let cur: unknown = def;
  let id: string | undefined;
  for (const p of path) {
    if (cur && typeof cur === "object") cur = (cur as Record<PropertyKey, unknown>)[p];
    const sid = cur && typeof cur === "object" ? (cur as { id?: unknown }).id : undefined;
    if (typeof sid === "string") id = sid;
  }
  return id;
}

/** Each step with its depth, depth first. */
export function walkSteps(steps: Step[], fn: (s: Step, depth: number, loopVars: string[]) => void, depth = 1, loopVars: string[] = []) {
  for (const s of steps) {
    fn(s, depth, loopVars);
    if (s.type === "forEach") walkSteps(s.steps, fn, depth + 1, [...loopVars, s.as]);
    if (s.type === "if") {
      walkSteps(s.then, fn, depth + 1, loopVars);
      walkSteps(s.else, fn, depth + 1, loopVars);
    }
  }
}

function locatorsOf(s: Step): Locator[] {
  const out: Locator[] = [];
  if ("locator" in s && s.locator) out.push(s.locator);
  if (s.type === "if" && typeof s.condition === "object") out.push(s.condition.exists);
  if (s.type === "humanTask") {
    out.push(...s.allow, ...s.fields.flatMap((f) => (f.fill ? [f.fill] : [])));
    if (s.completeWhen?.visible) out.push(s.completeWhen.visible);
    if (s.completeWhen?.hidden) out.push(s.completeWhen.hidden);
  }
  return out;
}

const ROOTS = new Set(["input", "vars", "output", "secrets", "env"]);

export function validateForPublish(raw: unknown, ctx: { allowedOrigins?: string[]; baseUrl?: string; inputSchema?: unknown; outputSchema?: unknown } = {}): Issue[] {
  const parsed = parseDefinition(raw, ctx);
  if (!parsed.ok) return parsed.issues;
  const def = parsed.def;
  const issues: Issue[] = [];
  const inputs = new Set(def.inputs.map((i) => i.key));
  const usedInputs = new Set<string>();
  const written = new Set<string>();
  const ids = new Map<string, number>();

  const checkRefs = (s: Step, refs: string[], loopVars: string[], field: string) => {
    for (const ref of refs) {
      const [root, key] = ref.split(".");
      if (loopVars.includes(root)) continue;
      if (!ROOTS.has(root)) {
        issues.push({ severity: "error", stepId: s.id, code: "UNKNOWN_REF", message: `Άγνωστη αναφορά «${ref}» (${field}).` });
        continue;
      }
      if (root === "input" && key) {
        usedInputs.add(key);
        if (!inputs.has(key)) issues.push({ severity: "error", stepId: s.id, code: "UNKNOWN_INPUT", message: `Η είσοδος «${key}» δεν υπάρχει.` });
      }
      if (root === "secrets" && !(s.type === "fill" && field === "value")) {
        issues.push({ severity: "error", stepId: s.id, code: "SECRET_OUTSIDE_FILL", message: "Τα secrets.* επιτρέπονται μόνο στην τιμή βήματος «Συμπλήρωση»." });
      }
    }
  };
  const tpl = (s: Step, v: unknown, loopVars: string[], field: string) => {
    if (typeof v !== "string" || !hasTemplate(v)) return;
    try {
      checkRefs(s, extractRefs(v), loopVars, field);
    } catch (err) {
      issues.push({ severity: "error", stepId: s.id, code: "TEMPLATE", message: (err as ExprError).message });
    }
  };
  const expr = (s: Step, v: string, loopVars: string[], field: string) => {
    try {
      checkRefs(s, refsOf(v), loopVars, field);
    } catch (err) {
      issues.push({ severity: "error", stepId: s.id, code: "EXPRESSION", message: (err as ExprError).message });
    }
  };

  const visit = (s: Step, depth: number, loopVars: string[]) => {
    ids.set(s.id, (ids.get(s.id) ?? 0) + 1);
    if (depth > 4) issues.push({ severity: "error", stepId: s.id, code: "NESTING", message: "Βάθος εμφώλευσης πάνω από 4." });
    if (s.when) expr(s, s.when, loopVars, "when");
    for (const [field, v] of Object.entries(s)) if (["value", "url", "expected", "file", "instructions"].includes(field)) tpl(s, v, loopVars, field);
    for (const loc of locatorsOf(s)) {
      for (const c of loc.candidates) tpl(s, "value" in c ? c.value : c.name, loopVars, "locator");
      if (loc.candidates.every((c) => c.kind === "xpath")) {
        issues.push({ severity: "warning", stepId: s.id, code: "XPATH_ONLY", message: "Το στοιχείο βρίσκεται μόνο με XPath — εύθραυστο σε αλλαγές της σελίδας." });
      }
    }
    if (s.type === "humanTask") {
      if (s.mode === "focus" && !s.allow.length && !s.fields.some((f) => f.fill)) {
        issues.push({ severity: "warning", stepId: s.id, code: "HUMAN_NO_TARGET", message: "Η ενέργεια χειριστή δεν ορίζει πεδία (fields με fill) ούτε επιτρεπτά στοιχεία (allow)· ο χειριστής θα μπορεί μόνο να πατήσει «Ολοκληρώθηκε»." });
      }
      for (const f of s.fields) if (!f.fill) issues.push({ severity: "warning", stepId: s.id, code: "HUMAN_FIELD_NO_FILL", message: `Το πεδίο «${f.label ?? f.key}» δεν έχει στοιχείο συμπλήρωσης (fill).` });
    }
    if (s.type === "if" && typeof s.condition === "string") expr(s, s.condition, loopVars, "condition");
    if (s.type === "forEach") expr(s, s.items, loopVars, "items");
    if (s.type === "setVar") {
      expr(s, s.value, loopVars, "value");
      written.add(`vars.${s.name}`);
    }
    if (s.type === "extract" || s.type === "extractTable") written.add(s.into);
    if (s.type === "navigate" && ctx.allowedOrigins?.length && !hasTemplate(s.url)) {
      try {
        const origin = new URL(s.url, ctx.baseUrl ?? "http://relative.invalid").origin;
        if (origin !== "http://relative.invalid" && !ctx.allowedOrigins.includes(origin)) {
          issues.push({ severity: "error", stepId: s.id, code: "ORIGIN_NOT_ALLOWED", message: `Η διεύθυνση ${origin} δεν ανήκει στα επιτρεπτά origins του συστήματος.` });
        }
      } catch {
        issues.push({ severity: "error", stepId: s.id, code: "URL", message: `Μη έγκυρη διεύθυνση «${s.url}».` });
      }
    }
  };
  walkSteps(def.steps, visit);
  walkSteps(def.onError, visit);

  for (const [id, n] of ids) if (n > 1) issues.push({ severity: "error", stepId: id, code: "DUPLICATE_ID", message: `Το id βήματος «${id}» εμφανίζεται ${n} φορές.` });
  for (const o of def.outputs) {
    if (!written.has(`output.${o.key}`)) issues.push({ severity: "error", code: "OUTPUT_NOT_WRITTEN", message: `Η έξοδος «${o.key}» δεν γράφεται από κανένα βήμα «Εξαγωγή».` });
  }
  for (const i of def.inputs) {
    if (i.required && !usedInputs.has(i.key)) issues.push({ severity: "warning", code: "INPUT_UNUSED", message: `Η υποχρεωτική είσοδος «${i.key}» δεν χρησιμοποιείται.` });
  }
  return issues;
}
