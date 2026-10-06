"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveTokenSettings } from "./actions";

type Pack = { tokens: string; priceEur: string };

export function TokenSettings({
  values,
}: {
  values: { enforceTokens: boolean; alertEmail: string; alertBelowUsd: number; packages: { tokens: number; priceEur: number }[] };
}) {
  const [enforce, setEnforce] = useState(values.enforceTokens);
  const [email, setEmail] = useState(values.alertEmail);
  const [below, setBelow] = useState(String(values.alertBelowUsd));
  const [packs, setPacks] = useState<Pack[]>(values.packages.map((p) => ({ tokens: String(p.tokens), priceEur: String(p.priceEur) })));
  const [pending, start] = useTransition();
  const n = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-between gap-3 rounded-md border p-3">
        <span>
          <span className="block text-sm font-medium">Χρέωση με AI tokens</span>
          <span className="text-xs text-muted-foreground">
            Ενεργό: οι λειτουργίες AI σταματούν όταν τελειώσει το υπόλοιπο του πελάτη. Ανενεργό: η κατανάλωση καταγράφεται χωρίς μπλοκάρισμα.
          </span>
        </span>
        <Switch checked={enforce} onCheckedChange={setEnforce} />
      </label>

      <div className="space-y-2">
        <Label>Πακέτα tokens για τους πελάτες</Label>
        <p className="text-xs text-muted-foreground">Οι τιμές περιλαμβάνουν το markup σας και τον ΦΠΑ. Ο πελάτης ζητά πακέτο και εσείς το εγκρίνετε όταν πληρωθεί.</p>
        {packs.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label="Tokens"
              inputMode="numeric"
              value={p.tokens}
              onChange={(e) => setPacks(packs.map((x, j) => (j === i ? { ...x, tokens: e.target.value } : x)))}
              placeholder="π.χ. 1000000"
              className="h-10 max-w-44"
            />
            <span className="text-sm text-muted-foreground">tokens για</span>
            <Input
              aria-label="Τιμή €"
              inputMode="decimal"
              value={p.priceEur}
              onChange={(e) => setPacks(packs.map((x, j) => (j === i ? { ...x, priceEur: e.target.value } : x)))}
              placeholder="€"
              className="h-10 max-w-28"
            />
            <span className="text-sm text-muted-foreground">€</span>
            <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Αφαίρεση πακέτου" onClick={() => setPacks(packs.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setPacks([...packs, { tokens: "", priceEur: "" }])}>
          <Plus className="size-4" /> Πακέτο
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ai-alert-email">Ειδοποίηση χαμηλού υπολοίπου OpenRouter προς</Label>
          <Input id="ai-alert-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-alert-below">Όταν το υπόλοιπο πέσει κάτω από ($)</Label>
          <Input id="ai-alert-below" inputMode="decimal" value={below} onChange={(e) => setBelow(e.target.value)} className="h-10" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveTokenSettings({
                enforceTokens: enforce,
                alertEmail: email.trim(),
                alertBelowUsd: Number(below.replace(",", ".")) || 0,
                packages: packs.filter((p) => p.tokens.trim()).map((p) => ({ tokens: Math.round(n(p.tokens)), priceEur: Number(p.priceEur.replace(",", ".")) || 0 })),
              });
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            })
          }
        >
          Αποθήκευση
        </Button>
      </div>
    </div>
  );
}
