"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveGeoSettings, type GeoFormState } from "./actions";

export function GeoForm({ values }: { values: { keyHint: string | null; enabled: boolean; batchSize: number } }) {
  const [state, action, pending] = useActionState<GeoFormState, FormData>(saveGeoSettings, {});
  useEffect(() => {
    if (state.ok) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="geo-token">Mapbox access token</Label>
          <Input id="geo-token" name="token" type="password" autoComplete="off" placeholder={values.keyHint ? `αποθηκευμένο ${values.keyHint} — αφήστε κενό` : "pk.eyJ…"} />
          {e.token ? (
            <p className="text-xs text-destructive">{e.token}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Mapbox → Account → Tokens. Δημόσιο token (pk.), με περιορισμό URL στο bi.dgsmart.gr. Κρυπτογραφείται.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="geo-batch">Πελάτες ανά εκτέλεση</Label>
          <Input id="geo-batch" name="batchSize" inputMode="numeric" defaultValue={values.batchSize} />
          {e.batchSize ? <p className="text-xs text-destructive">{e.batchSize}</p> : <p className="text-xs text-muted-foreground">Ανά πελάτη (tenant) και ώρα.</p>}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border p-3">
        <span>
          <span className="block text-sm font-medium">Ενεργό</span>
          <span className="text-xs text-muted-foreground">Geocoding των νέων / αλλαγμένων διευθύνσεων κάθε ώρα και χάρτες στα dashboards.</span>
        </span>
        <Switch name="enabled" defaultChecked={values.enabled} />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Έλεγχος & αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </div>
    </form>
  );
}
