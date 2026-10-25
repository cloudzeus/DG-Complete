// Editing commands on the workflow DSL (docs/19 §5, P07b). Pure: definition in → new definition out.
// The DSL is the only source of truth — the canvas and the list both apply these commands.
// No `server-only`, no Prisma: also used by the client editor.

export type DslStep = { id: string; type: string; label?: string; steps?: DslStep[]; [k: string]: unknown };
export type DslDefinition = { dslVersion?: number; steps?: DslStep[]; [k: string]: unknown };

export const CONTAINER_TYPES = new Set(["forEach", "if"]);

export class CommandError extends Error {}

type Loc = { parent: DslStep[]; index: number };

function locate(steps: DslStep[], id: string): Loc | null {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].id === id) return { parent: steps, index: i };
    const inner = steps[i].steps;
    if (inner) {
      const hit = locate(inner, id);
      if (hit) return hit;
    }
  }
  return null;
}

const clone = (d: DslDefinition): DslDefinition => structuredClone(d);

function contains(step: DslStep, id: string): boolean {
  return (step.steps ?? []).some((s) => s.id === id || contains(s, id));
}

/** Every step id, depth first. */
export function allIds(steps: DslStep[] = []): string[] {
  return steps.flatMap((s) => [s.id, ...allIds(s.steps)]);
}

function assertUniqueIds(def: DslDefinition) {
  const ids = allIds(def.steps);
  if (new Set(ids).size !== ids.length) throw new CommandError("Διπλό id βήματος.");
}

/** Inserts `step` after `afterId` (null = at the start of the top level). */
export function insertAfter(def: DslDefinition, afterId: string | null, step: DslStep): DslDefinition {
  const d = clone(def);
  d.steps ??= [];
  if (afterId === null) d.steps.unshift(step);
  else {
    const loc = locate(d.steps, afterId);
    if (!loc) throw new CommandError("Το βήμα δεν βρέθηκε.");
    loc.parent.splice(loc.index + 1, 0, step);
  }
  assertUniqueIds(d);
  return d;
}

/** Inserts `step` as the first child of a container (forEach / if). */
export function insertInto(def: DslDefinition, containerId: string, step: DslStep): DslDefinition {
  const d = clone(def);
  const loc = locate(d.steps ?? [], containerId);
  if (!loc) throw new CommandError("Το βήμα δεν βρέθηκε.");
  const container = loc.parent[loc.index];
  if (!CONTAINER_TYPES.has(container.type)) throw new CommandError("Βήματα μπαίνουν μόνο μέσα σε «Για κάθε» ή «Συνθήκη».");
  container.steps = [step, ...(container.steps ?? [])];
  assertUniqueIds(d);
  return d;
}

export function remove(def: DslDefinition, id: string): DslDefinition {
  const d = clone(def);
  const loc = locate(d.steps ?? [], id);
  if (!loc) throw new CommandError("Το βήμα δεν βρέθηκε.");
  loc.parent.splice(loc.index, 1);
  return d;
}

export function update(def: DslDefinition, id: string, patch: Partial<DslStep>): DslDefinition {
  const d = clone(def);
  const loc = locate(d.steps ?? [], id);
  if (!loc) throw new CommandError("Το βήμα δεν βρέθηκε.");
  const { id: _ignored, steps: _children, ...rest } = patch;
  void _ignored;
  void _children;
  loc.parent[loc.index] = { ...loc.parent[loc.index], ...rest };
  return d;
}

/**
 * Moves a step. `target` is either { afterId } (null = top of the level of `parentId`) or
 * { intoId } (first child of a container). A step cannot move into itself.
 */
export function move(def: DslDefinition, id: string, target: { afterId: string | null; parentId?: string | null } | { intoId: string }): DslDefinition {
  const d = clone(def);
  const from = locate(d.steps ?? [], id);
  if (!from) throw new CommandError("Το βήμα δεν βρέθηκε.");
  const step = from.parent[from.index];
  const dest = "intoId" in target ? target.intoId : (target.afterId ?? target.parentId ?? null);
  if (dest && (dest === id || contains(step, dest))) throw new CommandError("Ένα βήμα δεν μπορεί να μπει μέσα στον εαυτό του.");
  from.parent.splice(from.index, 1);
  if ("intoId" in target) {
    const loc = locate(d.steps ?? [], target.intoId);
    if (!loc || !CONTAINER_TYPES.has(loc.parent[loc.index].type)) throw new CommandError("Βήματα μπαίνουν μόνο μέσα σε «Για κάθε» ή «Συνθήκη».");
    loc.parent[loc.index].steps = [step, ...(loc.parent[loc.index].steps ?? [])];
  } else if (target.afterId === null) {
    const level = target.parentId ? locate(d.steps ?? [], target.parentId) : null;
    const list = level ? (level.parent[level.index].steps ??= []) : (d.steps ??= []);
    list.unshift(step);
  } else {
    const loc = locate(d.steps ?? [], target.afterId);
    if (!loc) throw new CommandError("Το βήμα προορισμού δεν βρέθηκε.");
    loc.parent.splice(loc.index + 1, 0, step);
  }
  return d;
}

/** Wraps a contiguous range of sibling steps (from … to) in a new forEach over `items`. */
export function wrapInForEach(def: DslDefinition, fromId: string, toId: string, loop: { id: string; items: string; label?: string }): DslDefinition {
  const d = clone(def);
  const a = locate(d.steps ?? [], fromId);
  const b = locate(d.steps ?? [], toId);
  if (!a || !b || a.parent !== b.parent) throw new CommandError("Επιλέξτε διαδοχικά βήματα του ίδιου επιπέδου.");
  const [start, end] = a.index <= b.index ? [a.index, b.index] : [b.index, a.index];
  const inner = a.parent.splice(start, end - start + 1, { id: loop.id, type: "forEach", label: loop.label ?? "Για κάθε", items: loop.items, steps: [] });
  a.parent[start].steps = inner;
  assertUniqueIds(d);
  return d;
}

/** Undo/redo history of definitions (the editor keeps one per open workflow). */
export class History {
  private past: DslDefinition[] = [];
  private future: DslDefinition[] = [];
  constructor(public current: DslDefinition) {}
  apply(next: DslDefinition) {
    this.past.push(this.current);
    this.current = next;
    this.future = [];
    return next;
  }
  undo() {
    const prev = this.past.pop();
    if (!prev) return this.current;
    this.future.push(this.current);
    this.current = prev;
    return prev;
  }
  redo() {
    const next = this.future.pop();
    if (!next) return this.current;
    this.past.push(this.current);
    this.current = next;
    return next;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
