// Locator resolution with fallback (docs/06 §4): the first candidate that matches exactly one
// element wins; a non-first winner is reported so the UI can suggest updating the step.
import type { Frame, FrameLocator, Locator as PwLocator, Page } from "playwright";
import type { Locator, LocatorCandidate } from "@/lib/dsl/schema";
import { EngineError } from "./errors";

type Root = Page | Frame | FrameLocator | PwLocator;

type Role = Parameters<Page["getByRole"]>[0];

export function toPlaywright(root: Root, c: LocatorCandidate): PwLocator {
  switch (c.kind) {
    case "testId":
      return root.getByTestId(c.value);
    case "role":
      return root.getByRole(c.role as Role, c.name ? { name: c.name, exact: c.exact } : undefined);
    case "label":
      return root.getByLabel(c.value, { exact: c.exact });
    case "placeholder":
      return root.getByPlaceholder(c.value);
    case "text":
      return root.getByText(c.value, { exact: c.exact });
    case "xpath":
      return root.locator(`xpath=${c.value}`);
    case "css":
      return root.locator(c.value);
  }
}

export type Resolved = { handle: PwLocator; used: LocatorCandidate; index: number };

/** `render` applies templates to candidate values ({{item.code}}). */
export async function resolveLocator(page: Page, loc: Locator, opts: { timeoutMs: number; render: (s: string) => string }): Promise<Resolved> {
  let root: Root = page;
  for (const f of loc.frame ?? []) root = (root as Page).frameLocator(f);
  if (loc.within) root = (await resolveLocator(page, loc.within, opts)).handle;

  const rendered = loc.candidates.map((c) => {
    const out = { ...c } as LocatorCandidate & { value?: string; name?: string };
    if ("value" in out && typeof out.value === "string") out.value = opts.render(out.value);
    if ("name" in out && typeof out.name === "string") out.name = opts.render(out.name);
    return out as LocatorCandidate;
  });
  const nth = typeof loc.nth === "string" ? Number(opts.render(loc.nth)) : loc.nth;
  if (nth !== undefined && (!Number.isInteger(nth) || nth < 0)) throw new EngineError("E_INPUT_VALIDATION", `Μη έγκυρη θέση γραμμής «${String(loc.nth)}».`);
  const pick = (l: PwLocator) => (nth != null ? l.nth(nth) : l);

  // Fast pass: what is on the page right now.
  for (let i = 0; i < rendered.length; i++) {
    const l = toPlaywright(root, rendered[i]);
    const count = await l.count();
    if (count === 1 || (nth != null && count > nth)) return { handle: pick(l), used: rendered[i], index: i };
  }
  // Nothing yet: the DOM may still be loading — wait for any candidate until the timeout.
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    for (let i = 0; i < rendered.length; i++) {
      const l = toPlaywright(root, rendered[i]);
      const count = await l.count();
      if (count === 1 || (nth != null && count > nth)) return { handle: pick(l), used: rendered[i], index: i };
      if (count > 1 && nth == null && i === rendered.length - 1) {
        throw new EngineError("E_LOCATOR_NOT_FOUND", `Ο επιλογέας «${describe(rendered[i])}» ταιριάζει σε ${count} στοιχεία.`);
      }
    }
  }
  throw new EngineError("E_LOCATOR_NOT_FOUND", `Δεν βρέθηκε το στοιχείο ${loc.description ?? describe(rendered[0])}.`);
}

export function describe(c: LocatorCandidate) {
  if (c.kind === "role") return `role ${c.role}${c.name ? ` «${c.name}»` : ""}`;
  return `${c.kind} «${c.value}»`;
}
