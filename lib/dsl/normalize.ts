// Editor / legacy shapes → the docs/05 shape that schema.ts parses. The editor (P07) still writes a
// simpler form: `goto` with `value` as URL, a locator as one line of text ("label \"ΑΦΜ\"",
// "role button \"Αποθήκευση\"", CSS) or `{ strategy, value }`, `extract.output: "x"`, and the
// inputs/outputs only as JSON Schema on the version. Pure, idempotent: spec input passes unchanged.
import type { LocatorCandidate } from "./schema";

type Raw = Record<string, unknown>;

const unquote = (s: string) => s.trim().replace(/^(["'«])([\s\S]*)(["'»])$/, "$2");

/** One locator line → candidate. Unknown prefixes are CSS. */
export function parseLocatorText(text: string): LocatorCandidate {
  const t = text.trim();
  const role = /^role\s+([a-z]+)(?:\s+(.+))?$/i.exec(t);
  if (role) return { kind: "role", role: role[1].toLowerCase(), ...(role[2] ? { name: unquote(role[2]) } : {}) };
  const m = /^(label|text|testid|test-id|data-testid|placeholder|css|xpath)\s*[:=]?\s+(.+)$/i.exec(t);
  if (m) {
    const k = m[1].toLowerCase();
    const value = unquote(m[2]);
    if (k === "testid" || k === "test-id" || k === "data-testid") return { kind: "testId", value };
    return { kind: k as "label" | "text" | "placeholder" | "css" | "xpath", value };
  }
  if (t.startsWith("//") || t.startsWith("(//")) return { kind: "xpath", value: t };
  return { kind: "css", value: t };
}

function candidate(c: unknown): LocatorCandidate | null {
  if (typeof c === "string") return c.trim() ? parseLocatorText(c) : null;
  if (!c || typeof c !== "object") return null;
  const o = c as Raw;
  if (typeof o.kind === "string") return (o.kind === "testid" ? { ...o, kind: "testId" } : o) as LocatorCandidate;
  if (typeof o.strategy === "string") {
    const s = o.strategy.toLowerCase();
    if (s === "role") return { kind: "role", role: String(o.role ?? ""), ...(o.name ? { name: String(o.name) } : {}) };
    if (s === "testid" || s === "test-id") return { kind: "testId", value: String(o.value ?? "") };
    return { kind: s as "css", value: String(o.value ?? "") };
  }
  return null;
}

export function normalizeLocator(l: unknown): Raw | undefined {
  if (l === undefined || l === null || l === "") return undefined;
  if (typeof l === "object" && Array.isArray((l as Raw).candidates)) {
    const o = l as Raw;
    return { ...o, candidates: (o.candidates as unknown[]).map(candidate).filter(Boolean), ...(o.within ? { within: normalizeLocator(o.within) } : {}) };
  }
  if (typeof l === "string") {
    // Several candidates may be given on separate lines or with « || ».
    const parts = l.split(/\n|\s\|\|\s/).map((p) => p.trim()).filter(Boolean);
    return { candidates: parts.map(parseLocatorText) };
  }
  const c = candidate(l);
  return c ? { candidates: [c] } : undefined;
}

const TYPE_ALIASES: Record<string, string> = { goto: "navigate", type: "fill", input: "fill", wait: "waitFor", screenshotStep: "screenshot" };

export function normalizeStep(s: Raw): Raw {
  const type = TYPE_ALIASES[String(s.type)] ?? String(s.type);
  const out: Raw = { ...s, type, label: s.label ?? "" };
  if ("locator" in s) {
    const loc = normalizeLocator(s.locator);
    if (loc) out.locator = loc;
    else delete out.locator;
  }
  switch (type) {
    case "navigate":
      out.url = s.url ?? s.value ?? "";
      delete out.value;
      break;
    case "waitFor":
      if (!out.locator && !s.url && !s.loadState && s.ms === undefined && s.value !== undefined) {
        const ms = Number(s.value);
        if (Number.isFinite(ms)) out.ms = ms;
        delete out.value;
      }
      break;
    case "extract": {
      const into = (s.into ?? s.output) as string | undefined;
      if (into) out.into = /^(output|vars)\./.test(into) ? into : `output.${into}`;
      delete out.output;
      break;
    }
    case "humanTask":
      out.instructions = s.instructions ?? s.value ?? s.label ?? "";
      break;
    case "assert":
      if (s.expected === undefined && typeof s.value === "string") out.expected = s.value;
      break;
    case "if":
      if (!s.then && Array.isArray(s.steps)) out.then = s.steps;
      if (out.condition === undefined && typeof s.value === "string") out.condition = s.value;
      delete out.steps;
      break;
    case "forEach":
      if (out.items === undefined && typeof s.value === "string") out.items = s.value;
      break;
  }
  if (typeof s.timeout === "number" && out.timeoutMs === undefined) out.timeoutMs = s.timeout;
  for (const key of ["steps", "then", "else"] as const) {
    if (Array.isArray(out[key])) out[key] = (out[key] as Raw[]).map(normalizeStep);
  }
  return out;
}

type JsonSchema = { type?: string; title?: string; format?: string; pattern?: string; enum?: string[]; minimum?: number; maximum?: number; items?: JsonSchema; properties?: Record<string, JsonSchema>; required?: string[]; description?: string; examples?: unknown[]; "x-sensitive"?: boolean };

const SENSITIVE_KEY = /pass|secret|otp|token|pin/i;

function fieldFromSchema(key: string, p: JsonSchema, required: boolean): Raw {
  const type = p.format === "date" ? "date" : p.format === "date-time" ? "datetime" : p.format === "file" ? "file" : p.enum ? "enum" : (p.type ?? "string");
  return {
    key,
    label: p.title ?? key,
    type,
    required,
    sensitive: p["x-sensitive"] ?? SENSITIVE_KEY.test(key),
    ...(p.format && !["date", "date-time", "file"].includes(p.format) ? { format: p.format } : {}),
    ...(p.pattern ? { pattern: p.pattern } : {}),
    ...(p.enum ? { enum: p.enum } : {}),
    ...(p.minimum !== undefined ? { min: p.minimum } : {}),
    ...(p.maximum !== undefined ? { max: p.maximum } : {}),
    ...(p.description ? { description: p.description } : {}),
    ...(p.items ? { items: fieldFromSchema("item", p.items, true) } : {}),
    ...(p.properties ? { properties: Object.entries(p.properties).map(([k, v]) => fieldFromSchema(k, v, (p.required ?? []).includes(k))) } : {}),
  };
}

export function inputsFromSchema(schema: unknown): Raw[] {
  const s = (schema ?? {}) as JsonSchema;
  return Object.entries(s.properties ?? {}).map(([k, p]) => fieldFromSchema(k, p, (s.required ?? []).includes(k)));
}

export function normalizeDefinition(raw: unknown, schemas: { inputSchema?: unknown; outputSchema?: unknown; name?: string } = {}): Raw {
  const d = { ...((raw ?? {}) as Raw) };
  d.dslVersion ??= 1;
  if (!d.name && schemas.name) d.name = schemas.name;
  if (!Array.isArray(d.inputs)) d.inputs = inputsFromSchema(schemas.inputSchema);
  if (!Array.isArray(d.outputs)) {
    const props = ((schemas.outputSchema ?? {}) as JsonSchema).properties ?? {};
    d.outputs = Object.entries(props).map(([key, p]) => ({ key, label: p.title ?? key, type: p.type ?? "string" }));
  }
  d.steps = Array.isArray(d.steps) ? (d.steps as Raw[]).map(normalizeStep) : [];
  if (Array.isArray(d.onError)) d.onError = (d.onError as Raw[]).map(normalizeStep);
  if (d.login && typeof d.login === "object") {
    const login = { ...(d.login as Raw) };
    if (login.sessionCheck) login.sessionCheck = normalizeLocator(login.sessionCheck);
    d.login = login;
  }
  return d;
}
