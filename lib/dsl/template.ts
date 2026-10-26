// Templates inside strings: "{{ path | filter:arg }}" (docs/05 §4). The part before the first `|`
// is a safe expression (expr.ts); filters come from a whitelist with literal arguments only.
import { format as formatDate, isValid, parseISO } from "date-fns";
import { el } from "date-fns/locale";
import { evaluate, ExprError, refsOf, type Scope } from "./expr";

const TEMPLATE = /\{\{([\s\S]+?)\}\}/g;

/** Splits on `sep` outside quotes. */
function split(src: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === "\\" && i + 1 < src.length) {
        cur += ch + src[++i];
        continue;
      }
      if (ch === q) q = null;
      cur += ch;
    } else if (ch === "'" || ch === '"') {
      q = ch;
      cur += ch;
    } else if (src.startsWith(sep, i) && !(sep === "|" && (src[i + 1] === "|" || src[i - 1] === "|"))) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function literal(arg: string): string | number {
  if (/^'[\s\S]*'$|^"[\s\S]*"$/.test(arg)) return arg.slice(1, -1).replace(/\\([\s\S])/g, "$1");
  if (/^-?\d+(\.\d+)?$/.test(arg)) return Number(arg);
  throw new ExprError(`Το όρισμα φίλτρου πρέπει να είναι σταθερά: ${arg}`);
}

const str = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** «Αθήνα» → «ΑΘΗΝΑ»: uppercase without accents, as older ERPs expect. */
export function greekUpper(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase("el-GR");
}

/** Greek number format: pattern "0,0.00" → grouping «.» and decimal «,» (1.234,56). */
export function formatNumber(v: unknown, pattern = "0,0.00") {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return str(v);
  const decimals = pattern.includes(".") ? pattern.split(".")[1].length : 0;
  return new Intl.NumberFormat("el-GR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: pattern.includes(","),
  }).format(n);
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isValid(v) ? v : null;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string" && v) {
    const d = parseISO(v);
    return isValid(d) ? d : null;
  }
  return null;
}

export const FILTERS: Record<string, (v: unknown, ...args: (string | number)[]) => unknown> = {
  trim: (v) => str(v).trim(),
  upper: (v) => str(v).toLocaleUpperCase("el-GR"),
  lower: (v) => str(v).toLocaleLowerCase("el-GR"),
  default: (v, d = "") => (v === null || v === undefined || v === "" ? d : v),
  date: (v, f = "dd/MM/yyyy") => {
    const d = toDate(v);
    return d ? formatDate(d, String(f), { locale: el }) : str(v);
  },
  number: (v, p = "0,0.00") => formatNumber(v, String(p)),
  pad: (v, len = 0, ch = " ") => str(v).padStart(Number(len), String(ch)),
  replace: (v, a = "", b = "") => str(v).split(String(a)).join(String(b)),
  substr: (v, start = 0, len?: string | number) => str(v).substr(Number(start), len === undefined ? undefined : Number(len)),
  json: (v) => JSON.stringify(v ?? null),
  join: (v, sep = ", ") => (Array.isArray(v) ? v.map(str).join(String(sep)) : str(v)),
  greekUpper: (v) => greekUpper(str(v)),
};

function evalTemplate(body: string, scope: Scope): unknown {
  const [expr, ...filters] = split(body, "|");
  let v = evaluate(expr, scope);
  for (const f of filters) {
    const [name, ...args] = split(f, ":");
    const fn = Object.prototype.hasOwnProperty.call(FILTERS, name) ? FILTERS[name] : undefined;
    if (!fn) throw new ExprError(`Άγνωστο φίλτρο «${name}».`);
    v = fn(v, ...args.map(literal));
  }
  return v;
}

/** Renders every {{ … }} in `src`. */
export function render(src: string, scope: Scope): string {
  return src.replace(TEMPLATE, (_m, body: string) => str(evalTemplate(body, scope)));
}

/** A string that is exactly one template keeps the value's type (array, number …). */
export function renderValue(src: string, scope: Scope): unknown {
  const m = /^\s*\{\{([\s\S]+?)\}\}\s*$/.exec(src);
  return m ? evalTemplate(m[1], scope) : render(src, scope);
}

export function hasTemplate(src: string) {
  return /\{\{[\s\S]+?\}\}/.test(src);
}

/** Paths referenced by the templates of `src` (input.afm, secrets.password …). */
export function extractRefs(src: string): string[] {
  const refs: string[] = [];
  for (const m of src.matchAll(TEMPLATE)) {
    const [expr, ...filters] = split(m[1], "|");
    refs.push(...refsOf(expr));
    for (const f of filters) {
      const [name] = split(f, ":");
      if (!Object.prototype.hasOwnProperty.call(FILTERS, name)) throw new ExprError(`Άγνωστο φίλτρο «${name}».`);
    }
  }
  return [...new Set(refs)];
}
