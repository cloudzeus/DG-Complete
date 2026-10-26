import "server-only";
import { randomBytes } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { installGuard, normalizeOrigins } from "@/lib/engine/guard";
import { toInputKey } from "@/lib/dsl/import/chromeRecorder";
import { newContext } from "@/worker/browser";
import type { CapturedForm } from "@/lib/dsl/graph";
import { getStorage } from "@/lib/storage";
import { candidatesFor, describeInPage, fieldLabel, isPasswordField, type ElementInfo } from "./describe";

// Live recorder inside the app (docs/04 §10): a server-side Chromium shown to the user as images;
// clicks and keys are forwarded, each action becomes a DSL step. Typed values are passed to the page
// only — never stored or logged; fields become {{input.x}} / {{secrets.*}}. One process (embedded
// worker, ADR-025), sessions in memory, closed after 20′ without activity.

export type Step = Record<string, unknown> & { id: string; type: string; label: string };
export type InputDef = { key: string; label: string; type: "string" | "enum"; enum?: string[]; required: boolean };

type Session = {
  id: string;
  tenantId: string;
  userId: string;
  targetId: string;
  baseUrl: string;
  name: string;
  context: BrowserContext;
  page: Page;
  steps: Step[];
  inputs: InputDef[];
  taken: Set<string>;
  lastActivity: number;
  frame?: { at: number; buf: Buffer };
  forms: Record<string, CapturedForm>;
};

export const VIEWPORT = { width: 1280, height: 800 };
const MAX_SESSIONS = 6;
const IDLE_MS = 20 * 60_000;

const g = globalThis as unknown as { __dgRec?: Map<string, Session>; __dgRecSweep?: ReturnType<typeof setInterval> };
const sessions: Map<string, Session> = (g.__dgRec ??= new Map<string, Session>());
g.__dgRecSweep ??= setInterval(() => {
  for (const s of sessions.values()) if (Date.now() - s.lastActivity > IDLE_MS) void closeSession(s.id);
}, 60_000);

export class RecorderError extends Error {}

export async function startSession(opts: { tenantId: string; userId: string; targetId: string; baseUrl: string; allowedOrigins: string[]; name: string }) {
  if (sessions.size >= MAX_SESSIONS) throw new RecorderError("Υπάρχουν ήδη πολλές ενεργές καταγραφές — δοκιμάστε σε λίγο.");
  const context = await newContext({ viewport: VIEWPORT, locale: "el-GR", timezoneId: "Europe/Athens" });
  await installGuard(context, normalizeOrigins(opts.allowedOrigins, opts.baseUrl), () => undefined);
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept().catch(() => undefined));
  const id = randomBytes(12).toString("base64url");
  const s: Session = { id, ...opts, context, page, steps: [], inputs: [], taken: new Set(), lastActivity: Date.now(), forms: {} };
  sessions.set(id, s);
  await page.goto(opts.baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  push(s, { type: "navigate", label: "Άνοιγμα σελίδας", url: rel(s, page.url()) });
  return id;
}

export function getSession(id: string, tenantId: string, userId: string) {
  const s = sessions.get(id);
  if (!s || s.tenantId !== tenantId || s.userId !== userId) return null;
  s.lastActivity = Date.now();
  return s;
}

export async function closeSession(id: string) {
  const s = sessions.get(id);
  sessions.delete(id);
  await s?.context.close().catch(() => undefined);
}

function rel(s: Session, url: string) {
  try {
    const u = new URL(url);
    return u.origin === new URL(s.baseUrl).origin ? `${u.pathname}${u.search}` || "/" : url;
  } catch {
    return url;
  }
}

function push(s: Session, step: Omit<Step, "id">) {
  const n = s.steps.length + 1;
  s.steps.push({ id: `s${String(n).padStart(2, "0")}`, ...step } as Step);
}

const sameField = (a: unknown, css: string) => (a as { candidates?: { kind: string; value?: string }[] } | undefined)?.candidates?.some((c) => c.kind === "css" && c.value === css);

function inputFor(s: Session, e: ElementInfo, kind: "input" | "enum" = "input") {
  const label = fieldLabel(e);
  const existing = s.inputs.find((i) => i.label === label);
  if (existing) return existing.key;
  const key = toInputKey(label, s.taken);
  s.inputs.push({ key, label, type: kind === "enum" ? "enum" : "string", ...(kind === "enum" && e.options ? { enum: e.options.map((o) => o.label) } : {}), required: true });
  return key;
}

/** fill step for a field: password → secrets.password (and the field before it → secrets.username). */
function fillStep(s: Session, e: ElementInfo) {
  const locator = { candidates: candidatesFor(e) };
  if (isPasswordField(e)) {
    const prev = [...s.steps].reverse().find((x) => x.type === "fill");
    if (prev && typeof prev.value === "string" && prev.value.startsWith("{{input.")) {
      const key = prev.value.slice(8, -2);
      prev.value = "{{secrets.username}}";
      s.inputs = s.inputs.filter((i) => i.key !== key);
    }
    return { type: "fill", label: fieldLabel(e), locator, value: "{{secrets.password}}" };
  }
  return { type: "fill", label: fieldLabel(e), locator, value: `{{input.${inputFor(s, e)}}}` };
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function describe(page: Page, arg: { x?: number; y?: number; active?: boolean }) {
  return (await page.evaluate(describeInPage, arg).catch(() => null)) as ElementInfo | null;
}

export type Action =
  | { type: "click"; x: number; y: number }
  | { type: "text"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; dy: number }
  | { type: "navigate"; url: string }
  | { type: "select"; css: string; value: string }
  | { type: "extract"; x: number; y: number; key: string; label?: string }
  | { type: "capture" }
  | { type: "captureApply"; fields: { css: string; kind: "input" | "username" | "password" | "skip" }[] }
  | { type: "undo" }
  | { type: "back" };

export type ActionResult = { select?: ElementInfo; fields?: ElementInfo[]; message?: string };

const FIELD_TAGS = new Set(["input", "textarea"]);
const KEYS = new Set(["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " "]);

export async function act(s: Session, a: Action): Promise<ActionResult> {
  const page = s.page;
  switch (a.type) {
    case "click": {
      const e = await describe(page, a);
      if (e?.tag === "select") return { select: e };
      await page.mouse.click(a.x, a.y);
      if (!e) return {};
      const type = (e.type ?? "").toLowerCase();
      if (FIELD_TAGS.has(e.tag) && !["checkbox", "radio", "submit", "button"].includes(type)) return {}; // focus only
      const locator = { candidates: candidatesFor(e) };
      if (type === "checkbox" || type === "radio") push(s, { type: "check", label: fieldLabel(e), locator });
      else push(s, { type: "click", label: `Κλικ «${(e.ariaLabel ?? e.text ?? fieldLabel(e)).slice(0, 40)}»`, locator });
      await settle(page);
      return {};
    }
    case "text": {
      const e = await describe(page, { active: true });
      await page.keyboard.type(a.text);
      if (!e || !FIELD_TAGS.has(e.tag)) return {};
      const last = s.steps[s.steps.length - 1];
      if (last?.type === "fill" && sameField(last.locator, e.css)) return {};
      // Already a step of a captured form: typing only fills the page so the user can go on.
      if (s.steps.some((x) => x.form && sameField(x.locator, e.css))) return {};
      push(s, fillStep(s, e));
      return {};
    }
    case "key": {
      if (!KEYS.has(a.key)) return {};
      await page.keyboard.press(a.key);
      if (a.key === "Enter") {
        push(s, { type: "press", label: "Πλήκτρο Enter", key: "Enter" });
        await settle(page);
      }
      return {};
    }
    case "scroll":
      await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, a.dy)));
      return {};
    case "navigate": {
      const url = /^https?:\/\//.test(a.url) ? a.url : new URL(a.url, s.baseUrl).toString();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      push(s, { type: "navigate", label: "Πλοήγηση", url: rel(s, page.url()) });
      return {};
    }
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
      return {};
    case "select": {
      const el = page.locator(a.css).first();
      const e = (await el.evaluate((n) => (n as HTMLElement).getBoundingClientRect()).then(async (r) => describe(page, { x: r.x + 2, y: r.y + 2 })).catch(() => null)) as ElementInfo | null;
      const chosen = await el.selectOption(a.value);
      if (e) push(s, { type: "select", label: fieldLabel(e), locator: { candidates: candidatesFor(e) }, by: "label", value: `{{input.${inputFor(s, e, "enum")}}}` });
      return { message: chosen.length ? undefined : "Η επιλογή δεν βρέθηκε." };
    }
    case "extract": {
      const e = await describe(page, a);
      if (!e) return { message: "Δεν βρέθηκε στοιχείο σε αυτό το σημείο." };
      const key = a.key.replace(/[^a-zA-Z0-9_]/g, "") || "result";
      push(s, { type: "extract", label: a.label || `Εξαγωγή ${key}`, locator: { candidates: candidatesFor(e) }, from: FIELD_TAGS.has(e.tag) ? "value" : "text", into: `output.${key}` });
      return { message: `Το «${(e.text ?? fieldLabel(e)).slice(0, 40)}» θα επιστρέφεται ως ${key}.` };
    }
    case "capture": {
      const fields = ((await page.evaluate(describeInPage, { all: true }).catch(() => [])) ?? []) as ElementInfo[];
      return { fields };
    }
    case "captureApply": {
      const all = ((await page.evaluate(describeInPage, { all: true }).catch(() => [])) ?? []) as ElementInfo[];
      const formId = `f${Object.keys(s.forms).length + 1}`;
      const fields: CapturedForm["fields"] = [];
      for (const f of a.fields) {
        const e = all.find((x) => x.css === f.css);
        if (!e || f.kind === "skip") continue;
        const locator = { candidates: candidatesFor(e) };
        const base = { label: fieldLabel(e), locator, form: formId };
        let key: string | undefined;
        if (f.kind === "password") push(s, { type: "fill", ...base, value: "{{secrets.password}}" });
        else if (f.kind === "username") push(s, { type: "fill", ...base, value: "{{secrets.username}}" });
        else if (e.tag === "select") push(s, { type: "select", ...base, by: "label", value: `{{input.${(key = inputFor(s, e, "enum"))}}}` });
        else if ((e.type ?? "").toLowerCase() === "checkbox") push(s, { type: "check", ...base, when: `input.${(key = inputFor(s, e))} == true` });
        else push(s, { type: "fill", ...base, value: `{{input.${(key = inputFor(s, e))}}}` });
        fields.push({ label: fieldLabel(e), type: e.tag === "select" ? "λίστα" : e.tag === "textarea" ? "κείμενο (πολλές γραμμές)" : ({ password: "κωδικός", checkbox: "επιλογή", email: "email", number: "αριθμός", date: "ημερομηνία", tel: "τηλέφωνο" } as Record<string, string>)[(e.type ?? "").toLowerCase()] ?? "κείμενο", key, kind: f.kind, required: e.required, options: e.options?.length });
      }
      if (!fields.length) return { message: "Δεν επιλέχθηκε κανένα πεδίο." };
      // Image of the page at capture time (password fields masked) for the canvas node.
      const image = await page.screenshot({ type: "jpeg", quality: 70, mask: [page.locator("input[type=password]")] }).catch(() => null);
      let path: string | undefined;
      if (image) {
        path = `tenants/${s.tenantId}/recordings/${s.id}/${formId}.jpg`;
        await (await getStorage()).put(path, image, "image/jpeg").catch(() => (path = undefined));
      }
      s.forms[formId] = { title: (await page.title().catch(() => "")).slice(0, 60) || undefined, url: rel(s, page.url()), image: path, fields };
      return { message: `Η φόρμα καταγράφηκε με ${fields.length} πεδία.` };
    }
    case "undo": {
      const removed = s.steps.pop();
      // Drop inputs no longer used.
      const used = JSON.stringify(s.steps);
      s.inputs = s.inputs.filter((i) => used.includes(`input.${i.key}`));
      return { message: removed ? `Αφαιρέθηκε: ${removed.label}` : undefined };
    }
  }
}

export async function frame(s: Session): Promise<Buffer> {
  if (s.frame && Date.now() - s.frame.at < 200) return s.frame.buf;
  const buf = await s.page.screenshot({ type: "jpeg", quality: 60, timeout: 10_000 });
  s.frame = { at: Date.now(), buf };
  return buf;
}

export function snapshot(s: Session) {
  return { id: s.id, name: s.name, url: s.page.url(), steps: s.steps, inputs: s.inputs, forms: s.forms, viewport: VIEWPORT };
}
