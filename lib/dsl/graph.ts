import { CONTAINER_TYPES, type DslDefinition, type DslStep } from "./commands";

// DSL → graph for the canvas (docs/19 §2). Nodes and edges are derived every time; they are never
// stored as a second definition. Containers (forEach / if) become group nodes with their children.

export type NodeKind = "input" | "navigate" | "form" | "action" | "check" | "read" | "loop" | "condition" | "human" | "helper" | "output";

export type GraphNode = { id: string; kind: NodeKind; label: string; no: string; parentId?: string; stepIds: string[]; bindings: string[]; type?: string; formId?: string };

/** A form captured by the live recorder (docs/04 §10): page image + fields, no values. */
export type CapturedForm = { title?: string; url?: string; image?: string; fields: { label: string; type: string; key?: string; kind: string; required?: boolean; options?: number }[] };
export type GraphEdge = { id: string; source: string; target: string; label?: string; insertAfter: string | null; parentId?: string };

const FORM = new Set(["fill", "select", "choose", "check", "upload"]);
const KIND: Record<string, NodeKind> = {
  goto: "navigate", navigate: "navigate", click: "action", press: "action", waitFor: "check", assert: "check", checkTargetErrors: "check",
  extract: "read", setVar: "read", forEach: "loop", if: "condition", humanTask: "human", screenshot: "helper", dialog: "helper", switchTab: "helper",
};

const bindingsOf = (s: DslStep) => [...JSON.stringify(s).matchAll(/\{\{\s*(input\.\w+)/g)].map((m) => m[1]);

export function toGraph(def: DslDefinition, opts: { collapseForms?: boolean; inputs?: string[]; outputs?: string[] } = {}) {
  const nodes: GraphNode[] = [{ id: "__input", kind: "input", label: "Είσοδος", no: "", stepIds: [], bindings: opts.inputs ?? [] }];
  const edges: GraphEdge[] = [];
  const pageOrder = new Map<string, number>();

  function level(steps: DslStep[], prefix: string, parentId: string | undefined, entry: string): string {
    let prev = entry;
    let i = 0;
    while (i < steps.length) {
      const s = steps[i];
      const no = prefix ? `${prefix}${String.fromCharCode(97 + i)}` : String(i + 1).padStart(2, "0");
      let node: GraphNode;
      let consumed = 1;
      const formId = typeof s.form === "string" ? s.form : undefined;
      if (formId) {
        // Steps of one captured form: one node, whatever their type.
        let j = i;
        while (j < steps.length && steps[j].form === formId) j++;
        const group = steps.slice(i, j);
        consumed = group.length;
        const f = (def.forms as Record<string, CapturedForm> | undefined)?.[formId];
        // Pages numbered in the order they appear in the flow (pages without steps are not counted).
        if (/^p\d+$/.test(formId) && !pageOrder.has(formId)) pageOrder.set(formId, pageOrder.size + 1);
        const pageNo = pageOrder.get(formId);
        const fieldsN = group.filter((g) => FORM.has(g.type)).length;
        node = { id: `form:${formId}`, kind: "form", label: `${pageNo ? `Σελίδα ${pageNo}` : "Φόρμα"}${f?.title ? ` · ${f.title}` : ""}${fieldsN ? ` · ${fieldsN} πεδία` : ""}`, no, parentId, stepIds: group.map((g) => g.id), bindings: group.flatMap(bindingsOf), formId };
      } else if (opts.collapseForms && FORM.has(s.type)) {
        let j = i;
        while (j < steps.length && FORM.has(steps[j].type)) j++;
        const group = steps.slice(i, j);
        consumed = group.length;
        node = group.length > 1
          ? { id: `form:${s.id}`, kind: "form", label: `Φόρμα · ${group.length} πεδία`, no, parentId, stepIds: group.map((g) => g.id), bindings: group.flatMap(bindingsOf) }
          : { id: s.id, kind: "form", label: s.label ?? s.type, no, parentId, stepIds: [s.id], bindings: bindingsOf(s), type: s.type };
      } else {
        node = { id: s.id, kind: KIND[s.type] ?? (FORM.has(s.type) ? "form" : "helper"), label: s.label ?? s.type, no, parentId, stepIds: [s.id], bindings: bindingsOf(s), type: s.type };
      }
      nodes.push(node);
      edges.push({ id: `${prev}->${node.id}`, source: prev, target: node.id, insertAfter: prev === entry && entry.startsWith("__") ? null : lastStepOf(prev), parentId });
      if (CONTAINER_TYPES.has(s.type) && s.steps?.length) level(s.steps, no, node.id, node.id);
      prev = node.id;
      i += consumed;
    }
    return prev;
  }

  const stepOfNode = new Map<string, string>();
  function lastStepOf(nodeId: string) {
    return stepOfNode.get(nodeId) ?? nodeId;
  }
  const last = level(def.steps ?? [], "", undefined, "__input");
  for (const n of nodes) if (n.stepIds.length) stepOfNode.set(n.id, n.stepIds[n.stepIds.length - 1]);
  for (const e of edges) if (e.insertAfter && stepOfNode.has(e.source)) e.insertAfter = stepOfNode.get(e.source)!;
  nodes.push({ id: "__output", kind: "output", label: "Έξοδος", no: "", stepIds: [], bindings: opts.outputs ?? [] });
  edges.push({ id: `${last}->__output`, source: last, target: "__output", insertAfter: last === "__input" ? null : (stepOfNode.get(last) ?? last) });
  return { nodes, edges };
}
