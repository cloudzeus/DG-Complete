"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, MapPinned } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { GeoStatus } from "@/lib/geo";
import { geocodeNow, loadGeoStatus } from "./geo-actions";

// How many of the tenant's active customers are on the map, and a manual geocoding batch.

export function GeoPanel({ tenantId, hasService }: { tenantId: string; hasService: boolean }) {
  const [status, setStatus] = useState<GeoStatus | null | undefined>(undefined);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    loadGeoStatus(tenantId).then((s) => alive && setStatus(s), () => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const pct = status && status.total ? Math.round((100 * status.ok) / status.total) : 0;
  return (
    <div className="space-y-3 text-sm">
      {!hasService && <p className="text-amber-700">Το πακέτο του πελάτη δεν περιλαμβάνει τη Γεωγραφική ανάλυση — το geocoding δεν τρέχει αυτόματα.</p>}
      {status === undefined ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Φόρτωση…
        </div>
      ) : status === null ? (
        <p className="text-muted-foreground">Δεν έχει γίνει ακόμα geocoding.</p>
      ) : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
          </div>
          <p>
            <strong>{status.ok.toLocaleString("el-GR")}</strong> από {status.total.toLocaleString("el-GR")} ενεργούς πελάτες στον χάρτη ({pct}%)
            {status.notFound > 0 && ` · ${status.notFound} διευθύνσεις δεν βρέθηκαν`}
            {status.errors > 0 && ` · ${status.errors} σφάλματα`}
            {status.pending > 0 && ` · ${status.pending} σε αναμονή`}
          </p>
        </>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await geocodeNow(tenantId);
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
            setStatus(await loadGeoStatus(tenantId));
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <MapPinned className="size-4" />}
        {pending ? "Geocoding…" : "Geocoding τώρα"}
      </Button>
    </div>
  );
}
