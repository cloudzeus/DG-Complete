"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, getSmoothStepPath,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  CheckSquare, CircleDot, FileInput, FileOutput, FormInput, Hand, Loader2, MousePointerClick, Navigation, Plus, Repeat, ScanText, Split, Wrench, type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { insertAfter, type DslDefinition } from "@/lib/dsl/commands";
import { toGraph, type GraphNode, type NodeKind } from "@/lib/dsl/graph";
import { STEP_TYPES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { newStepId, useDefinition } from "./use-definition";

// Visual canvas (docs/19, P07b): derived from the DSL every render (never stored as a second
// definition), laid out with ELK, «+» on an edge inserts a step through lib/dsl/commands.
// The run overlay / heatmap arrive with the worker (P08/P09).

const ICON: Record<NodeKind, LucideIcon> = {
  input: FileInput, navigate: Navigation, form: FormInput, action: MousePointerClick, check: CheckSquare, read: ScanText,
  loop: Repeat, condition: Split, human: Hand, helper: Wrench, output: FileOutput,
};
const W = 240;
const H = 88; // card height (h-22) — ELK lays out with it
const elk = new ELK();

type StepNodeData = GraphNode & { selected: boolean };
type InsertEdgeData = { insertAfter: string | null; canEdit: boolean; onInsert: (afterId: string | null, type: string) => void };

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const Icon = ICON[data.kind] ?? CircleDot;
  const terminal = data.kind === "input" || data.kind === "output";
  return (
    <div
      className={cn(
        "h-22 w-60 overflow-hidden rounded-lg border bg-card px-3 py-2 text-left shadow-fluent-2 transition-shadow duration-150 hover:shadow-fluent-8",
        data.selected ? "border-sisyphus-500 ring-2 ring-sisyphus-500/25" : "border-border/80",
        terminal && "bg-muted/60",
      )}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" isConnectable={false} />
      <div className="flex items-center gap-2">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-sm", terminal ? "bg-card text-muted-foreground" : "bg-sisyphus-50 text-sisyphus-600")}>
          <Icon aria-hidden className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block truncate">{data.no ? `${data.no} · ${data.type ? (STEP_TYPES[data.type] ?? data.type) : data.kind}` : data.label}</span>
          {!terminal && <span className="block truncate text-sm font-medium">{data.label}</span>}
        </span>
      </div>
      {data.bindings.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.bindings.slice(0, 3).map((b) => (
            <span key={b} className="rounded-xs bg-muted px-1 font-mono text-2xs">
              {b.replace(/^input\./, "")}
            </span>
          ))}
          {data.bindings.length > 3 && <span className="text-2xs text-muted-foreground">+{data.bindings.length - 3}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" isConnectable={false} />
    </div>
  );
}

const INSERT_TYPES = ["goto", "fill", "select", "click", "waitFor", "assert", "extract", "forEach", "if", "humanTask"];

function InsertEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<InsertEdgeData>>) {
  const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  return (
    <>
      <BaseEdge id={id} path={path} className="stroke-border!" style={{ strokeWidth: 1.5 }} />
      {data?.canEdit && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-auto absolute" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Προσθήκη βήματος εδώ" className="grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-fluent-2 transition-colors duration-150 hover:border-sisyphus-500 hover:text-sisyphus-600 focus-visible:outline-2 focus-visible:outline-sisyphus-500">
                  <Plus aria-hidden className="size-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="center">
                <p className="eyebrow px-2 py-1">Νέο βήμα</p>
                {INSERT_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => data.onInsert(data.insertAfter, t)} className="block w-full rounded-xs px-2 py-1.5 text-left text-sm hover:bg-muted">
                    {STEP_TYPES[t] ?? t}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { step: StepNode };
const edgeTypes = { insert: InsertEdge };

export function WorkflowCanvas(props: {
  tenantId: string;
  workflowId: string;
  definition: DslDefinition;
  updatedAt: string;
  selected?: string;
  hrefBase: string;
  canEdit: boolean;
  inputs: string[];
  outputs: string[];
}) {
  const router = useRouter();
  const { definition, apply, saving } = useDefinition(props);
  const graph = useMemo(() => toGraph(definition, { collapseForms: false, inputs: props.inputs, outputs: props.outputs }), [definition, props.inputs, props.outputs]);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    elk
      .layout({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered", "elk.direction": "DOWN", "elk.spacing.nodeNode": "28", "elk.layered.spacing.nodeNodeBetweenLayers": "36" },
        children: graph.nodes.map((n) => ({ id: n.id, width: W, height: H })),
        edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      })
      .then((r) => {
        if (!cancelled) setPositions(new Map((r.children ?? []).map((c) => [c.id, { x: (c.x ?? 0) + (graph.nodes.find((n) => n.id === c.id)?.parentId ? 40 : 0), y: c.y ?? 0 }])));
      });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  const onInsert = (afterId: string | null, type: string) =>
    apply((d) => insertAfter(d, afterId, { id: newStepId(), type, label: STEP_TYPES[type] ?? type, ...(type === "forEach" || type === "if" ? { steps: [] } : {}) }));

  const nodes: Node<StepNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "step",
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    // Controlled nodes without onNodesChange are never "measured": give React Flow the size we laid out.
    width: W,
    height: H,
    data: { ...n, selected: n.stepIds.includes(props.selected ?? "") },
    draggable: false,
    connectable: false,
    selectable: n.stepIds.length > 0,
  }));
  const edges: Edge<InsertEdgeData>[] = graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "insert", data: { insertAfter: e.insertAfter, canEdit: props.canEdit, onInsert } }));

  return (
    <div className="relative h-[min(70dvh,40rem)] min-h-96 w-full overflow-hidden rounded-lg border border-border/70 bg-muted/30">
      {positions.size === 0 && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          <Loader2 aria-label="Διάταξη" className="size-5 animate-spin" />
        </div>
      )}
      {positions.size > 0 && <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1, minZoom: 0.8 }}
        minZoom={0.2}
        nodesConnectable={false}
        onNodeClick={(_, n) => {
          const step = (n.data as StepNodeData).stepIds[0];
          if (step) router.push(`${props.hrefBase}${step}`, { scroll: false });
        }}
        proOptions={{ hideAttribution: true }}
        aria-label="Καμβάς ροής"
      >
        <Background gap={16} size={1} />
        <MiniMap pannable zoomable nodeClassName="fill-sisyphus-200! stroke-sisyphus-500!" nodeBorderRadius={4} maskColor="rgb(243 242 241 / 0.6)" className="hidden! md:block!" />
        <Controls showInteractive={false} />
      </ReactFlow>}
      {saving && <span className="absolute top-2 right-2 rounded-sm bg-card px-2 py-1 text-2xs text-muted-foreground shadow-fluent-2">Αποθήκευση…</span>}
    </div>
  );
}
