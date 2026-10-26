// Chrome DevTools Recorder → workflow definition (docs/04 §5, P05 task 8). Pure.
// The user records in Chrome (DevTools → Recorder), exports JSON and imports it here.
// Typed values become inputs ({{input.x}}, recorded value as example); password fields become
// {{secrets.password}} and their recorded value is dropped — never stored.
import type { LocatorCandidate } from "../schema";

type RecStep = {
  type: string;
  selectors?: (string | string[])[];
  value?: string;
  url?: string;
  key?: string;
  frame?: number[];
  target?: string;
  assertedEvents?: { type: string; url?: string; title?: string }[];
};
export type ChromeRecording = { title?: string; steps: RecStep[] };

export type ImportedInput = { key: string; label: string; type: "string"; example?: string };
export type ImportResult = {
  name: string;
  steps: Record<string, unknown>[];
  inputs: ImportedInput[];
  usesSecrets: string[];
  skipped: number;
  warnings: string[];
};

const GREEK: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

/** «Επωνυμία» → "eponymia", «ΑΦΜ» → "afm", "Customer name" → "customerName". */
export function toInputKey(label: string, taken: Set<string>): string {
  const latin = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split("")
    .map((c) => GREEK[c] ?? c)
    .join("");
  const words = latin.split(/[^a-z0-9]+/).filter(Boolean);
  let key = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join("") || "field";
  if (!/^[a-z]/.test(key)) key = `f${key}`;
  key = key.slice(0, 40);
  let k = key;
  for (let n = 2; taken.has(k); n++) k = `${key}${n}`;
  taken.add(k);
  return k;
}

/** One Chrome selector (first of each group) → DSL candidate. */
function candidate(sel: string): LocatorCandidate | null {
  if (sel.startsWith("aria/")) {
    const m = /^aria\/(.*?)(?:\[role="([a-z]+)"\])?$/.exec(sel);
    if (!m) return null;
    const name = m[1].trim();
    const role = m[2];
    if (!name) return null;
    return role ? { kind: "role", role, name } : { kind: "label", value: name };
  }
  if (sel.startsWith("xpath/")) return { kind: "xpath", value: sel.slice(6) };
  if (sel.startsWith("text/")) return { kind: "text", value: sel.slice(5) };
  if (sel.startsWith("pierce/")) return { kind: "css", value: sel.slice(7) };
  if (sel.startsWith(":scope")) return null;
  return { kind: "css", value: sel };
}

const SCORE: Record<string, number> = { testId: 0, role: 1, label: 2, placeholder: 3, text: 4, css: 5, xpath: 6 };

function locatorOf(step: RecStep) {
  const cands: LocatorCandidate[] = [];
  for (const group of step.selectors ?? []) {
    const first = Array.isArray(group) ? group[0] : group;
    if (typeof first !== "string" || Array.isArray(group) && group.length > 1) {
      // Shadow-DOM chains: keep only the last part as CSS.
      const last = Array.isArray(group) ? group[group.length - 1] : undefined;
      if (typeof last === "string") {
        const c = candidate(last);
        if (c) cands.push(c);
      }
      continue;
    }
    const c = candidate(first);
    if (!c) continue;
    // data-testid in CSS → testId candidate
    const tid = c.kind === "css" ? /^\[data-testid=['"]?([^'"\]]+)['"]?\]$/.exec(c.value) : null;
    cands.push(tid ? { kind: "testId", value: tid[1] } : c);
  }
  const unique = cands.filter((c, i) => cands.findIndex((o) => JSON.stringify(o) === JSON.stringify(c)) === i);
  unique.sort((a, b) => SCORE[a.kind] - SCORE[b.kind]);
  return unique.length ? { candidates: unique } : null;
}

function labelOf(loc: { candidates: LocatorCandidate[] } | null) {
  const c = loc?.candidates.find((x) => x.kind === "label" || x.kind === "role" || x.kind === "text" || x.kind === "placeholder");
  if (!c) return null;
  return c.kind === "role" ? (c.name ?? null) : c.value;
}

const isPassword = (step: RecStep, label: string | null) =>
  /pass|κωδικ/i.test(label ?? "") || (step.selectors ?? []).flat().some((s) => typeof s === "string" && /type=["']?password|password/i.test(s));

export function importChromeRecording(rec: ChromeRecording, opts: { baseUrl?: string; name?: string } = {}): ImportResult {
  if (!rec || !Array.isArray(rec.steps)) throw new Error("Μη έγκυρο αρχείο Chrome Recorder (λείπει το «steps»).");
  const steps: Record<string, unknown>[] = [];
  const inputs: ImportedInput[] = [];
  const secrets = new Set<string>();
  const taken = new Set<string>();
  const warnings: string[] = [];
  let skipped = 0;
  let n = 0;
  const id = () => `s${String(++n).padStart(2, "0")}`;
  const base = opts.baseUrl ? new URL(opts.baseUrl) : null;
  const rel = (url: string) => {
    try {
      const u = new URL(url);
      return base && u.origin === base.origin ? `${u.pathname}${u.search}` || "/" : url;
    } catch {
      return url;
    }
  };

  // The field typed right before a password field is the username.
  const nextChangeIsPassword = (i: number) => {
    const next = rec.steps.slice(i + 1).find((x) => x.type === "change");
    return !!next && isPassword(next, labelOf(locatorOf(next)));
  };

  for (const [i, s] of rec.steps.entries()) {
    if (s.frame?.length) warnings.push(`Βήμα σε iframe (${s.type}) — ελέγξτε το στοιχείο στον editor.`);
    switch (s.type) {
      case "navigate":
        if (s.url) steps.push({ id: id(), type: "navigate", label: "Πλοήγηση", url: rel(s.url) });
        break;
      case "click":
      case "doubleClick": {
        const loc = locatorOf(s);
        if (!loc) {
          skipped++;
          break;
        }
        const label = labelOf(loc);
        const nav = s.assertedEvents?.some((e) => e.type === "navigation");
        steps.push({ id: id(), type: "click", label: label ? `Κλικ «${label}»` : "Κλικ", locator: loc, ...(s.type === "doubleClick" ? { clickCount: 2 } : {}), ...(nav ? { waitForNavigation: true } : {}) });
        break;
      }
      case "change": {
        const loc = locatorOf(s);
        if (!loc) {
          skipped++;
          break;
        }
        const label = labelOf(loc) ?? `Πεδίο ${inputs.length + 1}`;
        // A click on the same field right before a change is noise.
        const prev = steps[steps.length - 1];
        if (prev?.type === "click" && JSON.stringify(prev.locator) === JSON.stringify(loc)) steps.pop();
        if (isPassword(s, label)) {
          secrets.add("password");
          steps.push({ id: id(), type: "fill", label, locator: loc, value: "{{secrets.password}}" });
        } else if (nextChangeIsPassword(i)) {
          secrets.add("username");
          steps.push({ id: id(), type: "fill", label, locator: loc, value: "{{secrets.username}}" });
        } else {
          const existing = inputs.find((i) => i.label === label);
          const key = existing?.key ?? toInputKey(label, taken);
          if (!existing) inputs.push({ key, label, type: "string", example: s.value });
          steps.push({ id: id(), type: "fill", label, locator: loc, value: `{{input.${key}}}` });
        }
        break;
      }
      case "keyDown":
        if (s.key && ["Enter", "Tab", "Escape"].includes(s.key)) steps.push({ id: id(), type: "press", label: `Πλήκτρο ${s.key}`, key: s.key });
        else skipped++;
        break;
      case "waitForElement": {
        const loc = locatorOf(s);
        if (loc) steps.push({ id: id(), type: "waitFor", label: "Αναμονή στοιχείου", locator: loc, state: "visible" });
        break;
      }
      case "keyUp":
      case "setViewport":
      case "scroll":
      case "hover":
      case "close":
        skipped++;
        break;
      default:
        skipped++;
        warnings.push(`Ο τύπος «${s.type}» δεν εισάγεται.`);
    }
  }
  if (!steps.length) throw new Error("Η καταγραφή δεν περιέχει βήματα που μπορούν να εισαχθούν.");
  steps.forEach((st, k) => (st.id = `s${String(k + 1).padStart(2, "0")}`));
  return { name: opts.name || rec.title || "Εισαγωγή από Chrome", steps, inputs, usesSecrets: [...secrets], skipped, warnings: [...new Set(warnings)] };
}
