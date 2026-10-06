"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePlanningSettings } from "@/app/dashboards/[tenantId]/planning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Values = { fixedCostsMonthly: number | null; minCash: number | null; costPerDocument: number | null; financingRatePct: number | null; lostSharePct: number | null };

export function PlanningSettingsForm({ tenantId, values, needFixed, defaults }: { tenantId: string; values: Values; needFixed: boolean; defaults: { perDocument: number; financingRatePct: number; lostSharePct: number } }) {
  const str = (v: number | null) => (v === null ? "" : String(v));
  const [f, setF] = useState({
    fixedCostsMonthly: str(values.fixedCostsMonthly),
    minCash: str(values.minCash),
    costPerDocument: str(values.costPerDocument),
    financingRatePct: str(values.financingRatePct),
    lostSharePct: str(values.lostSharePct),
  });
  const [pending, start] = useTransition();
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
  const field = (key: keyof typeof f, label: string, placeholder: string, width = "w-40") => (
    <label className="space-y-1 text-xs">
      <span className="block">{label}</span>
      <Input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} inputMode="decimal" className={`h-10 ${width}`} placeholder={placeholder} />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {needFixed && field("fixedCostsMonthly", "Σταθερά έξοδα ανά μήνα (€)", "π.χ. 85000", "w-48")}
        {field("minCash", "Ελάχιστο ταμείο (€)", "π.χ. 100000")}
        {field("costPerDocument", "Κόστος ανά παραστατικό πελάτη (€)", `προεπιλογή ${defaults.perDocument}`)}
        {field("financingRatePct", "Κόστος χρήματος (% ετησίως)", `προεπιλογή ${defaults.financingRatePct}`)}
        {field("lostSharePct", "Χαμένη ζήτηση σε έλλειψη (%)", `προεπιλογή ${defaults.lostSharePct}`)}
      </div>
      <p className="text-xs text-muted-foreground">
        Χρησιμοποιούνται στην πραγματική κερδοφορία πελατών (κόστος εξυπηρέτησης) και στις χαμένες πωλήσεις. Κενό = προεπιλογή.
      </p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await savePlanningSettings(tenantId, {
              fixedCostsMonthly: n(f.fixedCostsMonthly),
              minCash: n(f.minCash),
              costPerDocument: n(f.costPerDocument),
              financingRatePct: n(f.financingRatePct),
              lostSharePct: n(f.lostSharePct),
            });
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
          })
        }
      >
        Αποθήκευση παραμέτρων
      </Button>
    </div>
  );
}
