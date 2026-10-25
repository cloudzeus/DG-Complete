"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveDefinitionAction } from "@/lib/actions/tenant";
import { CommandError, History, type DslDefinition } from "@/lib/dsl/commands";

// Client state of the editor: applies lib/dsl commands optimistically, saves the whole definition
// through a Server Action (optimistic concurrency) and refreshes the server-rendered parts.
export function useDefinition(opts: { tenantId: string; workflowId: string; definition: DslDefinition; updatedAt: string }) {
  const router = useRouter();
  const [history, setHistory] = useState(() => new History(opts.definition));
  const [definition, setDefinition] = useState(opts.definition);
  const [updatedAt, setUpdatedAt] = useState(opts.updatedAt);
  const [seenProp, setSeenProp] = useState(opts.updatedAt);
  // A server version we did not produce (another user, another tab): start over from it.
  if (opts.updatedAt !== seenProp) {
    setSeenProp(opts.updatedAt);
    if (opts.updatedAt !== updatedAt) {
      setHistory(new History(opts.definition));
      setDefinition(opts.definition);
      setUpdatedAt(opts.updatedAt);
    }
  }
  const [saving, start] = useTransition();
  const [, force] = useState(0);

  const save = useCallback(
    (next: DslDefinition) =>
      start(async () => {
        const r = await saveDefinitionAction(opts.tenantId, opts.workflowId, updatedAt, next);
        if (!r.ok) {
          toast.error(r.message);
          if (r.conflict) router.refresh();
          return;
        }
        setUpdatedAt(r.updatedAt);
        router.refresh();
      }),
    [opts.tenantId, opts.workflowId, updatedAt, router],
  );

  const apply = useCallback(
    (fn: (d: DslDefinition) => DslDefinition) => {
      try {
        const next = history.apply(fn(history.current));
        setDefinition(next);
        save(next);
      } catch (err) {
        toast.error(err instanceof CommandError ? err.message : "Η αλλαγή δεν εφαρμόστηκε.");
      }
    },
    [history, save],
  );

  const undo = useCallback(() => {
    if (!history.canUndo) return;
    const d = history.undo();
    setDefinition(d);
    save(d);
    force((n) => n + 1);
  }, [history, save]);
  const redo = useCallback(() => {
    if (!history.canRedo) return;
    const d = history.redo();
    setDefinition(d);
    save(d);
    force((n) => n + 1);
  }, [history, save]);

  return { definition, apply, undo, redo, saving, canUndo: history.canUndo, canRedo: history.canRedo };
}

export const newStepId = () => `s${Math.random().toString(36).slice(2, 8)}`;
