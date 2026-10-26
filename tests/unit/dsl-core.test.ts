import { describe, expect, it } from "vitest";
import { afmGr, amka, evaluate, iban, parseDefinition, phoneGr, render, renderValue, validateForPublish } from "@/lib/dsl";

const DOCS_EXAMPLE = {
  dslVersion: 1,
  name: "Καταχώριση πελάτη",
  targetSystemSlug: "sandbox-erp",
  login: { mode: "workflow", workflowSlug: "sandbox-login", sessionCheck: { candidates: [{ kind: "testId", value: "user-menu" }] } },
  inputs: [
    { key: "afm", label: "ΑΦΜ", type: "string", format: "afm-gr", example: "094014201" },
    { key: "name", label: "Επωνυμία", type: "string" },
    { key: "city", label: "Πόλη", type: "string", required: false },
    { key: "contacts", label: "Επαφές", type: "array", required: false, items: { key: "contact", label: "Επαφή", type: "object", properties: [{ key: "email", label: "Email", type: "string", format: "email", pii: true }] } },
  ],
  outputs: [{ key: "customerCode", label: "Κωδικός πελάτη", type: "string" }],
  steps: [
    { id: "s01", type: "navigate", label: "Άνοιγμα νέου πελάτη", url: "/customers/new" },
    { id: "s02", type: "fill", label: "ΑΦΜ", locator: { candidates: [{ kind: "label", value: "ΑΦΜ" }, { kind: "css", value: "input[name=afm]" }] }, value: "{{input.afm}}" },
    { id: "s03", type: "fill", label: "Επωνυμία", locator: { candidates: [{ kind: "label", value: "Επωνυμία" }] }, value: "{{input.name | trim | upper}}" },
    { id: "s04", type: "fill", label: "Πόλη", when: "input.city != null", locator: { candidates: [{ kind: "label", value: "Πόλη" }] }, value: "{{input.city}}" },
    { id: "s05", type: "forEach", label: "Επαφές", items: "input.contacts ?? []", as: "c", steps: [
      { id: "s05a", type: "click", label: "Νέα επαφή", locator: { candidates: [{ kind: "role", role: "button", name: "Προσθήκη επαφής" }] } },
      { id: "s05b", type: "fill", label: "Email επαφής", locator: { candidates: [{ kind: "css", value: "[data-row]:last-child input[type=email]" }] }, value: "{{c.email}}" },
    ] },
    { id: "s06", type: "click", label: "Αποθήκευση", locator: { candidates: [{ kind: "role", role: "button", name: "Αποθήκευση" }] } },
    { id: "s07", type: "checkTargetErrors", label: "Έλεγχος" },
    { id: "s08", type: "assert", label: "Επιβεβαίωση", check: "visible", locator: { candidates: [{ kind: "text", value: "Ο πελάτης αποθηκεύτηκε" }] }, errorMessage: "Δεν εμφανίστηκε μήνυμα επιτυχίας" },
    { id: "s09", type: "extract", label: "Κωδικός", from: "text", locator: { candidates: [{ kind: "testId", value: "customer-code" }] }, into: "output.customerCode" },
  ],
};

describe("dsl", () => {
  it("parses and validates the docs/05 §3 example", () => {
    expect(parseDefinition(DOCS_EXAMPLE).ok).toBe(true);
    expect(validateForPublish(DOCS_EXAMPLE).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("rejects prototype access in templates and expressions", () => {
    expect(() => render("{{ input.x.constructor }}", { input: { x: 1 } })).toThrow();
    expect(() => evaluate("input['__proto__']", { input: {} })).toThrow();
    expect(() => evaluate("input.x()", { input: {} })).toThrow();
    const issues = validateForPublish({ ...DOCS_EXAMPLE, steps: [{ id: "a", type: "fill", label: "", locator: "css input", value: "{{ input.afm.constructor }}" }, ...DOCS_EXAMPLE.steps.slice(1)] });
    expect(issues.some((i) => i.code === "TEMPLATE")).toBe(true);
  });

  it("renders filters in Greek format", () => {
    const scope = { input: { name: "  Αθήνα ", amount: 1234.5, d: "2026-10-26", list: ["a", "b"] } };
    expect(render("{{input.name | trim | greekUpper}}", scope)).toBe("ΑΘΗΝΑ");
    expect(render("{{input.amount | number:'0,0.00'}}", scope)).toBe("1.234,50");
    expect(render("{{input.d | date:'dd/MM/yyyy'}}", scope)).toBe("26/10/2026");
    expect(render("{{input.missing | default:'—'}}", scope)).toBe("—");
    expect(render("{{input.list | join:' / '}}", scope)).toBe("a / b");
    expect(renderValue("{{input.list}}", scope)).toEqual(["a", "b"]);
    expect(evaluate("input.amount > 1000 && input.name != null", scope)).toBe(true);
  });

  it("reports unknown inputs, unwritten outputs and secrets outside fill", () => {
    const def = {
      inputs: [{ key: "afm", label: "ΑΦΜ", type: "string" }],
      outputs: [{ key: "code" }],
      steps: [
        { id: "a", type: "navigate", url: "/x?q={{input.nope}}" },
        { id: "b", type: "setVar", name: "s", value: "secrets.password" },
      ],
    };
    const codes = validateForPublish(def).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["UNKNOWN_INPUT", "OUTPUT_NOT_WRITTEN", "SECRET_OUTSIDE_FILL", "INPUT_UNUSED"]));
  });

  it("normalizes the editor's legacy shape", () => {
    const legacy = {
      dslVersion: 1,
      steps: [
        { id: "s1", type: "goto", label: "Φόρμα", value: "/entries/new" },
        { id: "s2", type: "fill", label: "ΑΦΜ", locator: { strategy: "label", value: "ΑΦΜ" }, value: "{{input.afm}}" },
        { id: "s3", type: "click", label: "Αποθήκευση", locator: 'role button "Αποθήκευση"' },
        { id: "s4", type: "extract", label: "Αριθμός", locator: { strategy: "testid", value: "entry-id" }, output: "entryId" },
      ],
    };
    const r = parseDefinition(legacy, { inputSchema: { type: "object", properties: { afm: { type: "string", title: "ΑΦΜ" } }, required: ["afm"] } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.steps[0]).toMatchObject({ type: "navigate", url: "/entries/new" });
    expect(r.def.steps[2]).toMatchObject({ locator: { candidates: [{ kind: "role", role: "button", name: "Αποθήκευση" }] } });
    expect(r.def.steps[3]).toMatchObject({ into: "output.entryId", locator: { candidates: [{ kind: "testId", value: "entry-id" }] } });
    expect(r.def.inputs[0]).toMatchObject({ key: "afm", required: true });
  });

  it("flags step types the engine does not support yet", () => {
    const r = parseDefinition({ steps: [{ id: "x", type: "extractTable" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].code).toBe("STEP_TYPE_UNSUPPORTED");
  });

  it("validates Greek formats", () => {
    expect(afmGr("094014201")).toBe(true);
    expect(afmGr("094014202")).toBe(false);
    expect(iban("GR16 0110 1250 0000 0001 2300 695")).toBe(true);
    expect(iban("GR16 0110 1250 0000 0001 2300 696")).toBe(false);
    expect(phoneGr("+30 6912345678")).toBe(true);
    expect(phoneGr("12345")).toBe(false);
    expect(amka("01017512345")).toBe(false);
  });
});
