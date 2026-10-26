"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardList, Loader2, MousePointerClick, ScanText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STEP_TYPES } from "@/lib/labels";
import type { ElementInfo } from "@/lib/recorder/describe";
import { cn } from "@/lib/utils";

// Live recorder (docs/04 §10): the server-side browser shown as an image; clicks, keys and scroll
// are forwarded to it, each action becomes a step. Values typed here go to the page only.

type Step = { id: string; type: string; label: string; value?: string; into?: string; form?: string };
type State = { id: string; name: string; url: string; steps: Step[]; inputs: { key: string; label: string }[]; viewport: { width: number; height: number } };
type FieldKind = "input" | "username" | "password" | "skip";

export function LiveRecorder({ tenantId, initial, finish, cancel }: { tenantId: string; initial: State; finish: React.ReactNode; cancel: React.ReactNode }) {
  const [state, setState] = useState(initial);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"interact" | "extract">("interact");
  const [url, setUrl] = useState(initial.url);
  const [select, setSelect] = useState<ElementInfo | null>(null);
  const [fields, setFields] = useState<(ElementInfo & { kind: FieldKind })[] | null>(null);
  const [extractAt, setExtractAt] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<{ title: string; text: string; error?: boolean } | null>(null);
  const [blocked, setBlocked] = useState<{ origin: string; url: string } | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const keys = useRef<HTMLDivElement>(null);
  const buffer = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef(Promise.resolve());

  const send = useCallback(
    (action: Record<string, unknown>) => {
      // Actions run in order: a click must reach the page before the text that follows it.
      const run = queue.current.then(async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/recorder/${state.id}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, action }) });
          const body = await res.json();
          if (!res.ok) {
            setNotice({ title: "Η ενέργεια δεν ολοκληρώθηκε", text: body.title ?? "Δοκιμάστε ξανά.", error: true });
            return null;
          }
          setState(body.state);
          setUrl(body.state.url);
          if (body.result?.blocked) setBlocked(body.result.blocked);
          else if (body.result?.message) setNotice({ title: "Καταγραφή", text: body.result.message });
          return body.result as { select?: ElementInfo; fields?: ElementInfo[] };
        } finally {
          setBusy(false);
          setTick((t) => t + 1);
        }
      });
      queue.current = run.then(() => undefined, () => undefined);
      return run;
    },
    [state.id, tenantId],
  );

  // Refresh the image ~3 times a second while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), 350);
    return () => clearInterval(id);
  }, []);

  const flush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const text = buffer.current;
    buffer.current = "";
    if (text) void send({ type: "text", text });
  }, [send]);

  const point = (e: React.MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * state.viewport.width, y: ((e.clientY - r.top) / r.height) * state.viewport.height };
  };

  const onClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    keys.current?.focus();
    flush();
    const p = point(e);
    if (mode === "extract") {
      setExtractAt(p);
      return;
    }
    const r = await send({ type: "click", ...p });
    if (r?.select) setSelect(r.select);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1) {
      e.preventDefault();
      buffer.current += e.key;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flush, 250);
      return;
    }
    e.preventDefault();
    flush();
    void send({ type: "key", key: e.key });
  };

  const capture = async () => {
    flush();
    const r = await send({ type: "capture" });
    if (!r?.fields) return;
    if (!r.fields.length) return setNotice({ title: "Capture πεδίων", text: "Δεν βρέθηκαν πεδία φόρμας σε αυτή τη σελίδα." });
    const pw = r.fields.findIndex((f) => (f.type ?? "").toLowerCase() === "password");
    setFields(r.fields.map((f, i) => ({ ...f, kind: i === pw ? "password" : pw > 0 && i === pw - 1 ? "username" : "input" })));
  };

  const fieldLabel = (f: ElementInfo) => f.label ?? f.ariaLabel ?? f.placeholder ?? f.name ?? f.id ?? "Πεδίο";

  return (
    <div className="grid gap-4 *:min-w-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-fluent-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-2">
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Πίσω" onClick={() => void send({ type: "back" })}>
            <ArrowLeft aria-hidden />
          </Button>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ type: "navigate", url });
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Διεύθυνση" className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 font-mono text-xs" />
            <Button type="submit" size="sm" variant="outline" aria-label="Μετάβαση">
              <ArrowRight aria-hidden />
            </Button>
          </form>
          {busy && <Loader2 aria-label="Εκτελείται" className="size-4 animate-spin text-sisyphus-600 motion-reduce:animate-none" />}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/40 p-2">
          <div role="radiogroup" aria-label="Λειτουργία" className="inline-flex rounded-sm border border-border bg-card p-0.5">
            <button type="button" role="radio" aria-checked={mode === "interact"} onClick={() => setMode("interact")} className={cn("inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-medium", mode === "interact" ? "bg-sisyphus-50 text-sisyphus-700" : "text-muted-foreground")}>
              <MousePointerClick aria-hidden className="size-3.5" /> Χρήση σελίδας
            </button>
            <button type="button" role="radio" aria-checked={mode === "extract"} onClick={() => setMode("extract")} className={cn("inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-medium", mode === "extract" ? "bg-sisyphus-50 text-sisyphus-700" : "text-muted-foreground")}>
              <ScanText aria-hidden className="size-3.5" /> Εξαγωγή αποτελέσματος
            </button>
          </div>
          <Button type="button" size="sm" onClick={() => void capture()}>
            <ClipboardList aria-hidden /> Capture πεδίων φόρμας
          </Button>
          <span className="text-xs text-muted-foreground">{mode === "extract" ? "Κάντε κλικ στο στοιχείο που θέλετε να επιστρέφεται (π.χ. αριθμός πρωτοκόλλου)." : "Κλικ και πληκτρολόγηση όπως σε κανονικό browser."}</span>
        </div>
        <div ref={keys} tabIndex={0} onKeyDown={onKeyDown} onPaste={(e) => (e.preventDefault(), flush(), void send({ type: "text", text: e.clipboardData.getData("text").slice(0, 2000) }))} className="outline-none focus-visible:ring-2 focus-visible:ring-sisyphus-500/40" aria-label="Παράθυρο του συστήματος‑στόχου">
          {/* eslint-disable-next-line @next/next/no-img-element -- live frame from the recorder session */}
          <img
            ref={img}
            src={`/api/recorder/${state.id}/frame?tenantId=${encodeURIComponent(tenantId)}&t=${tick}`}
            alt="Η σελίδα του συστήματος‑στόχου"
            width={state.viewport.width}
            height={state.viewport.height}
            draggable={false}
            onClick={(e) => void onClick(e)}
            onWheel={(e) => void send({ type: "scroll", dy: e.deltaY })}
            className={cn("block h-auto w-full select-none bg-muted", mode === "extract" ? "cursor-crosshair" : "cursor-pointer")}
          />
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-lg border border-border/70 bg-card shadow-fluent-2">
          <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">Βήματα · {state.steps.length}</h2>
            <Button type="button" size="sm" variant="ghost" disabled={state.steps.length < 2} onClick={() => void send({ type: "undo" })}>
              <Undo2 aria-hidden /> Αναίρεση
            </Button>
          </header>
          <ol className="max-h-[45dvh] space-y-1 overflow-auto p-3 text-sm" aria-live="polite">
            {state.steps.map((s, i) => (
              <li key={s.id} className="flex gap-2 rounded-sm px-2 py-1 hover:bg-muted/60">
                <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="eyebrow mr-1">{STEP_TYPES[s.type === "navigate" ? "goto" : s.type] ?? s.type}</span>
                  <span className="break-words">{s.label}</span>
                  {typeof s.value === "string" && <code className="ml-1 font-mono text-2xs text-muted-foreground">{s.value.replace(/[{}]/g, "")}</code>}
                  {s.into && <code className="ml-1 font-mono text-2xs text-sisyphus-600">→ {s.into}</code>}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-lg border border-border/70 bg-card p-4 shadow-fluent-2">
          <h2 className="text-sm font-semibold">Είσοδοι του API · {state.inputs.length}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Τα πεδία που συμπληρώνετε γίνονται είσοδοι της μεθόδου. Οι τιμές που πληκτρολογείτε δεν αποθηκεύονται.</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {state.inputs.map((i) => (
              <li key={i.key} className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs" title={i.label}>
                {i.key}
              </li>
            ))}
          </ul>
        </section>
        <div className="flex flex-wrap gap-2">
          {finish}
          {cancel}
        </div>
      </aside>

      <Dialog open={!!blocked} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Νέα διεύθυνση</DialogTitle>
            <DialogDescription>
              Η σελίδα θέλει να ανοίξει το <strong className="font-mono text-foreground">{blocked ? new URL(blocked.origin).host : ""}</strong>, που δεν είναι στις επιτρεπτές διευθύνσεις του συστήματος‑στόχου (π.χ. σελίδα σύνδεσης σε άλλο domain). Να προστεθεί; Θα ισχύει και στις αυτόματες εκτελέσεις.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBlocked(null)}>
              Όχι
            </Button>
            <Button
              type="button"
              autoFocus
              onClick={async () => {
                const b = blocked!;
                setBlocked(null);
                setBusy(true);
                try {
                  const res = await fetch(`/api/recorder/${state.id}/allow-origin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, ...b }) });
                  const body = await res.json();
                  if (!res.ok) setNotice({ title: "Η διεύθυνση δεν προστέθηκε", text: body.title ?? "Δοκιμάστε ξανά.", error: true });
                  else {
                    setState(body.state);
                    setUrl(body.state.url);
                    setNotice({ title: "Προστέθηκε", text: body.message });
                  }
                } finally {
                  setBusy(false);
                  setTick((t) => t + 1);
                }
              }}
            >
              Προσθήκη και συνέχεια
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!notice} onOpenChange={(o) => !o && setNotice(null)}>
        <DialogContent className="sm:max-w-sm" role={notice?.error ? "alertdialog" : "dialog"}>
          <DialogHeader>
            <DialogTitle className={notice?.error ? "text-danger-500" : undefined}>{notice?.title}</DialogTitle>
            <DialogDescription>{notice?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" autoFocus onClick={() => setNotice(null)}>
              Εντάξει
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!select} onOpenChange={(o) => !o && setSelect(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{select ? fieldLabel(select) : ""}</DialogTitle>
            <DialogDescription>Επιλέξτε τιμή. Στη ροή η τιμή θα έρχεται από την είσοδο του API.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[50dvh] space-y-0.5 overflow-auto">
            {select?.options?.map((o) => (
              <li key={o.value}>
                <button type="button" className="w-full rounded-xs px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => (setSelect(null), void send({ type: "select", css: select.css, value: o.value }))}>
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fields} onOpenChange={(o) => !o && setFields(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Πεδία της φόρμας</DialogTitle>
            <DialogDescription>Ορίστε τι είναι κάθε πεδίο. Οι είσοδοι γίνονται παράμετροι της μεθόδου API· τα στοιχεία σύνδεσης έρχονται από το διαπιστευτήριο.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Πεδίο</th>
                  <th className="py-1.5 pr-3 font-medium">Τύπος</th>
                  <th className="py-1.5 font-medium">Χρήση</th>
                </tr>
              </thead>
              <tbody>
                {fields?.map((f, i) => (
                  <tr key={f.css + i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3">
                      {fieldLabel(f)}
                      {f.required && <span className="ml-1 text-danger-500">*</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{f.tag === "select" ? `λίστα · ${f.options?.length ?? 0}` : (f.type ?? f.tag)}</td>
                    <td className="py-1.5">
                      <select
                        aria-label={`Χρήση του πεδίου ${fieldLabel(f)}`}
                        value={f.kind}
                        onChange={(e) => setFields((all) => all!.map((x, j) => (j === i ? { ...x, kind: e.target.value as FieldKind } : x)))}
                        className="h-8 rounded-sm border border-border bg-background px-2 text-sm"
                      >
                        <option value="input">Είσοδος API</option>
                        <option value="username">Όνομα χρήστη (διαπιστευτήριο)</option>
                        <option value="password">Κωδικός (διαπιστευτήριο)</option>
                        <option value="skip">Παράλειψη</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFields(null)}>
              Άκυρο
            </Button>
            <Button type="button" onClick={() => (void send({ type: "captureApply", fields: fields!.map((f) => ({ css: f.css, kind: f.kind })) }), setFields(null))}>
              Προσθήκη ως βήματα
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extractAt} onOpenChange={(o) => !o && setExtractAt(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const key = String(new FormData(e.currentTarget).get("key") ?? "").trim();
              if (!key || !extractAt) return;
              void send({ type: "extract", ...extractAt, key });
              setExtractAt(null);
              setMode("interact");
            }}
          >
            <DialogHeader>
              <DialogTitle>Όνομα αποτελέσματος</DialogTitle>
              <DialogDescription>Έτσι θα επιστρέφεται στην απάντηση του API (λατινικά, π.χ. protocolNo).</DialogDescription>
            </DialogHeader>
            <input name="key" required pattern="[A-Za-z][A-Za-z0-9_]*" autoFocus aria-label="Όνομα αποτελέσματος" className="my-4 h-9 w-full rounded-sm border border-border bg-background px-2 font-mono text-sm" />
            <DialogFooter>
              <Button type="submit">Προσθήκη</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
