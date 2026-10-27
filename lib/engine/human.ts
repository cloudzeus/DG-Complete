// Live assist (docs/22): what the engine hands the worker when a run needs an operator — the page,
// the allowed areas and the completion check. The worker owns the channel to the operator; the
// engine never sees who typed what. Values given through `fill` are never logged or returned.
import type { Locator as PwLocator, Page } from "playwright";
import type { Locator } from "@/lib/dsl/schema";
import { resolveLocator } from "./locator";

export type HumanBox = { x: number; y: number; width: number; height: number };

export type HumanTask = {
  stepId: string;
  label: string;
  reason: "humanTask" | "captcha";
  instructions: string;
  mode: "focus" | "full";
  timeoutSec: number;
  fields: { key: string; label: string; type: "string" | "number"; fillable: boolean }[];
  hasCompleteWhen: boolean;
  page: Page;
  sensitive: PwLocator[];
  /** Bounding boxes of the elements the operator may use (focus mode). */
  allowedBoxes(): Promise<HumanBox[]>;
  /** The focused element of the page is inside an allowed element. */
  focusAllowed(): Promise<boolean>;
  /** Fills the operator's values into the `fill` elements. */
  fill(values: Record<string, string>): Promise<void>;
  /** `completeWhen` holds (always false without one). */
  isComplete(): Promise<boolean>;
};

/** "**\/dashboard**" → RegExp; a plain string matches as a substring. */
export function urlMatcher(pattern: string): (url: string) => boolean {
  if (!pattern.includes("*")) return (url) => url.includes(pattern);
  const re = new RegExp(
    "^" +
      pattern
        .split("**")
        .map((part) => part.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
        .join(".*") +
      "$",
  );
  return (url) => re.test(url);
}

type Build = {
  page: Page;
  sensitive: PwLocator[];
  render: (s: string) => string;
  stepId: string;
  label: string;
  reason: HumanTask["reason"];
  instructions: string;
  mode: HumanTask["mode"];
  timeoutSec: number;
  allow: Locator[];
  fields: { key: string; label?: string; type: "string" | "number"; fill?: Locator }[];
  completeWhen?: { urlMatches?: string; visible?: Locator; hidden?: Locator };
  /** Extra completion check (CAPTCHA gone). */
  done?: () => Promise<boolean>;
};

export function buildHumanTask(b: Build): HumanTask {
  const find = (loc: Locator) => resolveLocator(b.page, loc, { timeoutMs: 1500, render: b.render }).then((r) => r.handle, () => null);
  const all = [...b.allow, ...b.fields.flatMap((f) => (f.fill ? [f.fill] : []))];
  const unique = all.filter((l, i) => all.findIndex((m) => JSON.stringify(m) === JSON.stringify(l)) === i);
  const targets = () => unique;
  const url = b.completeWhen?.urlMatches ? urlMatcher(b.render(b.completeWhen.urlMatches)) : null;
  return {
    stepId: b.stepId,
    label: b.label,
    reason: b.reason,
    instructions: b.instructions,
    mode: b.mode,
    timeoutSec: b.timeoutSec,
    fields: b.fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type, fillable: !!f.fill })),
    hasCompleteWhen: !!(b.completeWhen && (url || b.completeWhen.visible || b.completeWhen.hidden)) || !!b.done,
    page: b.page,
    sensitive: b.sensitive,
    async allowedBoxes() {
      const out: HumanBox[] = [];
      for (const loc of targets()) {
        const h = await find(loc);
        const box = h ? await h.boundingBox().catch(() => null) : null;
        if (box) out.push(box);
      }
      return out;
    },
    async focusAllowed() {
      for (const loc of targets()) {
        const h = await find(loc);
        if (h && (await h.evaluate((el) => !!document.activeElement && (el === document.activeElement || el.contains(document.activeElement))).catch(() => false))) return true;
      }
      return false;
    },
    async fill(values) {
      for (const f of b.fields) {
        const v = values[f.key];
        if (!f.fill || v === undefined || v === "") continue;
        const h = await find(f.fill);
        if (!h) throw new Error(`field ${f.key} not found`);
        await h.fill(String(v));
        // Masked in screenshots, and the trace is not kept (filledSensitive).
        b.sensitive.push(h);
      }
    },
    async isComplete() {
      if (b.done && (await b.done())) return true;
      const cw = b.completeWhen;
      if (!cw) return false;
      if (url && !url(b.page.url())) return false;
      if (cw.visible) {
        const h = await find(cw.visible);
        if (!h || !(await h.isVisible().catch(() => false))) return false;
      }
      if (cw.hidden) {
        const h = await find(cw.hidden);
        if (h && (await h.isVisible().catch(() => false))) return false;
      }
      return !!(url || cw.visible || cw.hidden);
    },
  };
}
