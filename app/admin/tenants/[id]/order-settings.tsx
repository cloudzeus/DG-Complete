"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { loadOrderOptions, saveOrderSettings, type OrderOptions } from "./order-settings-actions";

// Series (PURDOC) and warehouse of the purchase orders that users create from the order suggestions.

export function OrderSettings({ tenantId }: { tenantId: string }) {
  const [opts, setOpts] = useState<OrderOptions | null>(null);
  const [series, setSeries] = useState<number[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [saving, start] = useTransition();

  useEffect(() => {
    let alive = true;
    loadOrderOptions(tenantId).then((o) => {
      if (!alive) return;
      setOpts(o);
      setSeries(o.current.series);
      setWarehouse(o.current.warehouse ? String(o.current.warehouse) : "");
    });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  if (!opts) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Φόρτωση σειρών από το SoftOne…
      </div>
    );
  }

  const select = "h-10 w-full rounded-md border bg-background px-3 text-sm";
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const chosen = series.map((id) => ({ id, label: opts.series.find((s) => s.id === id)?.label ?? String(id) }));
          await saveOrderSettings(tenantId, chosen, warehouse ? Number(warehouse) : null);
          toast.success(chosen.length ? "Οι σειρές παραγγελιών αποθηκεύτηκαν." : "Οι παραγγελίες αγορών απενεργοποιήθηκαν.");
        });
      }}
    >
      {opts.error && <p className="text-sm text-destructive">{opts.error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-sm font-medium">Σειρές παραγγελίας αγοράς που επιτρέπονται</legend>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border p-2">
            {opts.series.length === 0 && <p className="text-xs text-muted-foreground">Δεν βρέθηκαν σειρές αγορών.</p>}
            {opts.series.map((s) => (
              <label key={s.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1.5 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={series.includes(s.id)}
                  onChange={(e) => setSeries((x) => (e.target.checked ? [...x, s.id] : x.filter((id) => id !== s.id)))}
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="po-whouse">Αποθήκη</Label>
          <select id="po-whouse" className={select} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">— Κύρια αποθήκη —</option>
            {opts.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Οι χρήστες με δικαίωμα «Δημιουργία παραγγελιών αγοράς» διαλέγουν μία από αυτές τις σειρές (π.χ. εσωτερικού / ΕΕ / τρίτης χώρας) όταν
        στέλνουν την παραγγελία· στέλνονται είδη και ποσότητες, τις τιμές τις βάζει το SoftOne.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </div>
    </form>
  );
}
