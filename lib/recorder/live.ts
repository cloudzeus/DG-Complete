import "server-only";
import { randomBytes } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { installGuard, normalizeOrigins } from "@/lib/engine/guard";
import { toInputKey } from "@/lib/dsl/import/chromeRecorder";
import { newContext } from "@/worker/browser";
import type { CapturedForm } from "@/lib/dsl/graph";
import { getStorage } from "@/lib/storage";
import { candidatesFor, describeInPage, fieldLabel, isPasswordField, rowSelector, type ElementInfo } from "./describe";

// Live recorder inside the app (docs/04 §10): a server-side Chromium shown to the user as images;
// clicks and keys are forwarded, each action becomes a DSL step. Typed values are passed to the page
// only — never stored or logged; fields become {{input.x}} / {{secrets.*}}. One process (embedded
// worker, ADR-025), sessions in memory, closed after 20′ without activity.

export type Step = Record<string, unknown> & { id: string; type: string; label: string };
export type InputDef = { key: string; label: string; type: "string" | "enum" | "array"; enum?: string[]; required: boolean; items?: { key: string; label: string; enum?: string[] }[] };

type Session = {
  id: string;
  tenantId: string;
  userId: string;
  targetId: string;
  baseUrl: string;
  name: string;
  /** Recording into an existing workflow (its draft) instead of a new one. */
  workflowId?: string;
  context: BrowserContext;
  page: Page;
  steps: Step[];
  inputs: InputDef[];
  taken: Set<string>;
  lastActivity: number;
  frame?: { at: number; buf: Buffer };
  forms: Record<string, CapturedForm>;
  allow: (origin: string) => void;
  /** Main-frame navigation the guard stopped (an origin not yet allowed) — offered to the user. */
  blocked?: { origin: string; url: string };
  /** Origins offered to the user in this session — the only ones that may be allowed. */
  offered: Set<string>;
  /** Current page group (p1, p2 …): every step recorded on a page belongs to it (docs/04 §10). */
  cur: string;
  lastUrl: string;
  /** Selectors of repeated row fields: typing into them adds no extra step. */
  rowSelectors: string[];
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

export async function startSession(opts: { tenantId: string; userId: string; targetId: string; baseUrl: string; allowedOrigins: string[]; name: string; workflowId?: string }) {
  if (sessions.size >= MAX_SESSIONS) throw new RecorderError("Υπάρχουν ήδη πολλές ενεργές καταγραφές — δοκιμάστε σε λίγο.");
  const context = await newContext({ viewport: VIEWPORT, locale: "el-GR", timezoneId: "Europe/Athens" });
  const ref: { s?: Session } = {};
  const guard = await installGuard(context, normalizeOrigins(opts.allowedOrigins, opts.baseUrl), (origin, reason, url) => {
    if (ref.s && reason === "origin") {
      ref.s.blocked = { origin, url };
      ref.s.offered.add(origin);
    }
  });
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept().catch(() => undefined));
  const id = randomBytes(12).toString("base64url");
  const session: Session = { id, ...opts, context, page, steps: [], inputs: [], taken: new Set(), lastActivity: Date.now(), forms: {}, allow: guard.allow, offered: new Set(), cur: "", lastUrl: "", rowSelectors: [] };
  ref.s = session;
  sessions.set(id, session);
  await page.goto(opts.baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  await newPage(session);
  push(session, { type: "navigate", label: "Άνοιγμα σελίδας", url: rel(session, page.url()) });
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

function push(s: Session, step: { type: string; label: string; [k: string]: unknown }) {
  const n = s.steps.length + 1;
  s.steps.push({ ...step, id: `s${String(n).padStart(2, "0")}`, form: (step.form as string | undefined) ?? s.cur } as Step);
}

const pageKey = (url: string) => url.split("#")[0];

/** A new page: its own step group, with a masked image and the fields found on it. */
async function newPage(s: Session) {
  const n = Object.keys(s.forms).length + 1;
  s.cur = `p${n}`;
  s.lastUrl = pageKey(s.page.url());
  await settle(s.page);
  const found = ((await s.page.evaluate(describeInPage, { all: true }).catch(() => [])) ?? []) as ElementInfo[];
  const image = await s.page.screenshot({ type: "jpeg", quality: 70, mask: [s.page.locator("input[type=password]")] }).catch(() => null);
  let path: string | undefined;
  if (image) {
    path = `tenants/${s.tenantId}/recordings/${s.id}/${s.cur}.jpg`;
    await (await getStorage()).put(path, image, "image/jpeg").catch(() => (path = undefined));
  }
  s.forms[s.cur] = {
    title: (await s.page.title().catch(() => "")).slice(0, 60) || `Σελίδα ${n}`,
    url: rel(s, s.page.url()),
    image: path,
    fields: found.map((e) => ({ label: fieldLabel(e), type: typeLabel(e), kind: "unmapped", required: e.required, options: e.options?.length })),
  };
}

function typeLabel(e: ElementInfo) {
  if (e.tag === "select") return "λίστα";
  if (e.tag === "textarea") return "κείμενο (πολλές γραμμές)";
  return ({ password: "κωδικός", checkbox: "επιλογή", radio: "επιλογή", email: "email", number: "αριθμός", date: "ημερομηνία", tel: "τηλέφωνο" } as Record<string, string>)[(e.type ?? "").toLowerCase()] ?? "κείμενο";
}

/** After an action: did the page change? Then the next steps belong to a new page group. */
async function afterAction(s: Session) {
  if (pageKey(s.page.url()) !== s.lastUrl) await newPage(s);
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
  | {
      type: "captureApply";
      fields: { css: string; kind: "input" | "username" | "password" | "skip"; repeat?: boolean }[];
      /** Multiple records on the page (e.g. document lines): the repeated fields become a list input. */
      repeat?: { list: string; label?: string; addButtonCss?: string; firstRowExists: boolean };
    }
  | { type: "undo" }
  | { type: "back" };

export type ActionResult = { select?: ElementInfo; fields?: ElementInfo[]; buttons?: ElementInfo[]; message?: string; blocked?: { origin: string; url: string } };

const FIELD_TAGS = new Set(["input", "textarea"]);
const KEYS = new Set(["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " "]);

export async function act(s: Session, a: Action): Promise<ActionResult> {
  s.blocked = undefined;
  const r = await actInner(s, a).catch((err) => {
    if (!s.blocked) throw err;
    return {} as ActionResult;
  });
  if (s.blocked) await s.page.waitForTimeout(100);
  if (!["capture", "captureApply", "undo"].includes(a.type)) await afterAction(s).catch(() => undefined);
  return s.blocked ? { ...r, blocked: s.blocked, message: undefined } : r;
}

/** The user agreed to add `origin` (already saved on the target): allow it and resume the navigation. */
export async function allowAndContinue(s: Session, origin: string, url: string) {
  s.allow(origin);
  s.blocked = undefined;
  await s.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  await afterAction(s).catch(() => undefined);
}

async function actInner(s: Session, a: Action): Promise<ActionResult> {
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
      if (s.rowSelectors.length && (await page.evaluate((sels) => sels.some((q) => document.activeElement?.matches(q)), s.rowSelectors).catch(() => false))) return {};
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
      await afterAction(s); // the navigation opens the new page's group
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
      if (e && !s.steps.some((x) => x.form && sameField(x.locator, e.css))) push(s, { type: "select", label: fieldLabel(e), locator: { candidates: candidatesFor(e) }, by: "label", value: `{{input.${inputFor(s, e, "enum")}}}` });
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
      const buttons = ((await page.evaluate(describeInPage, { buttons: true }).catch(() => [])) ?? []) as ElementInfo[];
      return { fields, buttons };
    }
    case "captureApply": {
      const all = ((await page.evaluate(describeInPage, { all: true }).catch(() => [])) ?? []) as ElementInfo[];
      const formId = s.cur;
      const fields: CapturedForm["fields"] = [];
      const buttons = a.repeat?.addButtonCss ? (((await page.evaluate(describeInPage, { buttons: true }).catch(() => [])) ?? []) as ElementInfo[]) : [];
      const rowFields = a.repeat ? a.fields.filter((f) => f.repeat && f.kind === "input") : [];
      for (const f of a.fields) {
        const e = all.find((x) => x.css === f.css);
        if (!e || f.kind === "skip" || rowFields.includes(f)) continue;
        const locator = { candidates: candidatesFor(e) };
        const base = { label: fieldLabel(e), locator, form: formId };
        let key: string | undefined;
        if (f.kind === "password") push(s, { type: "fill", ...base, value: "{{secrets.password}}" });
        else if (f.kind === "username") push(s, { type: "fill", ...base, value: "{{secrets.username}}" });
        else if (e.tag === "select") push(s, { type: "select", ...base, by: "label", value: `{{input.${(key = inputFor(s, e, "enum"))}}}` });
        else if ((e.type ?? "").toLowerCase() === "checkbox") push(s, { type: "check", ...base, when: `input.${(key = inputFor(s, e))} == true` });
        else push(s, { type: "fill", ...base, value: `{{input.${(key = inputFor(s, e))}}}` });
        fields.push({ label: fieldLabel(e), type: typeLabel(e), key, kind: f.kind, required: e.required, options: e.options?.length });
      }
      if (a.repeat && rowFields.length) {
        // forEach over input.<list>: optional «new line» click, then each field of row <index>.
        const list = a.repeat.list.replace(/[^a-zA-Z0-9_]/g, "") || "lines";
        const taken = new Set<string>();
        const items: NonNullable<InputDef["items"]> = [];
        const inner: Record<string, unknown>[] = [];
        const add = buttons.find((b) => b.css === a.repeat!.addButtonCss);
        if (add) inner.push({ id: "", type: "click", label: `Νέα γραμμή «${(add.text ?? add.ariaLabel ?? "").slice(0, 30)}»`, locator: { candidates: candidatesFor(add) }, ...(a.repeat.firstRowExists ? { when: "lineIndex > 0" } : {}) });
        for (const f of rowFields) {
          const e = all.find((x) => x.css === f.css);
          if (!e) continue;
          const key = toInputKey(fieldLabel(e), taken);
          items.push({ key, label: fieldLabel(e), ...(e.options ? { enum: e.options.map((o) => o.label) } : {}) });
          const sel = rowSelector(e);
          s.rowSelectors.push(sel);
          const locator = { candidates: [{ kind: "css", value: sel }], nth: "{{lineIndex}}" };
          inner.push(e.tag === "select" ? { id: "", type: "select", label: fieldLabel(e), locator, by: "label", value: `{{line.${key}}}` } : { id: "", type: "fill", label: fieldLabel(e), locator, value: `{{line.${key}}}` });
          fields.push({ label: fieldLabel(e), type: typeLabel(e), key: `${list}[].${key}`, kind: "input", required: e.required, options: e.options?.length });
        }
        const listKey = s.inputs.some((i) => i.key === list) ? toInputKey(list, s.taken) : (s.taken.add(list), list);
        s.inputs.push({ key: listKey, label: a.repeat.label || "Γραμμές", type: "array", required: true, items });
        const base = s.steps.length;
        push(s, {
          type: "forEach",
          label: `${a.repeat.label || "Γραμμές"} (πολλαπλές εγγραφές)`,
          items: `input.${listKey} ?? []`,
          as: "line",
          form: formId,
          steps: inner.map((x, k) => ({ ...x, id: `s${String(base + 1).padStart(2, "0")}_${k + 1}` })),
        });
      }
      if (!fields.length) return { message: "Δεν επιλέχθηκε κανένα πεδίο." };
      // Refresh the page image (now with the user's input, passwords masked) and the field mapping.
      const image = await page.screenshot({ type: "jpeg", quality: 70, mask: [page.locator("input[type=password]")] }).catch(() => null);
      const prev = s.forms[formId];
      let path = prev?.image;
      if (image) {
        path = `tenants/${s.tenantId}/recordings/${s.id}/${formId}.jpg`;
        await (await getStorage()).put(path, image, "image/jpeg").catch(() => (path = prev?.image));
      }
      const mapped = new Set(fields.map((f) => f.label));
      s.forms[formId] = { title: prev?.title, url: rel(s, page.url()), image: path, fields: [...fields, ...(prev?.fields ?? []).filter((f) => !mapped.has(f.label) && f.kind === "unmapped")] };
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
