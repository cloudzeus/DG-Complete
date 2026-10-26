// Safe expressions for `when`, `condition`, `items`, `setVar.value` (docs/05 §4).
// jsep parses; this evaluator walks a whitelisted AST — no eval / Function, no calls,
// no access to __proto__ / constructor / prototype or to inherited properties.
import jsep from "jsep";

jsep.addBinaryOp("??", 1);
jsep.removeBinaryOp("|");
jsep.removeBinaryOp("&");
jsep.removeBinaryOp("^");
jsep.removeBinaryOp("<<");
jsep.removeBinaryOp(">>");
jsep.removeBinaryOp(">>>");
jsep.removeUnaryOp("~");

export class ExprError extends Error {}

export type Scope = Record<string, unknown>;
type Node = jsep.Expression;

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__"]);
const cache = new Map<string, Node>();

export function parseExpr(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  let ast: Node;
  try {
    ast = jsep(src);
  } catch (err) {
    throw new ExprError(`Μη έγκυρη έκφραση «${src}»: ${(err as Error).message}`);
  }
  check(ast);
  if (cache.size > 500) cache.clear();
  cache.set(src, ast);
  return ast;
}

/** Static check: only allowed node types and property names. */
function check(n: Node): void {
  switch (n.type) {
    case "Literal":
    case "Identifier":
    case "ThisExpression":
      if (n.type === "ThisExpression") throw new ExprError("Το «this» δεν επιτρέπεται.");
      if (n.type === "Identifier" && FORBIDDEN.has(n.name as string)) throw new ExprError(`Μη επιτρεπτό όνομα «${n.name}».`);
      return;
    case "MemberExpression": {
      check(n.object as Node);
      const p = n.property as Node;
      if (!n.computed && p.type === "Identifier" && FORBIDDEN.has(p.name as string)) throw new ExprError(`Μη επιτρεπτή πρόσβαση «${p.name}».`);
      if (n.computed) check(p);
      return;
    }
    case "BinaryExpression":
      check(n.left as Node);
      check(n.right as Node);
      return;
    case "UnaryExpression":
      if (!["!", "-", "+"].includes(n.operator as string)) throw new ExprError(`Μη επιτρεπτός τελεστής «${n.operator}».`);
      check(n.argument as Node);
      return;
    case "ConditionalExpression":
      check(n.test as Node);
      check(n.consequent as Node);
      check(n.alternate as Node);
      return;
    case "ArrayExpression":
      for (const e of (n.elements as Node[]) ?? []) if (e) check(e);
      return;
    default:
      throw new ExprError(`Μη επιτρεπτή έκφραση (${n.type}).`);
  }
}

function prop(obj: unknown, key: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  const k = typeof key === "number" ? key : String(key);
  if (typeof k === "string" && FORBIDDEN.has(k)) throw new ExprError(`Μη επιτρεπτή πρόσβαση «${k}».`);
  if (typeof obj === "string" || Array.isArray(obj)) {
    if (k === "length") return obj.length;
    return typeof k === "number" || /^\d+$/.test(k) ? (obj as ArrayLike<unknown>)[Number(k)] : undefined;
  }
  if (typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, k)) return (obj as Record<string | number, unknown>)[k];
  return undefined;
}

function num(v: unknown) {
  return typeof v === "number" ? v : Number(v);
}

function evalNode(n: Node, scope: Scope): unknown {
  switch (n.type) {
    case "Literal":
      return n.value;
    case "Identifier": {
      const name = n.name as string;
      if (name === "null") return null;
      if (name === "undefined") return undefined;
      if (name === "true") return true;
      if (name === "false") return false;
      return prop(scope, name);
    }
    case "MemberExpression": {
      const obj = evalNode(n.object as Node, scope);
      const p = n.property as Node;
      const key = n.computed ? evalNode(p, scope) : (p.name as string);
      return prop(obj, key);
    }
    case "UnaryExpression": {
      const v = evalNode(n.argument as Node, scope);
      return n.operator === "!" ? !v : n.operator === "-" ? -num(v) : num(v);
    }
    case "BinaryExpression": {
      const op = n.operator as string;
      if (op === "&&") return evalNode(n.left as Node, scope) && evalNode(n.right as Node, scope);
      if (op === "||") return evalNode(n.left as Node, scope) || evalNode(n.right as Node, scope);
      if (op === "??") return evalNode(n.left as Node, scope) ?? evalNode(n.right as Node, scope);
      const a = evalNode(n.left as Node, scope);
      const b = evalNode(n.right as Node, scope);
      switch (op) {
        // Loose equality on purpose: `x == null` must also match undefined (docs/05 example).
        case "==": return a == b; // eslint-disable-line eqeqeq
        case "!=": return a != b; // eslint-disable-line eqeqeq
        case "===": return a === b;
        case "!==": return a !== b;
        case ">": return (a as number) > (b as number);
        case ">=": return (a as number) >= (b as number);
        case "<": return (a as number) < (b as number);
        case "<=": return (a as number) <= (b as number);
        case "+": return typeof a === "string" || typeof b === "string" ? `${a ?? ""}${b ?? ""}` : num(a) + num(b);
        case "-": return num(a) - num(b);
        case "*": return num(a) * num(b);
        case "/": return num(a) / num(b);
        case "%": return num(a) % num(b);
        default: throw new ExprError(`Μη επιτρεπτός τελεστής «${op}».`);
      }
    }
    case "ConditionalExpression":
      return evalNode(n.test as Node, scope) ? evalNode(n.consequent as Node, scope) : evalNode(n.alternate as Node, scope);
    case "ArrayExpression":
      return ((n.elements as Node[]) ?? []).map((e) => (e ? evalNode(e, scope) : undefined));
    default:
      throw new ExprError(`Μη επιτρεπτή έκφραση (${n.type}).`);
  }
}

export function evaluate(src: string, scope: Scope): unknown {
  return evalNode(parseExpr(src), scope);
}

/** Dotted paths rooted at an identifier, e.g. "input.afm", "c.email" (for static checks). */
export function refsOf(src: string): string[] {
  const out: string[] = [];
  const walk = (n: Node): string | null => {
    if (n.type === "Identifier") return n.name as string;
    if (n.type === "MemberExpression") {
      const base = walk(n.object as Node);
      const p = n.property as Node;
      if (n.computed) walk(p);
      if (base && !n.computed && p.type === "Identifier") return `${base}.${p.name}`;
      if (base) out.push(base);
      return null;
    }
    for (const key of ["left", "right", "argument", "test", "consequent", "alternate"] as const) {
      const c = (n as Record<string, unknown>)[key] as Node | undefined;
      if (c) {
        const r = walk(c);
        if (r) out.push(r);
      }
    }
    for (const e of ((n as { elements?: Node[] }).elements ?? [])) {
      if (e) {
        const r = walk(e);
        if (r) out.push(r);
      }
    }
    return null;
  };
  const top = walk(parseExpr(src));
  if (top) out.push(top);
  return [...new Set(out)].filter((r) => !["null", "undefined", "true", "false"].includes(r));
}
