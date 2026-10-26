"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useRouter } from "next/navigation";
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, getSmoothStepPath,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Camera, CheckSquare, CircleDot, ListChecks, FileInput, FileOutput, FormInput, Hand, Loader2, MousePointerClick, Navigation, Plus, Repeat, ScanText, Split, Wrench, type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { insertAfter, type DslDefinition } from "@/lib/dsl/commands";
import { toGraph, type CapturedForm, type GraphNode, type NodeKind } from "@/lib/dsl/graph";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
// Compact horizontal cards (11rem × 3.5rem at the 14px root) — ELK lays out with these sizes.
const W = 154;
const H = 49;
const elk = new ELK();

export type StepRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
type StepNodeData = GraphNode & { selected: boolean; run?: StepRunStatus; onForm?: (formId: string, view: "image" | "fields") => void; hasImage?: boolean };
export type CanvasForm = CapturedForm & { imageUrl?: string };

const KIND_LABEL: Record<string, string> = { input: "Είσοδος API", username: "Χρήστης (διαπιστευτήριο)", password: "Κωδικός (διαπιστευτήριο)", unmapped: "— δεν χρησιμοποιείται" };

const RUN_LABEL: Record<StepRunStatus, string> = { RUNNING: "Εκτελείται", SUCCEEDED: "Ολοκληρώθηκε", FAILED: "Απέτυχε", SKIPPED: "Παραλείφθηκε" };

/** Status of a node from its steps in the latest run (a collapsed form groups several). */
function nodeStatus(ids: string[], status?: Record<string, StepRunStatus>): StepRunStatus | undefined {
  const all = ids.map((id) => status?.[id]).filter((v): v is StepRunStatus => !!v);
  if (!all.length) return undefined;
  if (all.includes("FAILED")) return "FAILED";
  if (all.includes("RUNNING")) return "RUNNING";
  if (all.every((v) => v === "SKIPPED")) return "SKIPPED";
  return "SUCCEEDED";
}
type InsertEdgeData = { insertAfter: string | null; canEdit: boolean; onInsert: (afterId: string | null, type: string) => void };

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const Icon = ICON[data.kind] ?? CircleDot;
  const terminal = data.kind === "input" || data.kind === "output";
  return (
    <div
      className={cn(
        "h-14 w-44 overflow-hidden rounded-md border bg-card px-2 py-1.5 text-left shadow-fluent-2 transition-shadow duration-150 hover:shadow-fluent-8",
        data.selected ? "border-sisyphus-500 ring-2 ring-sisyphus-500/25" : "border-border/80",
        terminal && "bg-muted/60",
        data.run === "SUCCEEDED" && !data.selected && "border-success-500",
        data.run === "FAILED" && "border-danger-500 ring-2 ring-danger-500/25",
        data.run === "RUNNING" && "border-sisyphus-500 ring-2 ring-sisyphus-500/40 animate-pulse motion-reduce:animate-none",
        data.run === "SKIPPED" && "opacity-60",
      )}
      title={data.run ? `${data.label} — ${RUN_LABEL[data.run]}` : undefined}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" isConnectable={false} />
      <div className="flex items-center gap-1.5">
        <span className={cn("grid size-5 shrink-0 place-items-center rounded-xs", terminal ? "bg-card text-muted-foreground" : "bg-sisyphus-50 text-sisyphus-600")}>
          <Icon aria-hidden className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-2xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {data.no ? `${data.no} · ${data.type ? (STEP_TYPES[data.type] ?? data.type) : data.kind}` : data.label}
        </span>
        {data.formId && data.onForm && (
          <span className="nodrag nopan flex shrink-0 gap-0.5" data-form-btn>
            {data.hasImage && (
              <button type="button" aria-label="Στιγμιότυπο της φόρμας" title="Στιγμιότυπο της φόρμας" onClick={(e) => (e.stopPropagation(), data.onForm!(data.formId!, "image"))} className="grid size-5 place-items-center rounded-xs text-muted-foreground hover:bg-sisyphus-50 hover:text-sisyphus-600 focus-visible:outline-2 focus-visible:outline-sisyphus-500">
                <Camera aria-hidden className="size-3" />
              </button>
            )}
            <button type="button" aria-label="Πεδία της φόρμας" title="Πεδία της φόρμας" onClick={(e) => (e.stopPropagation(), data.onForm!(data.formId!, "fields"))} className="grid size-5 place-items-center rounded-xs text-muted-foreground hover:bg-sisyphus-50 hover:text-sisyphus-600 focus-visible:outline-2 focus-visible:outline-sisyphus-500">
              <ListChecks aria-hidden className="size-3" />
            </button>
          </span>
        )}
      </div>
      {terminal ? (
        <span className="mt-0.5 block truncate font-mono text-2xs text-muted-foreground">{data.bindings.map((b) => b.replace(/^input\./, "")).join(" · ") || "—"}</span>
      ) : (
        <span className="mt-0.5 block truncate text-xs font-medium" title={data.label}>
          {data.label}
          {data.bindings.length > 0 && <span className="ml-1 font-mono text-2xs font-normal text-muted-foreground">{data.bindings.map((b) => b.replace(/^input\./, "")).join(", ")}</span>}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="opacity-0" isConnectable={false} />
    </div>
  );
}

const INSERT_TYPES = ["goto", "fill", "select", "click", "waitFor", "assert", "extract", "forEach", "if", "humanTask"];

function InsertEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<InsertEdgeData>>) {
  const [path, x, y] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 6 });
  return (
    <>
      <BaseEdge id={id} path={path} className="stroke-sisyphus-300! motion-reduce:[animation:none]!" style={{ strokeWidth: 1.25 }} />
      {data?.canEdit && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan pointer-events-auto absolute" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Προσθήκη βήματος εδώ" className="grid size-4 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-fluent-2 transition-colors duration-150 hover:border-sisyphus-500 hover:text-sisyphus-600 focus-visible:outline-2 focus-visible:outline-sisyphus-500">
                  <Plus aria-hidden className="size-2.5" />
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
  /** Step statuses of the latest run (live while it runs). */
  runStatus?: Record<string, StepRunStatus>;
  /** Forms captured by the live recorder, with a signed image URL. */
  forms?: Record<string, CanvasForm>;
}) {
  const [openForm, setOpenForm] = useState<{ id: string; view: "image" | "fields" } | null>(null);
  const router = useRouter();
  const { definition, apply, saving } = useDefinition(props);
  const graph = useMemo(() => toGraph(definition, { collapseForms: false, inputs: props.inputs, outputs: props.outputs }), [definition, props.inputs, props.outputs]);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    elk
      .layout({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.spacing.nodeNode": "20", "elk.layered.spacing.nodeNodeBetweenLayers": "40" },
        children: graph.nodes.map((n) => ({ id: n.id, width: W, height: H })),
        edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      })
      .then((r) => {
        if (!cancelled) setPositions(new Map((r.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: (c.y ?? 0) + (graph.nodes.find((n) => n.id === c.id)?.parentId ? 12 : 0) }])));
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
    data: { ...n, selected: n.stepIds.includes(props.selected ?? ""), run: nodeStatus(n.stepIds, props.runStatus), onForm: (id, view) => setOpenForm({ id, view }), hasImage: !!(n.formId && props.forms?.[n.formId]?.imageUrl) },
    draggable: false,
    connectable: false,
    selectable: n.stepIds.length > 0,
  }));
  const edges: Edge<InsertEdgeData>[] = graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "insert", animated: true, data: { insertAfter: e.insertAfter, canEdit: props.canEdit, onInsert } }));

  // Discreet entrance of the nodes (GSAP, 240 ms, 30 ms stagger) — skipped with prefers-reduced-motion.
  const box = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!positions.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".react-flow__node", { opacity: 0, x: -6, duration: 0.24, ease: "power1.out", stagger: 0.03 });
    },
    { scope: box, dependencies: [positions.size > 0] },
  );

  return (
    <div ref={box} className="relative h-56 w-full overflow-hidden rounded-lg border border-border/70 bg-muted/30">
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
        fitViewOptions={{ padding: { top: 0.1, bottom: 0.3, left: 0.05, right: 0.05 }, maxZoom: 1, minZoom: 0.6 }}
        minZoom={0.2}
        nodesConnectable={false}
        onNodeClick={(e, n) => {
          if ((e.target as HTMLElement).closest("[data-form-btn]")) return;
          const step = (n.data as StepNodeData).stepIds[0];
          if (step) router.push(`${props.hrefBase}${step}`, { scroll: false });
        }}
        proOptions={{ hideAttribution: true }}
        aria-label="Καμβάς ροής"
      >
        <Background gap={16} size={1} />
        <MiniMap pannable zoomable nodeClassName="fill-sisyphus-200! stroke-sisyphus-500!" nodeBorderRadius={4} maskColor="rgb(243 242 241 / 0.6)" style={{ width: 120, height: 48 }} className="m-2! hidden! md:block!" />
        <Controls showInteractive={false} orientation="horizontal" position="bottom-left" className="m-2!" />
      </ReactFlow>}
      {saving && <span className="absolute top-2 right-2 rounded-sm bg-card px-2 py-1 text-2xs text-muted-foreground shadow-fluent-2">Αποθήκευση…</span>}
      <FormDialog form={openForm ? props.forms?.[openForm.id] : undefined} view={openForm?.view} onClose={() => setOpenForm(null)} />
    </div>
  );
}

/** Captured form: page image (passwords masked) or its fields and the API inputs they map to. */
function FormDialog({ form, view, onClose }: { form?: CanvasForm; view?: "image" | "fields"; onClose: () => void }) {
  return (
    <Dialog open={!!form} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={view === "image" ? "sm:max-w-5xl" : "sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{form?.title ?? "Φόρμα"}</DialogTitle>
          <DialogDescription>{form?.url ? <span className="font-mono text-xs">{form.url}</span> : null} {view === "image" ? "· η σελίδα τη στιγμή του capture, με μασκαρισμένους κωδικούς" : `· ${form?.fields.length ?? 0} πεδία`}</DialogDescription>
        </DialogHeader>
        {view === "image" && form?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
          <img src={form.imageUrl} alt={`Στιγμιότυπο της φόρμας ${form.title ?? ""}`} className="w-full rounded-md border border-border/70" />
        ) : (
          <div className="max-h-[60dvh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Πεδίο</th>
                  <th className="py-1.5 pr-3 font-medium">Τύπος</th>
                  <th className="py-1.5 pr-3 font-medium">Στο API</th>
                </tr>
              </thead>
              <tbody>
                {form?.fields.map((f, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3">
                      {f.label}
                      {f.required && <span className="ml-1 text-danger-500" aria-label="υποχρεωτικό">*</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{f.type}{f.options ? ` · ${f.options} επιλογές` : ""}</td>
                    <td className="py-1.5 pr-3">{f.key ? <code className="font-mono text-xs">{f.key}</code> : <span className="text-muted-foreground">{KIND_LABEL[f.kind] ?? f.kind}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
