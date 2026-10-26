import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { parseDefinition } from "@/lib/dsl";
import { EngineError, Interpreter, installGuard, type StepResult } from "@/lib/engine";

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;
let sandbox: ChildProcess;
let browser: Browser;

beforeAll(async () => {
  sandbox = spawn("npx", ["tsx", "sandbox/server.ts"], { env: { ...process.env, SANDBOX_PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${BASE}/health`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  // CHROMIUM_PATH: a preinstalled Chromium when it differs from the Playwright build (CI images).
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});

afterAll(async () => {
  await browser?.close();
  sandbox?.kill();
});

const LOGIN = [
  { id: "l1", type: "goto", label: "Σύνδεση", value: "/login" },
  { id: "l2", type: "fill", label: "Χρήστης", locator: 'label "Όνομα χρήστη"', value: "{{secrets.username}}" },
  { id: "l3", type: "fill", label: "Κωδικός", locator: 'label "Κωδικός"', value: "{{secrets.password}}" },
  { id: "l4", type: "click", label: "Είσοδος", locator: 'role button "Είσοδος"' },
];

async function run(steps: unknown[], input: Record<string, unknown>, opts: { allowed?: string[] } = {}) {
  const parsed = parseDefinition({ steps, outputs: [{ key: "entryId" }] }, { inputSchema: { type: "object", properties: { afm: { type: "string" }, name: { type: "string" } } } });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const context = await browser.newContext({ locale: "el-GR" });
  const blocked: string[] = [];
  await installGuard(context, opts.allowed ?? [BASE], (u) => blocked.push(u));
  const page = await context.newPage();
  const results: StepResult[] = [];
  const errors: string[] = [];
  const it = new Interpreter(parsed.def, {
    page,
    input,
    secrets: { username: "demo", password: "demo1234" },
    baseUrl: BASE,
    errorDetectors: [{ name: "Σφάλμα φόρμας", css: ".error" }],
    hooks: { onStepEnd: (r) => void results.push(r), onStepError: async (_e, err) => void errors.push(err.code) },
  });
  try {
    return { out: await it.run(), results, errors, blocked };
  } catch (err) {
    return { err: err as EngineError, results, errors, blocked };
  } finally {
    await context.close();
  }
}

describe("interpreter (sandbox)", () => {
  it("logs in, fills the form and extracts the entry id; masks secrets", async () => {
    const r = await run(
      [
        ...LOGIN,
        { id: "s2", type: "fill", label: "ΑΦΜ", locator: { strategy: "label", value: "ΑΦΜ" }, value: "{{input.afm}}" },
        { id: "s3", type: "fill", label: "Επωνυμία", locator: 'label "Επωνυμία"', value: "{{input.name | upper}}" },
        { id: "s5", type: "click", label: "Αποθήκευση", locator: 'role button "Αποθήκευση"' },
        { id: "s5b", type: "checkTargetErrors", label: "Έλεγχος" },
        { id: "s6", type: "extract", label: "Αριθμός", locator: "testid entry-id", output: "entryId", regex: "(\\d+)" },
      ],
      { afm: "094014201", name: "Δοκιμή" },
    );
    expect(r.err).toBeUndefined();
    expect(r.out?.output.entryId).toMatch(/^\d{6}$/);
    expect(r.results.find((x) => x.step.id === "l3")?.valuePreview).toBe("••••");
    expect(r.results.every((x) => x.status === "SUCCEEDED")).toBe(true);
  });

  it("invalid ΑΦΜ → E_TARGET_VALIDATION with the system message", async () => {
    const r = await run(
      [...LOGIN, { id: "s2", type: "fill", label: "ΑΦΜ", locator: 'label "ΑΦΜ"', value: "{{input.afm}}" }, { id: "s5", type: "click", label: "Αποθήκευση", locator: 'role button "Αποθήκευση"' }, { id: "s6", type: "checkTargetErrors", label: "Έλεγχος" }],
      { afm: "12" },
    );
    expect(r.err?.code).toBe("E_TARGET_VALIDATION");
    expect(r.err?.extra.targetMessage).toBe("Μη έγκυρο ΑΦΜ");
    expect(r.errors).toEqual(["E_TARGET_VALIDATION"]);
  });

  it("falls back to the second candidate and reports a missing element", async () => {
    const ok = await run([...LOGIN, { id: "s2", type: "fill", label: "ΑΦΜ", locator: "css #nope || label \"ΑΦΜ\"", value: "1" }], {});
    expect(ok.err).toBeUndefined();
    expect(ok.results.find((x) => x.step.id === "s2")?.fallback).toBe(true);
    const missing = await run([...LOGIN, { id: "s2", type: "click", label: "Χ", locator: "css #nope", timeoutMs: 1500 }], {});
    expect(missing.err?.code).toBe("E_LOCATOR_NOT_FOUND");
  });

  it("blocks navigation outside the allowed origins", async () => {
    const r = await run([{ id: "n", type: "navigate", url: "http://127.0.0.1:9/" }], {});
    expect(r.err?.code).toBe("E_NAVIGATION");
    expect(r.blocked.length).toBeGreaterThan(0);
  });
});
