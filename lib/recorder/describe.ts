// In-page element description for the live recorder (runs inside the target page via
// page.evaluate) and the mapping to DSL locator candidates. No values are read except the
// options of a <select> and the text of non-input elements.
import type { LocatorCandidate } from "@/lib/dsl/schema";

export type ElementInfo = {
  tag: string;
  type: string | null;
  id: string | null;
  name: string | null;
  testId: string | null;
  role: string | null;
  ariaLabel: string | null;
  label: string | null;
  placeholder: string | null;
  text: string | null;
  css: string;
  required: boolean;
  options?: { value: string; label: string }[];
  rect?: { x: number; y: number; w: number; h: number };
};

/** Executed in the page. Must be self-contained (no closures). */
export function describeInPage(arg: { x?: number; y?: number; active?: boolean; all?: boolean; buttons?: boolean }): ElementInfo | ElementInfo[] | null {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;
  const cssEscape = (s: string) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&"));
  const implicitRole = (el: Element): string | null => {
    const t = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if (el.getAttribute("role")) return el.getAttribute("role");
    if (t === "button" || (t === "input" && ["submit", "button", "reset"].includes(type))) return "button";
    if (t === "a" && el.hasAttribute("href")) return "link";
    if (t === "select") return "combobox";
    if (t === "textarea" || (t === "input" && ["", "text", "email", "tel", "search", "url", "number", "password"].includes(type))) return "textbox";
    if (t === "input" && type === "checkbox") return "checkbox";
    if (t === "input" && type === "radio") return "radio";
    return null;
  };
  const labelOf = (el: Element): string | null => {
    const id = el.getAttribute("id");
    if (id) {
      const l = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (l) return clean(l.textContent);
    }
    const wrap = el.closest("label");
    if (wrap) return clean(wrap.textContent);
    const by = el.getAttribute("aria-labelledby");
    if (by) return clean(by.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? "").join(" "));
    return null;
  };
  const cssPath = (el: Element): string => {
    if (el.id) return `#${cssEscape(el.id)}`;
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && parts.length < 5) {
      let part = cur.tagName.toLowerCase();
      const name = cur.getAttribute("name");
      if (name) part += `[name="${name}"]`;
      else {
        const parent: Element | null = cur.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      if (cur.id) {
        parts[0] = `#${cssEscape(cur.id)}`;
        break;
      }
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };
  const info = (el: Element): ElementInfo => {
    const t = el.tagName.toLowerCase();
    const isField = ["input", "select", "textarea"].includes(t);
    const r = el.getBoundingClientRect();
    return {
      tag: t,
      type: el.getAttribute("type"),
      id: el.getAttribute("id"),
      name: el.getAttribute("name"),
      testId: el.getAttribute("data-testid") ?? el.getAttribute("data-test-id"),
      role: implicitRole(el),
      ariaLabel: clean(el.getAttribute("aria-label")),
      label: isField ? labelOf(el) : null,
      placeholder: clean(el.getAttribute("placeholder")),
      text: isField ? (t === "input" && ["submit", "button"].includes((el.getAttribute("type") ?? "").toLowerCase()) ? clean((el as HTMLInputElement).value) : null) : clean((el as HTMLElement).innerText ?? el.textContent)?.slice(0, 80) ?? null,
      css: cssPath(el),
      required: (el as HTMLInputElement).required ?? false,
      options: t === "select" ? Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, label: clean(o.textContent) ?? o.value })).slice(0, 200) : undefined,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };
  };
  if (arg.buttons) {
    return Array.from(document.querySelectorAll("button, input[type=button], input[type=submit], a[role=button], [role=button]"))
      .filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .slice(0, 100)
      .map(info);
  }
  if (arg.all) {
    const fields = Array.from(document.querySelectorAll("input, select, textarea")).filter((el) => {
      const type = (el.getAttribute("type") ?? "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    });
    return fields.map(info);
  }
  let el: Element | null = arg.active ? document.activeElement : document.elementFromPoint(arg.x ?? 0, arg.y ?? 0);
  if (!el || el === document.body) return null;
  // Prefer the interactive ancestor (a <span> inside a <button>).
  const interactive = el.closest("button, a[href], input, select, textarea, label, [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [onclick]");
  if (interactive) el = interactive.tagName === "LABEL" && (interactive as HTMLLabelElement).control ? (interactive as HTMLLabelElement).control! : interactive;
  return info(el);
}

/** Ranked candidates: testId > role+name > label > placeholder > text > css. */
export function candidatesFor(e: ElementInfo): LocatorCandidate[] {
  const out: LocatorCandidate[] = [];
  if (e.testId) out.push({ kind: "testId", value: e.testId });
  const name = e.ariaLabel ?? (["button", "link", "tab", "menuitem", "option"].includes(e.role ?? "") ? e.text : e.label);
  if (e.role && name && name.length <= 80) out.push({ kind: "role", role: e.role, name });
  if (e.label) out.push({ kind: "label", value: e.label });
  if (e.placeholder) out.push({ kind: "placeholder", value: e.placeholder });
  if (!["input", "select", "textarea"].includes(e.tag) && e.text && e.text.length <= 60 && !e.role) out.push({ kind: "text", value: e.text });
  if (e.name && ["input", "select", "textarea"].includes(e.tag)) out.push({ kind: "css", value: `${e.tag}[name="${e.name}"]` });
  if (e.css) out.push({ kind: "css", value: e.css });
  return out.filter((c, i) => out.findIndex((o) => JSON.stringify(o) === JSON.stringify(c)) === i);
}

export function fieldLabel(e: ElementInfo) {
  return e.label ?? e.ariaLabel ?? e.placeholder ?? e.name ?? e.id ?? "Πεδίο";
}

export function isPasswordField(e: ElementInfo) {
  return (e.type ?? "").toLowerCase() === "password";
}

/** Selector matching the same field in every row: digits in the name become a prefix/suffix match. */
export function rowSelector(e: ElementInfo): string {
  if (e.name) {
    const m = /^(.*?)(\d+)(\D*)$/.exec(e.name);
    if (m && (m[1] || m[3])) return `${e.tag}${m[1] ? `[name^="${m[1]}"]` : ""}${m[3] ? `[name$="${m[3]}"]` : ""}`;
    return `${e.tag}[name="${e.name}"]`;
  }
  if (e.label) return `${e.tag}[aria-label="${e.label}"]`;
  return e.css.replace(/:nth-of-type\(\d+\)/g, "");
}
