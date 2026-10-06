"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { savePlanningSettings } from "@/app/dashboards/[tenantId]/planning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlanningSettingsForm({ tenantId, fixed, minCash, needFixed }: { tenantId: string; fixed: number | null; minCash: number | null; needFixed: boolean }) {
  const [f, setF] = useState(fixed ? String(Math.round(fixed)) : "");
  const [m, setM] = useState(minCash ? String(Math.round(minCash)) : "");
  const [pending, start] = useTransition();
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
  return (
    <div className="flex flex-wrap items-end gap-3">
      {needFixed && (
        <label className="space-y-1 text-xs">
          <span className="block">Σταθερά έξοδα ανά μήνα (€) — ενοίκια, μισθοδοσία, λειτουργικά</span>
          <Input value={f} onChange={(e) => setF(e.target.value)} inputMode="numeric" className="h-10 w-56" placeholder="π.χ. 85000" />
        </label>
      )}
      <label className="space-y-1 text-xs">
        <span className="block">Ελάχιστο ταμείο (€)</span>
        <Input value={m} onChange={(e) => setM(e.target.value)} inputMode="numeric" className="h-10 w-40" placeholder="π.χ. 100000" />
      </label>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await savePlanningSettings(tenantId, n(f), n(m));
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
          })
        }
      >
        Αποθήκευση
      </Button>
    </div>
  );
}
