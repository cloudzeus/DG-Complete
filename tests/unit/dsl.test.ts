import { describe, expect, it } from "vitest";
import { allIds, CommandError, History, insertAfter, insertInto, move, remove, update, wrapInForEach, type DslDefinition } from "@/lib/dsl/commands";
import { toGraph } from "@/lib/dsl/graph";

const def = (): DslDefinition => ({
  dslVersion: 1,
  steps: [
    { id: "a", type: "goto", label: "Πλοήγηση" },
    { id: "b", type: "fill", label: "ΑΦΜ", value: "{{input.afm}}" },
    { id: "c", type: "fill", label: "Επωνυμία", value: "{{input.name}}" },
    { id: "l", type: "forEach", label: "Επαφές", items: "{{input.contacts}}", steps: [{ id: "l1", type: "click", label: "Νέα επαφή" }] },
    { id: "d", type: "click", label: "Αποθήκευση" },
  ],
});

describe("dsl commands", () => {
  it("inserts after a step and at the start, never mutating the input", () => {
    const d0 = def();
    const d1 = insertAfter(d0, "a", { id: "x", type: "waitFor" });
    expect(allIds(d1.steps)).toEqual(["a", "x", "b", "c", "l", "l1", "d"]);
    expect(allIds(insertAfter(d0, null, { id: "y", type: "goto" }).steps)[0]).toBe("y");
    expect(allIds(d0.steps)).toEqual(["a", "b", "c", "l", "l1", "d"]);
  });
  it("inserts into containers only", () => {
    expect(allIds(insertInto(def(), "l", { id: "z", type: "fill" }).steps)).toEqual(["a", "b", "c", "l", "z", "l1", "d"]);
    expect(() => insertInto(def(), "a", { id: "z", type: "fill" })).toThrow(CommandError);
  });
  it("rejects duplicate ids", () => {
    expect(() => insertAfter(def(), "a", { id: "b", type: "fill" })).toThrow(CommandError);
  });
  it("moves within a level, into and out of a loop, not into itself", () => {
    expect(allIds(move(def(), "d", { afterId: "a" }).steps)).toEqual(["a", "d", "b", "c", "l", "l1"]);
    expect(allIds(move(def(), "b", { intoId: "l" }).steps)).toEqual(["a", "c", "l", "b", "l1", "d"]);
    expect(allIds(move(def(), "l1", { afterId: "d" }).steps)).toEqual(["a", "b", "c", "l", "d", "l1"]);
    expect(() => move(def(), "l", { intoId: "l" })).toThrow(CommandError);
  });
  it("removes and updates without touching ids or children", () => {
    expect(allIds(remove(def(), "l").steps)).toEqual(["a", "b", "c", "d"]);
    const u = update(def(), "l", { label: "Για κάθε επαφή", id: "hack" } as never);
    expect(u.steps![3].id).toBe("l");
    expect(u.steps![3].steps).toHaveLength(1);
  });
  it("wraps siblings in a forEach", () => {
    const w = wrapInForEach(def(), "b", "c", { id: "f", items: "{{input.rows}}" });
    expect(allIds(w.steps)).toEqual(["a", "f", "b", "c", "l", "l1", "d"]);
    expect(() => wrapInForEach(def(), "b", "l1", { id: "f2", items: "x" })).toThrow(CommandError);
  });
  it("keeps an undo/redo history", () => {
    const h = new History(def());
    h.apply(remove(h.current, "d"));
    expect(allIds(h.current.steps)).not.toContain("d");
    h.undo();
    expect(allIds(h.current.steps)).toContain("d");
    h.redo();
    expect(allIds(h.current.steps)).not.toContain("d");
  });
});

describe("toGraph", () => {
  it("builds input → steps → output with a loop group and collapsed forms", () => {
    const g = toGraph(def(), { collapseForms: true, inputs: ["afm"], outputs: ["code"] });
    expect(g.nodes.map((n) => n.id)).toEqual(["__input", "a", "form:b", "l", "l1", "d", "__output"]);
    expect(g.nodes.find((n) => n.id === "form:b")).toMatchObject({ kind: "form", stepIds: ["b", "c"], bindings: ["input.afm", "input.name"] });
    expect(g.nodes.find((n) => n.id === "l1")?.parentId).toBe("l");
    const intoForm = g.edges.find((e) => e.target === "l");
    expect(intoForm?.insertAfter).toBe("c");
    expect(g.edges.at(-1)).toMatchObject({ target: "__output", insertAfter: "d" });
  });
  it("handles an empty definition", () => {
    const g = toGraph({ steps: [] });
    expect(g.edges).toEqual([{ id: "__input->__output", source: "__input", target: "__output", insertAfter: null }]);
  });
});
