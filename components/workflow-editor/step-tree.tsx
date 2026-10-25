"use client";

import Link from "next/link";
import { useEffect } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { move, type DslDefinition, type DslStep } from "@/lib/dsl/commands";
import { STEP_TYPES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useDefinition } from "./use-definition";

// Step list with drag-and-drop (docs/09 §4): reorder within a level, drop on a «Για κάθε» / «Συνθήκη»
// header to move inside it. Keyboard: Tab to a handle, Space to pick up, arrows, Space to drop.

type Props = { tenantId: string; workflowId: string; definition: DslDefinition; updatedAt: string; selected?: string; hrefBase: string; canEdit: boolean };

function parentOf(steps: DslStep[], id: string, parent: string | null = null): string | null | undefined {
  for (const s of steps) {
    if (s.id === id) return parent;
    if (s.steps) {
      const p = parentOf(s.steps, id, s.id);
      if (p !== undefined) return p;
    }
  }
  return undefined;
}

export function StepTree(props: Props) {
  const { definition, apply, undo, redo, saving, canUndo, canRedo } = useDefinition(props);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!props.canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest("input,textarea,[contenteditable]")) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.canEdit, undo, redo]);

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over || over === id) return;
    const steps = definition.steps ?? [];
    if (over.startsWith("into:")) return apply((d) => move(d, id, { intoId: over.slice(5) }));
    const sameParent = parentOf(steps, id) === parentOf(steps, over);
    if (!sameParent) return apply((d) => move(d, id, { afterId: over }));
    // Same level: dragging down → after `over`, dragging up → before it.
    const level = (() => {
      const p = parentOf(steps, id);
      const find = (list: DslStep[]): DslStep[] | null => {
        for (const s of list) {
          if (s.id === p) return s.steps ?? [];
          const r = s.steps ? find(s.steps) : null;
          if (r) return r;
        }
        return null;
      };
      return p ? (find(steps) ?? []) : steps;
    })();
    const from = level.findIndex((s) => s.id === id);
    const to = level.findIndex((s) => s.id === over);
    if (to > from) apply((d) => move(d, id, { afterId: over }));
    else apply((d) => move(d, id, to === 0 ? { afterId: null, parentId: parentOf(steps, id) } : { afterId: level[to - 1].id }));
  }

  return (
    <div className="space-y-2">
      {props.canEdit && (
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={undo} disabled={!canUndo || saving} aria-label="Αναίρεση (Ctrl+Z)">
            <Undo2 aria-hidden />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={redo} disabled={!canRedo || saving} aria-label="Επανάληψη (Ctrl+Shift+Z)">
            <Redo2 aria-hidden />
          </Button>
          <span className="ml-auto text-2xs text-muted-foreground" aria-live="polite">
            {saving ? <Loader2 aria-label="Αποθήκευση" className="size-3.5 animate-spin" /> : "Σύρετε για αλλαγή σειράς"}
          </span>
        </div>
      )}
      {(definition.steps ?? []).length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Κανένα βήμα ακόμα.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <Level steps={definition.steps ?? []} prefix="" {...props} />
      </DndContext>
    </div>
  );
}

function Level({ steps, prefix, ...props }: Props & { steps: DslStep[]; prefix: string }) {
  return (
    <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
      <ol className="space-y-0.5">
        {steps.map((s, i) => (
          <Row key={s.id} step={s} no={prefix ? `${prefix}${String.fromCharCode(97 + i)}` : String(i + 1).padStart(2, "0")} {...props} />
        ))}
      </ol>
    </SortableContext>
  );
}

function Row({ step, no, ...props }: Props & { step: DslStep; no: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: !props.canEdit });
  const container = step.type === "forEach" || step.type === "if";
  const { setNodeRef: setIntoRef, isOver: overInto } = useDroppable({ id: `into:${step.id}`, disabled: !container || !props.canEdit });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "relative z-10 opacity-80")}>
      <div className={cn("flex items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm", step.id === props.selected ? "bg-sisyphus-50 font-semibold text-sisyphus-700" : "hover:bg-muted/60", isDragging && "bg-card shadow-fluent-8")}>
        {props.canEdit ? (
          <button type="button" className="cursor-grab touch-none rounded-xs p-0.5 text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-sisyphus-500 active:cursor-grabbing" aria-label={`Μετακίνηση βήματος ${no}`} {...attributes} {...listeners}>
            <GripVertical aria-hidden className="size-3.5" />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Link href={`${props.hrefBase}${step.id}`} className="flex min-w-0 flex-1 items-center gap-2" aria-current={step.id === props.selected ? "true" : undefined}>
          <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">{no}</span>
          <span className="min-w-0 flex-1 truncate">{step.label ?? step.type}</span>
          <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">{STEP_TYPES[step.type] ?? step.type}</span>
        </Link>
      </div>
      {container && (
        <div className="ml-5 border-l border-border/70 pl-2">
          <div ref={setIntoRef} className={cn("my-0.5 rounded-xs border border-dashed px-2 py-1 text-2xs text-muted-foreground", overInto ? "border-sisyphus-500 bg-sisyphus-50 text-sisyphus-700" : "border-transparent")}>
            {props.canEdit ? "Αφήστε εδώ για να μπει μέσα" : ""}
          </div>
          <Level steps={step.steps ?? []} prefix={no} {...props} />
        </div>
      )}
    </li>
  );
}
