"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveRegistrySettings, type RegistryFormState } from "./actions";

export function RegistryForm({ values }: { values: { url: string; enabled: boolean; batchSize: number } }) {
  const [state, action, pending] = useActionState<RegistryFormState, FormData>(saveRegistrySettings, {});
  useEffect(() => {
    if (state.ok) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);
  const e = state.errors ?? {};
  const hint = (k: keyof NonNullable<RegistryFormState["errors"]>, text: string) =>
    e[k] ? <p className="text-xs text-destructive">{e[k]}</p> : <p className="text-xs text-muted-foreground">{text}</p>;
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rg-url">Διεύθυνση υπηρεσίας (POST {"{ afm }"})</Label>
          <Input id="rg-url" name="url" defaultValue={values.url} required />
          {hint("url", "Επιστρέφει basic_rec και firm_act_tab (ΚΑΔ) για ένα ΑΦΜ.")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rg-batch">ΑΦΜ ανά εκτέλεση</Label>
          <Input id="rg-batch" name="batchSize" inputMode="numeric" defaultValue={values.batchSize} />
          {hint("batchSize", "Ανά πελάτη (tenant) και ώρα · ~3 ανά δευτερόλεπτο.")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rg-test">ΑΦΜ για δοκιμή</Label>
          <Input id="rg-test" name="testAfm" inputMode="numeric" defaultValue="802397844" />
          {hint("testAfm", "Ελέγχεται πριν την αποθήκευση.")}
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border p-3">
        <span>
          <span className="block text-sm font-medium">Ενεργό</span>
          <span className="text-xs text-muted-foreground">Άντληση ΚΑΔ των ενεργών πελατών κάθε ώρα, για τους πελάτες με την υπηρεσία «Κλαδική ανάλυση».</span>
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
