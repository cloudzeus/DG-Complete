"use client";

import { useSyncExternalStore } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Information modals instead of toasts, everywhere (docs/09): the same small API as sonner's
// `toast` (success / error / warning / message) so callers only change the import.

type Kind = "success" | "error" | "warning" | "info";
type Notice = { id: number; kind: Kind; title: string; description?: string };
type Opts = { description?: string };

let queue: Notice[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const push = (kind: Kind, title: unknown, opts?: Opts) => {
  const id = ++seq;
  queue = [...queue, { id, kind, title: String(title ?? ""), description: opts?.description }];
  emit();
  return id;
};

export const toast = Object.assign((title: unknown, opts?: Opts) => push("info", title, opts), {
  success: (title: unknown, opts?: Opts) => push("success", title, opts),
  error: (title: unknown, opts?: Opts) => push("error", title, opts),
  warning: (title: unknown, opts?: Opts) => push("warning", title, opts),
  message: (title: unknown, opts?: Opts) => push("info", title, opts),
  /** Kept for compatibility: a pending notice is not shown as a modal. */
  loading: (title?: unknown) => (void title, -1),
  dismiss: (id?: number) => {
    queue = id === undefined ? [] : queue.filter((n) => n.id !== id);
    emit();
  },
});

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const EMPTY: Notice[] = [];

const HEAD: Record<Kind, { label: string; icon: React.ReactNode }> = {
  success: { label: "Ολοκληρώθηκε", icon: <CheckCircle2 aria-hidden className="size-5 text-success-500" /> },
  error: { label: "Σφάλμα", icon: <AlertCircle aria-hidden className="size-5 text-danger-500" /> },
  warning: { label: "Προσοχή", icon: <AlertTriangle aria-hidden className="size-5 text-warning-500" /> },
  info: { label: "Ενημέρωση", icon: null },
};

/** Mounted once in the root layout: shows the notices one at a time. */
export function NoticeHost() {
  const items = useSyncExternalStore(subscribe, () => queue, () => EMPTY);
  const n = items[0];
  return (
    <Dialog open={!!n} onOpenChange={(o) => !o && n && toast.dismiss(n.id)}>
      <DialogContent className="sm:max-w-md" role={n?.kind === "error" ? "alertdialog" : "dialog"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {n && HEAD[n.kind].icon} {n?.description ? n.title : n && HEAD[n.kind].label}
          </DialogTitle>
          <DialogDescription>{n?.description ?? n?.title}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" autoFocus onClick={() => n && toast.dismiss(n.id)}>
            Εντάξει
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
