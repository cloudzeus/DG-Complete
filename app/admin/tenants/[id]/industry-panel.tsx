"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildSegmentsNow, fetchKadsNow, loadIndustryState, type IndustryState } from "./industry-actions";

// ΚΑΔ of the tenant's customers (registry) and the AI segmentation into industry segments.

export function IndustryPanel({ tenantId, hasService }: { tenantId: string; hasService: boolean }) {
  const [state, setState] = useState<IndustryState | null>(null);
  const [busy, setBusy] = useState<"fetch" | "build" | null>(null);
  const [, start] = useTransition();
  const reload = useCallback(() => loadIndustryState(tenantId).then(setState, () => setState(null)), [tenantId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const run = (kind: "fetch" | "build") =>
    start(async () => {
      setBusy(kind);
      const r = kind === "fetch" ? await fetchKadsNow(tenantId) : await buildSegmentsNow(tenantId);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      setBusy(null);
      await reload();
    });

  const s = state?.status;
  const pct = s && s.withAfm ? Math.round((100 * s.found) / s.withAfm) : 0;
  return (
    <div className="space-y-3 text-sm">
      {!hasService && <p className="text-amber-700">Το πακέτο του πελάτη δεν περιλαμβάνει την Κλαδική ανάλυση — η άντληση ΚΑΔ δεν τρέχει αυτόματα.</p>}
      {state === null ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Φόρτωση…
        </div>
      ) : (
        <>
          {s ? (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
              </div>
              <p>
                ΚΑΔ για <strong>{s.found.toLocaleString("el-GR")}</strong> από {s.withAfm.toLocaleString("el-GR")} ενεργούς πελάτες με ΑΦΜ ({pct}%)
                {s.pending > 0 && ` · ${s.pending} σε αναμονή`}
                {s.notFound > 0 && ` · ${s.notFound} δεν βρέθηκαν`}
                {s.errors > 0 && ` · ${s.errors} σφάλματα`}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Δεν έχει γίνει ακόμα άντληση ΚΑΔ.</p>
          )}
          {state.segments.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {state.segments.length} κλάδοι · δημιουργήθηκαν {state.builtAt ? new Date(state.builtAt).toLocaleString("el-GR") : "—"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.segments.map((g) => (
                  <span key={g.key} className="rounded-full bg-muted px-2 py-0.5 text-xs" title={g.description}>
                    {g.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Δεν έχουν δημιουργηθεί ακόμα κλάδοι.</p>
          )}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => run("fetch")}>
          {busy === "fetch" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {busy === "fetch" ? "Άντληση…" : "Άντληση ΚΑΔ τώρα"}
        </Button>
        <Button type="button" size="sm" disabled={!!busy || !s?.found} onClick={() => run("build")}>
          {busy === "build" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy === "build" ? "Δημιουργία με AI…" : state?.segments.length ? "Αναδημιουργία κλάδων (AI)" : "Δημιουργία κλάδων (AI)"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Η δημιουργία κλάδων χρησιμοποιεί OpenRouter (χρέωση στον πελάτη, λίγα cents). Μετά από μεγάλη άντληση νέων ΚΑΔ, αναδημιουργήστε για να
        κατηγοριοποιηθούν κι αυτοί.
      </p>
    </div>
  );
}
