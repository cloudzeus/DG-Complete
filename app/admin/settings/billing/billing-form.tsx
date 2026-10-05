"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { loadBillingLookups, saveBilling, type BillingFormState, type Lookup } from "../actions";

export type BillingValues = {
  invoiceSeries: number | null;
  serviceMtrl: number | null;
  paymentCode: number | null;
  vatRate: number;
  pricesIncludeVat: boolean;
};

const NONE = "__none__";

export function BillingForm({ values }: { values: BillingValues }) {
  const [state, formAction, saving] = useActionState<BillingFormState, FormData>(saveBilling, {});
  const [lookups, setLookups] = useState<{ series: Lookup[]; services: Lookup[]; payments: Lookup[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [payment, setPayment] = useState(values.paymentCode ? String(values.paymentCode) : NONE);

  useEffect(() => {
    if (state.ok) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  function load() {
    startLoad(async () => {
      const result = await loadBillingLookups();
      if (result.ok) {
        setLookups(result);
        setLoadError(null);
      } else setLoadError(result.error);
    });
  }

  const e = state.errors ?? {};

  /** Keeps the saved value selectable even before the lists are loaded from SoftOne. */
  function options(list: Lookup[] | undefined, current: number | null) {
    const items = [...(list ?? [])];
    if (current && !items.some((i) => i.id === current)) items.unshift({ id: current, code: String(current), name: "(αποθηκευμένο)" });
    return items;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          {lookups ? "Ανανέωση λιστών από το SoftOne" : "Φόρτωση λιστών από το SoftOne"}
        </Button>
        {loadError && <span className="text-xs text-destructive">{loadError}</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Σειρά παραστατικού (SALDOC)" error={e.invoiceSeries}>
          <Select name="invoiceSeries" defaultValue={values.invoiceSeries ? String(values.invoiceSeries) : undefined}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Επιλέξτε σειρά" />
            </SelectTrigger>
            <SelectContent>
              {options(lookups?.series, values.invoiceSeries).map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.code} · {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Υπηρεσία συνδρομής" error={e.serviceMtrl}>
          <Select name="serviceMtrl" defaultValue={values.serviceMtrl ? String(values.serviceMtrl) : undefined}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Επιλέξτε υπηρεσία" />
            </SelectTrigger>
            <SelectContent>
              {options(lookups?.services, values.serviceMtrl).map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.code} · {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Τρόπος πληρωμής (προαιρετικό)" error={e.paymentCode}>
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Προεπιλογή σειράς</SelectItem>
              {options(lookups?.payments, values.paymentCode).map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.code} · {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {payment !== NONE && <input type="hidden" name="paymentCode" value={payment} />}
        </Field>
        <Field label="ΦΠΑ %" error={e.vatRate}>
          <Input name="vatRate" type="number" step="0.01" inputMode="decimal" defaultValue={values.vatRate} />
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
          <span>
            <span className="block font-medium">Οι τιμές των πακέτων περιλαμβάνουν ΦΠΑ</span>
            <span className="text-xs text-muted-foreground">
              Το ποσό της πληρωμής αναλύεται σε καθαρή αξία + ΦΠΑ στη γραμμή του παραστατικού.
            </span>
          </span>
          <Switch name="pricesIncludeVat" defaultChecked={values.pricesIncludeVat} />
        </label>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση τιμολόγησης"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
