"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Hand, Loader2, Lock, Timer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Attention } from "@/lib/data/tenant";
import { cn } from "@/lib/utils";

type Box = { x: number; y: number; width: number; height: number };
type State = {
  label: string;
  reason: "humanTask" | "captcha";
  instructions: string;
  mode: "focus" | "full";
  fields: { key: string; label: string; type: string }[];
  deadline: number;
  viewport: { width: number; height: number };
  boxes: Box[];
  lockedBy: string | null;
};
type Result = { message?: string; ignored?: boolean; done?: boolean; cancelled?: boolean; lockedBy?: string };

// Live assist (docs/22 §2): the operator sees the waiting run's page and completes OTP / CAPTCHA.
// In focus mode only the marked elements take clicks and typing; the rest of the image is veiled.
export function AssistPanel({ tenantId, runId, attention }: { tenantId: string; runId: string; attention: Attention }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState<number | null>(null); // set after mount: no server/client clock mismatch
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [finished, setFinished] = useState<null | "done" | "cancelled">(null);
  const keys = useRef<HTMLDivElement>(null);
  const buffer = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const send = useCallback(
    (action: Record<string, unknown>): Promise<Result | null> => {
      const run = queue.current.then(async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/assist/${runId}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, action }) });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setUnavailable(body.title ?? "Η ζωντανή προβολή δεν είναι διαθέσιμη.");
            return null;
          }
          if (body.state) setState(body.state);
          const r = (body.result ?? {}) as Result;
          setLockedBy(r.lockedBy ?? null);
          if (r.message) setMessage(r.message);
          else if (!r.ignored) setMessage(null);
          if (r.done) {
            setFinished(r.cancelled ? "cancelled" : "done");
            setTimeout(() => router.refresh(), 1200);
          }
          return r;
        } finally {
          setBusy(false);
          setTick((t) => t + 1);
        }
      });
      queue.current = run.then(() => undefined, () => undefined);
      return run;
    },
    [runId, tenantId, router],
  );

  // Open once (takes the operator lock), then refresh the image ~3×/s and the state every 3 s.
  useEffect(() => {
    void send({ type: "open" });
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.04;
      o.frequency.value = 880;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.15);
    } catch {
      // no sound without an earlier interaction — fine
    }
    const frame = setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), 350);
    const st = setInterval(() => document.visibilityState === "visible" && void send({ type: "state" }), 3000);
    const first = setTimeout(() => setNow(Date.now()), 0);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const release = () => navigator.sendBeacon?.(`/api/assist/${runId}/action`, new Blob([JSON.stringify({ tenantId, action: { type: "release" } })], { type: "application/json" }));
    window.addEventListener("pagehide", release);
    return () => {
      clearInterval(frame);
      clearInterval(st);
      clearInterval(clock);
      clearTimeout(first);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [send, runId, tenantId]);

  const flush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const text = buffer.current;
    buffer.current = "";
    if (text) void send({ type: "text", text });
  }, [send]);

  const deadline = state?.deadline ?? new Date(attention.deadline).getTime();
  const left = now === null ? null : Math.max(0, Math.round((deadline - now) / 1000));
  const vp = state?.viewport ?? { width: 1280, height: 800 };

  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    keys.current?.focus();
    flush();
    const r = e.currentTarget.getBoundingClientRect();
    void send({ type: "click", x: ((e.clientX - r.left) / r.width) * vp.width, y: ((e.clientY - r.top) / r.height) * vp.height });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (e.key.length === 1) {
      buffer.current += e.key;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flush, 250);
      return;
    }
    flush();
    if (["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(e.key)) void send({ type: "key", key: e.key });
  };

  const submitFields = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values: Record<string, string> = {};
    for (const f of state?.fields ?? []) values[f.key] = String(fd.get(f.key) ?? "").trim();
    e.currentTarget.reset();
    void send({ type: "fields", values });
  };

  if (finished) {
    return (
      <section role="status" className="mb-4 flex items-center gap-3 rounded-lg border border-border/70 bg-card p-4 shadow-fluent-2">
        {finished === "done" ? <CheckCircle2 aria-hidden className="size-5 text-success-500" /> : <XCircle aria-hidden className="size-5 text-danger-500" />}
        <p className="text-sm font-medium">{finished === "done" ? "Ολοκληρώθηκε· η εκτέλεση συνεχίζει." : "Η εκτέλεση ακυρώθηκε."}</p>
      </section>
    );
  }

  const title = state?.label ?? attention.label;
  const instructions = state?.instructions ?? attention.instructions;
  const fields = state?.fields ?? attention.fields.map((f) => ({ ...f, type: "string" }));

  return (
    <section aria-labelledby="assist-title" className="mb-4 rounded-lg border border-warning-500/40 bg-card shadow-fluent-2">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-1">
          <p className="eyebrow flex items-center gap-1.5 text-warning-600"><Hand aria-hidden className="size-3.5" /> Χρειάζεται ενέργεια</p>
          <h2 id="assist-title" className="text-lg font-semibold">{title}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{instructions}</p>
        </div>
        <div className={cn("flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-sm tabular-nums", left !== null && left < 120 ? "bg-danger-50 text-danger-500" : "bg-muted")} aria-label="Χρόνος που απομένει">
          <Timer aria-hidden className="size-4" /> {left === null ? "—" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
        </div>
      </header>

      {unavailable ? (
        <p className="flex items-start gap-2 p-4 text-sm sm:p-5"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-500" /> {unavailable}</p>
      ) : lockedBy ? (
        <p className="flex items-center gap-2 p-4 text-sm sm:p-5"><Lock aria-hidden className="size-4 text-muted-foreground" /> Σε χρήση από {lockedBy}. Θα μπορέσετε να συνεχίσετε όταν κλείσει την προβολή.</p>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-2">
            <div ref={keys} tabIndex={0} onKeyDown={onKeyDown} onPaste={(e) => (e.preventDefault(), flush(), void send({ type: "text", text: e.clipboardData.getData("text").slice(0, 500) }))} className="relative overflow-hidden rounded-md border border-border/70 outline-none focus-visible:ring-2 focus-visible:ring-sisyphus-500/40" aria-label="Η σελίδα του συστήματος">
              {/* eslint-disable-next-line @next/next/no-img-element -- live frame, not stored */}
              <img
                src={`/api/assist/${runId}/frame?tenantId=${encodeURIComponent(tenantId)}&t=${tick}`}
                alt="Η σελίδα της εκτέλεσης"
                width={vp.width}
                height={vp.height}
                draggable={false}
                onClick={onClick}
                onWheel={(e) => void send({ type: "scroll", dy: e.deltaY })}
                className="block h-auto w-full cursor-pointer bg-muted select-none"
              />
              {state?.mode === "focus" && (
                <svg aria-hidden viewBox={`0 0 ${vp.width} ${vp.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
                  <defs>
                    <mask id={`assist-${runId}`}>
                      <rect width={vp.width} height={vp.height} fill="white" />
                      {state.boxes.map((b, i) => <rect key={i} x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx="4" fill="black" />)}
                    </mask>
                  </defs>
                  <rect width={vp.width} height={vp.height} fill="rgb(243 242 241 / 0.72)" mask={`url(#assist-${runId})`} />
                  {state.boxes.map((b, i) => <rect key={i} x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx="4" fill="none" stroke="#0078D4" strokeWidth="2" />)}
                </svg>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {state?.mode === "full" ? "Πλήρης έλεγχος: κλικ και πληκτρολόγηση σε όλη τη σελίδα." : "Κλικ και πληκτρολόγηση μόνο στα σημειωμένα με μπλε πεδία."}
              {busy && <Loader2 aria-hidden className="ml-2 inline size-3 animate-spin" />}
            </p>
            {message && <p role="status" className="rounded-sm bg-sisyphus-50 px-3 py-2 text-sm text-sisyphus-700">{message}</p>}
          </div>

          <div className="space-y-4">
            {fields.length > 0 && (
              <form onSubmit={submitFields} className="space-y-3 rounded-md border border-border/70 p-3" autoComplete="off">
                <p className="text-sm font-medium">Πληκτρολογήστε εδώ</p>
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`assist-${f.key}`}>{f.label}</Label>
                    <Input id={`assist-${f.key}`} name={f.key} required autoComplete="one-time-code" inputMode={/otp|code|pin/i.test(f.key) ? "numeric" : undefined} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Η τιμή συμπληρώνεται στη σελίδα και δεν αποθηκεύεται πουθενά.</p>
                <Button type="submit" className="w-full" disabled={busy}>Αποστολή στη σελίδα</Button>
              </form>
            )}
            <div className="flex flex-col gap-2">
              <Button type="button" variant={fields.length ? "outline" : "default"} disabled={busy} onClick={() => (flush(), void send({ type: "complete" }))}>
                <CheckCircle2 aria-hidden /> Ολοκληρώθηκε
              </Button>
              <Button type="button" variant="ghost" className="text-danger-500" disabled={busy} onClick={() => setConfirmCancel(true)}>
                <XCircle aria-hidden /> Αδυναμία — ακύρωση
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ακύρωση της εκτέλεσης</DialogTitle>
            <DialogDescription>Η εκτέλεση σταματά χωρίς χρέωση. Μπορείτε να την ξανατρέξετε αργότερα από τη σελίδα της.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmCancel(false)}>Πίσω</Button>
            <Button type="button" variant="destructive" onClick={() => (setConfirmCancel(false), void send({ type: "cancel" }))}>Ακύρωση εκτέλεσης</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
