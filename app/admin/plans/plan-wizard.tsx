"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Lock } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SERVICES, serviceDef, withRequirements, type ServiceKey } from "@/lib/services";
import { cn } from "@/lib/utils";
import { savePlan } from "./actions";

// Package wizard: 1 details → 2 services → 3 price & period → 4 review.

export type PlanValues = {
  id?: string;
  name: string;
  description: string;
  services: ServiceKey[];
  period: "MONTHLY" | "YEARLY";
  price: string;
  /** AI tokens included per month. */
  aiTokens: string;
  active: boolean;
};

const STEPS = ["Στοιχεία", "Υπηρεσίες", "Τιμή & περίοδος", "Επισκόπηση"];
const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function PlanWizard({ initial, tenants }: { initial: PlanValues; tenants: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const price = Number(v.price.replace(",", "."));
  const services = withRequirements(v.services);

  const problem = [
    v.name.trim().length < 2 ? "Δώστε όνομα πακέτου." : null,
    services.length === 0 ? "Επιλέξτε τουλάχιστον μία υπηρεσία." : null,
    !Number.isFinite(price) || price < 0 || v.price.trim() === "" ? "Δώστε τιμή." : null,
  ][step === 0 ? 0 : step === 1 ? 1 : step === 2 ? 2 : -1];
  const allProblems = [v.name.trim().length < 2, services.length === 0, !Number.isFinite(price) || v.price.trim() === ""].some(Boolean);

  function toggle(key: ServiceKey) {
    const has = v.services.includes(key);
    let next = has ? v.services.filter((k) => k !== key) : [...v.services, key];
    // Removing a service also removes what depends on it (e.g. orders without purchasing).
    if (has) next = next.filter((k) => !(serviceDef(k)?.requires ?? []).includes(key));
    setV({ ...v, services: next });
  }

  function save() {
    start(async () => {
      const r = await savePlan({
        id: v.id,
        name: v.name,
        description: v.description,
        services,
        period: v.period,
        price,
        aiTokensMonthly: Math.max(0, Math.round(Number(v.aiTokens.replace(/\D/g, "")) || 0)),
        active: v.active,
      });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.push("/admin/plans");
    });
  }

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => (i < step || !problem ? setStep(i) : null)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                i === step ? "border-sisyphus-300 bg-sisyphus-50/60 font-medium text-sisyphus-700" : i < step ? "bg-muted/40" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  i < step ? "bg-success-500 text-white" : i === step ? "bg-sisyphus-500 text-white" : "bg-muted",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="min-h-72 rounded-xl border bg-card p-5 sm:p-6">
        {step === 0 && (
          <div className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Όνομα πακέτου</Label>
              <Input id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="π.χ. Business" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Περιγραφή</Label>
              <Textarea
                id="p-desc"
                value={v.description}
                onChange={(e) => setV({ ...v, description: e.target.value })}
                rows={4}
                placeholder="Τι περιλαμβάνει, για ποιον είναι — εμφανίζεται στις προσφορές και στον πελάτη."
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3 md:grid-cols-2">
            {SERVICES.map((s) => {
              const chosen = services.includes(s.key);
              const forced = chosen && !v.services.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => !forced && toggle(s.key)}
                  className={cn(
                    "flex min-h-24 items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                    chosen ? "border-sisyphus-300 bg-sisyphus-50/50" : "hover:bg-muted/50",
                  )}
                >
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded border", chosen ? "border-sisyphus-500 bg-sisyphus-500 text-white" : "bg-background")}>
                    {chosen && (forced ? <Lock className="size-3" /> : <Check className="size-3.5" />)}
                  </span>
                  <span className="space-y-1">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                    {s.requires && (
                      <span className="block text-2xs text-muted-foreground">Απαιτεί: {s.requires.map((r) => serviceDef(r)?.name).join(", ")}</span>
                    )}
                    {forced && <span className="block text-2xs font-medium text-sisyphus-700">Περιλαμβάνεται γιατί το απαιτεί άλλη υπηρεσία.</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl space-y-5">
            <div className="space-y-1.5">
              <Label>Περίοδος χρέωσης</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["MONTHLY", "YEARLY"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setV({ ...v, period: p })}
                    className={cn("min-h-11 rounded-lg border px-3 py-2 text-sm", v.period === p ? "border-sisyphus-300 bg-sisyphus-50/60 font-medium text-sisyphus-700" : "hover:bg-muted/50")}
                  >
                    {p === "MONTHLY" ? "Μηνιαία" : "Ετήσια"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Τιμή ανά {v.period === "MONTHLY" ? "μήνα" : "έτος"} (€, με ΦΠΑ)</Label>
              <Input id="p-price" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} placeholder="π.χ. 1200" />
              {Number.isFinite(price) && price > 0 && (
                <p className="text-xs text-muted-foreground">
                  {v.period === "MONTHLY" ? `≈ ${eur(price * 12)} τον χρόνο` : `≈ ${eur(price / 12)} τον μήνα`}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-tokens">AI tokens ανά μήνα</Label>
              <Input id="p-tokens" inputMode="numeric" value={v.aiTokens} onChange={(e) => setV({ ...v, aiTokens: e.target.value })} placeholder="π.χ. 2000000 — 0 = χωρίς" />
              <p className="text-xs text-muted-foreground">
                Για Κίμωνα, κλαδική ανάλυση και εναλλακτικά είδη. Προστίθενται στην αρχή κάθε μήνα· τα αχρησιμοποίητα μεταφέρονται. Επιπλέον tokens
                αγοράζονται σε πακέτα (Ρυθμίσεις → AI).
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border p-3">
              <span>
                <span className="block text-sm font-medium">Διαθέσιμο για νέους πελάτες</span>
                <span className="text-xs text-muted-foreground">Ανενεργό πακέτο: δεν προτείνεται, οι πελάτες που το έχουν το κρατούν.</span>
              </span>
              <Switch checked={v.active} onCheckedChange={(active) => setV({ ...v, active })} />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-2xl space-y-4 text-sm">
            <div>
              <div className="text-lg font-semibold">{v.name || "—"}</div>
              {v.description && <p className="text-muted-foreground">{v.description}</p>}
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {Number.isFinite(price) ? eur(price) : "—"} <span className="text-sm font-normal text-muted-foreground">/ {v.period === "MONTHLY" ? "μήνα" : "έτος"}</span>
            </div>
            {Number(v.aiTokens.replace(/\D/g, "")) > 0 && (
              <p className="text-sm">
                <span className="font-medium">{Number(v.aiTokens.replace(/\D/g, "")).toLocaleString("el-GR")} AI tokens</span> τον μήνα
              </p>
            )}
            <ul className="space-y-1.5">
              {services.map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-500" />
                  <span>
                    <span className="font-medium">{serviceDef(k)?.name}</span>
                    <span className="block text-xs text-muted-foreground">{serviceDef(k)?.description}</span>
                  </span>
                </li>
              ))}
            </ul>
            {v.id && tenants > 0 && (
              <p className="rounded-md bg-warning-50 px-3 py-2 text-warning-500">
                Το πακέτο έχουν {tenants} πελάτες: οι αλλαγές στις υπηρεσίες ισχύουν αμέσως γι’ αυτούς· η τιμή αλλάζει στην επόμενη ανάθεση.
              </p>
            )}
            {!v.active && <p className="text-muted-foreground">Το πακέτο θα αποθηκευτεί ως ανενεργό.</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={() => (step === 0 ? router.push("/admin/plans") : setStep(step - 1))}>
          <ArrowLeft className="size-4" /> {step === 0 ? "Άκυρο" : "Πίσω"}
        </Button>
        <div className="flex items-center gap-3">
          {problem && <span className="text-xs text-destructive">{problem}</span>}
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!!problem} onClick={() => setStep(step + 1)}>
              Επόμενο <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" disabled={pending || allProblems} onClick={save}>
              {pending ? "Αποθήκευση…" : v.id ? "Αποθήκευση αλλαγών" : "Δημιουργία πακέτου"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
