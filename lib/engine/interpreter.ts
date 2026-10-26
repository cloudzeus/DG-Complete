// Step interpreter (docs/05 §3, docs/06 §3). Runs a parsed WorkflowDefinition on a Playwright page.
// Knows nothing about the database or storage: the worker passes hooks for steps, logs and artifacts.
import type { Dialog, Locator as PwLocator, Page } from "playwright";
import { evaluate, type Scope } from "@/lib/dsl/expr";
import { render, renderValue } from "@/lib/dsl/template";
import type { Locator, Step, WorkflowDefinition } from "@/lib/dsl/schema";
import { EngineError, classify, type ErrorCode } from "./errors";
import { describe, resolveLocator, toPlaywright } from "./locator";

export type StepStatus = "SUCCEEDED" | "FAILED" | "SKIPPED";

export type StepEvent = {
  step: Step;
  path: string; // "s05[2].s05b"
  seq: number;
  iteration?: number;
};

export type StepResult = StepEvent & {
  status: StepStatus;
  durationMs: number;
  attempt: number;
  locatorUsed?: unknown;
  fallback?: boolean;
  valuePreview?: string;
  pageUrl?: string;
  errorCode?: ErrorCode;
  message?: string;
};

export type ErrorDetector = { name?: string; css: string; kind?: "error" | "duplicate" | "success" };

export type Hooks = {
  onStepStart?(e: StepEvent): Promise<void> | void;
  onStepEnd?(r: StepResult): Promise<void> | void;
  log?(level: "DEBUG" | "INFO" | "WARN" | "ERROR", message: string, data?: Record<string, unknown>, stepId?: string): void;
  /** Called once for the failing step, before the error propagates (screenshots, DOM …). */
  onStepError?(e: StepEvent, err: EngineError, ctx: { page: Page; element?: PwLocator; sensitive: PwLocator[] }): Promise<void>;
  /** Explicit `screenshot` step. */
  onScreenshot?(e: StepEvent, ctx: { page: Page; name: string; fullPage: boolean; sensitive: PwLocator[] }): Promise<void>;
  isCancelled?(): boolean;
};

export type RunOptions = {
  page: Page;
  input: Record<string, unknown>;
  secrets?: Record<string, string>;
  baseUrl: string;
  env?: Record<string, unknown>;
  errorDetectors?: ErrorDetector[];
  hooks?: Hooks;
  /** Numbering continues after an earlier interpreter on the same run (login flow). */
  seqStart?: number;
  /** Prefix of step paths, e.g. "login". */
  pathPrefix?: string;
};

export type RunResult = { output: Record<string, unknown>; vars: Record<string, unknown>; committed: boolean };

const SENSITIVE_KEY = /pass|secret|otp|token|pin|iban|card/i;
const CAPTCHA = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha';

export class Interpreter {
  private seq = 0;
  private output: Record<string, unknown> = {};
  private vars: Record<string, unknown>;
  private sensitive: PwLocator[] = [];
  private pendingDialog: { action: "accept" | "dismiss"; promptText?: string } | null = null;
  private committed = false;
  private sensitiveInputs: Set<string>;
  private page: Page;

  constructor(
    private def: WorkflowDefinition,
    private opts: RunOptions,
  ) {
    this.vars = { ...def.vars };
    this.seq = opts.seqStart ?? 0;
    this.page = opts.page;
    this.sensitiveInputs = new Set(def.inputs.filter((i) => i.sensitive || SENSITIVE_KEY.test(i.key)).map((i) => i.key));
    this.page.on("dialog", (d) => void this.handleDialog(d));
  }

  private async handleDialog(d: Dialog) {
    const plan = this.pendingDialog ?? { action: "dismiss" as const };
    this.pendingDialog = null;
    this.opts.hooks?.log?.("INFO", `Παράθυρο διαλόγου (${d.type()}): ${d.message().slice(0, 200)}`, { action: plan.action });
    if (plan.action === "accept") await d.accept(plan.promptText);
    else await d.dismiss();
  }

  private scope(extra: Scope = {}): Scope {
    return { input: this.opts.input, vars: this.vars, output: this.output, env: this.opts.env ?? {}, ...extra };
  }

  async run(): Promise<RunResult> {
    this.page.setDefaultTimeout(this.def.settings.defaultTimeoutMs);
    this.page.setDefaultNavigationTimeout(this.def.settings.navigationTimeoutMs);
    try {
      await this.runSteps(this.def.steps, this.opts.pathPrefix ?? "", {});
    } catch (err) {
      if (this.def.onError.length) {
        try {
          await this.runSteps(this.def.onError, "onError", {});
        } catch {
          // best effort (docs/05 §1)
        }
      }
      throw err;
    }
    return { output: this.output, vars: this.vars, committed: this.committed };
  }

  /** Current page (switchTab may have moved to another tab). */
  get currentPage() {
    return this.page;
  }

  /** Fields that received a sensitive value (for screenshot masks). */
  get sensitiveLocators() {
    return this.sensitive;
  }

  /** A sensitive value (secret / sensitive input) was typed — traces must not be kept. */
  get filledSensitive() {
    return this.sensitive.length > 0;
  }

  /** Last step number used (for a following interpreter on the same run). */
  get lastSeq() {
    return this.seq;
  }

  /** Was a commitPoint step completed before the failure (docs/06 §5)? */
  get mayHaveCommitted() {
    return this.committed;
  }

  private async runSteps(steps: Step[], prefix: string, loop: Scope, iteration?: number) {
    for (const step of steps) {
      if (this.opts.hooks?.isCancelled?.()) throw new EngineError("E_CANCELLED", "Η εκτέλεση ακυρώθηκε.");
      await this.runStep(step, prefix ? `${prefix}.${step.id}` : step.id, loop, iteration);
    }
  }

  private async runStep(step: Step, path: string, loop: Scope, iteration?: number) {
    const ev: StepEvent = { step, path, seq: ++this.seq, iteration };
    const started = Date.now();
    const scope = this.scope(loop);
    const end = (r: Partial<StepResult> & { status: StepStatus }, attempt = 1) =>
      this.opts.hooks?.onStepEnd?.({ ...ev, attempt, durationMs: Date.now() - started, pageUrl: this.safeUrl(), ...r });

    if (step.when !== undefined && !evaluate(step.when, scope)) {
      await end({ status: "SKIPPED", message: "Η συνθήκη «when» δεν ισχύει." });
      return;
    }
    await this.opts.hooks?.onStepStart?.(ev);

    const attempts = step.retry?.attempts ?? 1;
    for (let attempt = 1; ; attempt++) {
      let element: PwLocator | undefined;
      try {
        const info = await this.exec(step, path, scope, loop, (l) => (element = l));
        if (step.commitPoint) this.committed = true;
        if (step.type !== "if" && step.type !== "forEach") await this.captchaCheck();
        await end({ status: "SUCCEEDED", ...info }, attempt);
        return;
      } catch (raw) {
        let err = classify(raw);
        if (err.code === "E_CANCELLED") throw err;
        // The element is missing because the system showed an error? Report the system's message.
        if (["E_LOCATOR_NOT_FOUND", "E_TIMEOUT", "E_ASSERTION_FAILED", "E_ELEMENT_NOT_ACTIONABLE"].includes(err.code)) {
          const target = await this.checkTargetErrors().then(() => null, (e: unknown) => (e instanceof EngineError ? e : null));
          if (target) err = target;
        }
        if (attempt < attempts && err.retryable) {
          this.opts.hooks?.log?.("WARN", `Νέα προσπάθεια βήματος (${attempt + 1}/${attempts}): ${err.message}`, { code: err.code }, step.id);
          await this.page.waitForTimeout(step.retry?.delayMs ?? 1000);
          continue;
        }
        if (step.optional && err.code !== "E_CAPTCHA_DETECTED" && err.code !== "E_TARGET_VALIDATION") {
          this.opts.hooks?.log?.("WARN", `Προαιρετικό βήμα παραλείφθηκε: ${err.message}`, { code: err.code }, step.id);
          await end({ status: "SKIPPED", errorCode: err.code, message: err.message }, attempt);
          return;
        }
        // Container steps already reported the failing child.
        if (step.type !== "if" && step.type !== "forEach") {
          err.extra.stepId ??= step.id;
          try {
            await this.opts.hooks?.onStepError?.(ev, err, { page: this.page, element, sensitive: this.sensitive });
          } catch (artifactErr) {
            this.opts.hooks?.log?.("WARN", `Τα στιγμιότυπα σφάλματος δεν αποθηκεύτηκαν: ${(artifactErr as Error).message}`, undefined, step.id);
          }
        }
        await end({ status: "FAILED", errorCode: err.code, message: err.message }, attempt);
        throw err;
      }
    }
  }

  private safeUrl() {
    try {
      return this.page.url();
    } catch {
      return undefined;
    }
  }

  private timeout(step: Step) {
    return step.timeoutMs ?? this.def.settings.defaultTimeoutMs;
  }

  private async locate(step: Step, loc: Locator, scope: Scope, set: (l: PwLocator) => void) {
    const r = await resolveLocator(this.page, loc, { timeoutMs: this.timeout(step), render: (s) => render(s, scope) });
    set(r.handle);
    if (r.index > 0) {
      this.opts.hooks?.log?.("WARN", `LOCATOR_FALLBACK: χρησιμοποιήθηκε ο εναλλακτικός επιλογέας ${describe(r.used)}`, { index: r.index }, step.id);
    }
    return { handle: r.handle, info: { locatorUsed: r.used, fallback: r.index > 0 } };
  }

  /** Masked preview of a value for RunStep / logs. */
  private preview(template: string, value: string) {
    const refsSensitive = /\{\{\s*secrets\./.test(template) || [...this.sensitiveInputs].some((k) => new RegExp(`\\{\\{[^}]*input\\.${k}\\b`).test(template));
    if (refsSensitive) return "••••";
    return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  }

  private resolveUrl(raw: string) {
    return new URL(raw, this.opts.baseUrl.endsWith("/") ? this.opts.baseUrl : `${this.opts.baseUrl}/`).toString();
  }

  private async exec(step: Step, path: string, scope: Scope, loop: Scope, set: (l: PwLocator) => void): Promise<Partial<StepResult>> {
    const t = this.timeout(step);
    const tpl = (s: string) => render(s, scope);
    const fillScope = { ...scope, secrets: this.opts.secrets ?? {} };

    switch (step.type) {
      case "navigate": {
        const url = this.resolveUrl(tpl(step.url));
        const res = await this.page.goto(url, { timeout: step.timeoutMs ?? this.def.settings.navigationTimeoutMs, waitUntil: "domcontentloaded" });
        if (res && res.status() >= 500) throw new EngineError("E_NAVIGATION", `Το σύστημα απάντησε HTTP ${res.status()}.`);
        return { valuePreview: url };
      }
      case "click": {
        const { handle, info } = await this.locate(step, step.locator, scope, set);
        const nav = step.waitForNavigation ? this.page.waitForEvent("framenavigated", { timeout: t }) : null;
        await handle.click({ timeout: t, button: step.button, clickCount: step.clickCount });
        if (nav) await nav;
        return info;
      }
      case "fill": {
        const { handle, info } = await this.locate(step, step.locator, scope, set);
        const value = render(step.value, fillScope);
        const masked = this.preview(step.value, value);
        if (masked === "••••") this.sensitive.push(handle);
        if (step.typeDelayMs) {
          if (step.clear) await handle.fill("", { timeout: t });
          await handle.pressSequentially(value, { delay: step.typeDelayMs, timeout: t });
        } else if (step.clear) await handle.fill(value, { timeout: t });
        else await handle.pressSequentially(value, { timeout: t });
        if (step.pressAfter) await handle.press(step.pressAfter, { timeout: t });
        return { ...info, valuePreview: masked };
      }
      case "select": {
        const { handle, info } = await this.locate(step, step.locator, scope, set);
        const value = tpl(step.value);
        await handle.selectOption(step.by === "value" ? { value } : { label: value }, { timeout: t });
        return { ...info, valuePreview: value };
      }
      case "check":
      case "uncheck": {
        const { handle, info } = await this.locate(step, step.locator, scope, set);
        await handle.setChecked(step.type === "check", { timeout: t });
        return info;
      }
      case "press": {
        if (step.locator) {
          const { handle, info } = await this.locate(step, step.locator, scope, set);
          await handle.press(step.key, { timeout: t });
          return info;
        }
        await this.page.keyboard.press(step.key);
        return { valuePreview: step.key };
      }
      case "upload": {
        const { handle, info } = await this.locate(step, step.locator, scope, set);
        const file = renderValue(step.file, scope) as { name?: string; mimeType?: string; buffer?: Buffer } | string | undefined;
        if (!file || typeof file === "string" || !file.buffer) throw new EngineError("E_INPUT_VALIDATION", "Δεν δόθηκε αρχείο για ανέβασμα.");
        await handle.setInputFiles({ name: file.name ?? "file", mimeType: file.mimeType ?? "application/octet-stream", buffer: file.buffer }, { timeout: t });
        return { ...info, valuePreview: file.name };
      }
      case "waitFor": {
        if (step.locator) {
          const { handle, info } = await this.locate(step, step.locator, scope, set).catch((e) => {
            if (step.state === "hidden" || step.state === "detached") return { handle: null, info: {} };
            throw e;
          });
          if (handle) await handle.waitFor({ state: step.state, timeout: t });
          return info;
        }
        if (step.url) await this.page.waitForURL(step.url.startsWith("/") && step.url.endsWith("/") && step.url.length > 2 ? new RegExp(step.url.slice(1, -1)) : step.url, { timeout: t });
        else if (step.loadState) await this.page.waitForLoadState(step.loadState, { timeout: t });
        else await this.page.waitForTimeout(Math.min(step.ms ?? 0, 10_000));
        return {};
      }
      case "assert":
        return this.assert(step, scope, set);
      case "extract": {
        let raw: string;
        let info: Partial<StepResult> = {};
        if (step.from === "url") raw = this.page.url();
        else {
          if (!step.locator) throw new EngineError("E_INPUT_VALIDATION", "Η εξαγωγή χρειάζεται στοιχείο.");
          const r = await this.locate(step, step.locator, scope, set);
          info = r.info;
          raw =
            step.from === "value" ? await r.handle.inputValue({ timeout: t })
            : step.from === "attribute" ? ((await r.handle.getAttribute(step.attribute ?? "", { timeout: t })) ?? "")
            : ((await r.handle.textContent({ timeout: t })) ?? "");
        }
        raw = raw.trim();
        if (step.regex) {
          const m = new RegExp(step.regex).exec(raw);
          raw = m ? (m[1] ?? m[0]) : "";
        }
        const [root, key] = step.into.split(".");
        (root === "output" ? this.output : this.vars)[key] = raw;
        return { ...info, valuePreview: raw.length > 80 ? `${raw.slice(0, 77)}…` : raw };
      }
      case "setVar": {
        const v = evaluate(step.value, scope);
        this.vars[step.name] = v;
        return { valuePreview: JSON.stringify(v)?.slice(0, 80) };
      }
      case "if": {
        const cond =
          typeof step.condition === "string"
            ? Boolean(evaluate(step.condition, scope))
            : await resolveLocator(this.page, step.condition.exists, { timeoutMs: Math.min(t, 3000), render: tpl }).then(() => true, () => false);
        await this.runSteps(cond ? step.then : step.else, `${path}.${cond ? "then" : "else"}`, loop);
        return { valuePreview: cond ? "αληθής" : "ψευδής" };
      }
      case "forEach": {
        const items = evaluate(step.items, scope);
        if (!Array.isArray(items)) throw new EngineError("E_INPUT_VALIDATION", "Το «Για κάθε» χρειάζεται λίστα.");
        if (items.length > step.maxIterations) throw new EngineError("E_INPUT_VALIDATION", `Πάνω από ${step.maxIterations} επαναλήψεις.`);
        for (let i = 0; i < items.length; i++) {
          await this.runSteps(step.steps, `${path}[${i}]`, { ...loop, [step.as]: items[i], [`${step.as}Index`]: i }, i);
        }
        return { valuePreview: `${items.length} επαναλήψεις` };
      }
      case "switchTab": {
        const pages = this.page.context().pages();
        let next: Page | undefined;
        if (step.match === "opener") next = (await this.page.opener()) ?? pages[0];
        else if (step.match.index !== undefined) next = pages[step.match.index];
        else {
          const needle = step.match.urlContains ?? "";
          next = pages.find((p) => p.url().includes(needle));
          if (!next) next = await this.page.context().waitForEvent("page", { predicate: (p) => p.url().includes(needle), timeout: t });
        }
        if (!next) throw new EngineError("E_LOCATOR_NOT_FOUND", "Δεν βρέθηκε η καρτέλα.");
        await next.waitForLoadState("domcontentloaded");
        this.page = next;
        this.page.on("dialog", (d) => void this.handleDialog(d));
        return { valuePreview: next.url() };
      }
      case "dialog":
        this.pendingDialog = { action: step.action, promptText: step.promptText };
        return { valuePreview: step.action };
      case "screenshot":
        await this.opts.hooks?.onScreenshot?.({ step, path, seq: this.seq }, { page: this.page, name: step.name, fullPage: step.fullPage ?? false, sensitive: this.sensitive });
        return {};
      case "humanTask":
        throw new EngineError("E_HUMAN_TIMEOUT", `Απαιτείται ενέργεια χειριστή: ${tpl(step.instructions)}`);
      case "checkTargetErrors":
        await this.checkTargetErrors();
        return {};
    }
  }

  private async assert(step: Extract<Step, { type: "assert" }>, scope: Scope, set: (l: PwLocator) => void): Promise<Partial<StepResult>> {
    const t = this.timeout(step);
    const expected = step.expected === undefined ? "" : render(String(step.expected), scope);
    const fail = (detail: string) => new EngineError("E_ASSERTION_FAILED", step.errorMessage ? `${step.errorMessage} (${detail})` : detail);
    if (step.check === "urlMatches") {
      const url = this.page.url();
      if (!url.includes(expected) && !new RegExp(expected).test(url)) throw fail(`η διεύθυνση είναι ${url}`);
      return {};
    }
    if (!step.locator) throw new EngineError("E_INPUT_VALIDATION", "Ο έλεγχος χρειάζεται στοιχείο.");
    if (step.check === "hidden") {
      const r = await resolveLocator(this.page, step.locator, { timeoutMs: 1000, render: (s) => render(s, scope) }).catch(() => null);
      if (r) await r.handle.waitFor({ state: "hidden", timeout: t }).catch(() => Promise.reject(fail("το στοιχείο εξακολουθεί να φαίνεται")));
      return {};
    }
    if (step.check === "count") {
      const first = step.locator.candidates[0];
      const n = await toPlaywright(this.page, { ...first, ...("value" in first ? { value: render(first.value, scope) } : {}) } as typeof first).count();
      if (String(n) !== expected) throw fail(`βρέθηκαν ${n}`);
      return {};
    }
    const { handle, info } = await this.locate(step, step.locator, scope, set).catch((e) => {
      if (e instanceof EngineError && e.code === "E_LOCATOR_NOT_FOUND") throw fail("το στοιχείο δεν βρέθηκε");
      throw e;
    });
    if (step.check === "visible") {
      await handle.waitFor({ state: "visible", timeout: t }).catch(() => Promise.reject(fail("το στοιχείο δεν είναι ορατό")));
    } else {
      const actual = (step.check === "valueEquals" ? await handle.inputValue({ timeout: t }) : ((await handle.textContent({ timeout: t })) ?? "")).trim();
      const ok = step.check === "textContains" ? actual.includes(expected) : actual === expected;
      if (!ok) throw fail(`βρέθηκε «${actual.slice(0, 120)}»`);
    }
    return info;
  }

  private async captchaCheck() {
    if (await this.page.locator(CAPTCHA).count().catch(() => 0)) {
      throw new EngineError("E_CAPTCHA_DETECTED", "Η σελίδα ζητά CAPTCHA — απαιτείται ενέργεια χειριστή.");
    }
  }

  private async checkTargetErrors() {
    for (const d of this.opts.errorDetectors ?? []) {
      if (d.kind === "success") continue;
      const l = this.page.locator(d.css);
      const visible = await l.first().isVisible().catch(() => false);
      if (!visible) continue;
      const text = ((await l.first().textContent().catch(() => "")) ?? "").trim().slice(0, 500);
      if (d.kind === "duplicate") throw new EngineError("E_DUPLICATE", "Το σύστημα δηλώνει ότι η εγγραφή υπάρχει ήδη.", { targetMessage: text });
      throw new EngineError("E_TARGET_VALIDATION", `Το σύστημα εμφάνισε μήνυμα λάθους${d.name ? ` (${d.name})` : ""}.`, { targetMessage: text });
    }
  }
}
