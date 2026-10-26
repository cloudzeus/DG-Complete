"use client";

import { useActionState, useEffect } from "react";
import { toast } from "@/components/dg/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveEmailSettings, type EmailFormState } from "./actions";

export type EmailSettingsValues = {
  keyHint: string | null;
  webhookKeyHint: string | null;
  domain: string;
  region: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  bcc: string;
  reminderDays: number[];
  overdueDays: number[];
  enabled: boolean;
};

export function EmailForm({ values }: { values: EmailSettingsValues }) {
  const [state, action, pending] = useActionState<EmailFormState, FormData>(saveEmailSettings, {});
  useEffect(() => {
    if (state.ok) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);
  const e = state.errors ?? {};
  const field = (name: keyof NonNullable<EmailFormState["errors"]>, label: string, input: React.ReactNode, hint?: string, wide = false) => (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={`em-${name}`}>{label}</Label>
      {input}
      {e[name] ? <p className="text-xs text-destructive">{e[name]}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "apiKey",
          "Mailgun API key",
          <Input id="em-apiKey" name="apiKey" type="password" autoComplete="off" placeholder={values.keyHint ? `αποθηκευμένο ${values.keyHint} — αφήστε κενό` : "key-…"} />,
          "Mailgun → Account → API keys (Private API key). Κρυπτογραφείται.",
          true,
        )}
        {field(
          "webhookKey",
          "HTTP webhook signing key",
          <Input id="em-webhookKey" name="webhookKey" type="password" autoComplete="off" placeholder={values.webhookKeyHint ? `αποθηκευμένο ${values.webhookKeyHint} — αφήστε κενό` : "Mailgun → Settings → API Security"} />,
          "Για τα στατιστικά (ανοίγματα, παραδόσεις, διαγραφές): επαληθεύει ότι τα γεγονότα έρχονται από το Mailgun. Κρυπτογραφείται.",
          true,
        )}
        {field("domain", "Domain αποστολής", <Input id="em-domain" name="domain" defaultValue={values.domain} placeholder="mg.dgsmart.gr" required />, "Το verified domain στο Mailgun.")}
        <div className="space-y-1.5">
          <Label htmlFor="em-region">Περιοχή</Label>
          <select id="em-region" name="region" defaultValue={values.region} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="EU">EU — api.eu.mailgun.net</option>
            <option value="US">US — api.mailgun.net</option>
          </select>
          <p className="text-xs text-muted-foreground">Ίδια με την περιοχή του domain στο Mailgun.</p>
        </div>
        {field("fromName", "Όνομα αποστολέα", <Input id="em-fromName" name="fromName" defaultValue={values.fromName} required />)}
        {field("fromEmail", "Email αποστολέα", <Input id="em-fromEmail" name="fromEmail" type="email" defaultValue={values.fromEmail} placeholder="noreply@mg.dgsmart.gr" required />)}
        {field("replyTo", "Απαντήσεις σε (Reply-To)", <Input id="em-replyTo" name="replyTo" type="email" defaultValue={values.replyTo} placeholder="support@dgsoft.gr" />, "Πού πηγαίνουν οι απαντήσεις των πελατών.")}
        {field("bcc", "Κοινοποίηση (Bcc)", <Input id="em-bcc" name="bcc" type="email" defaultValue={values.bcc} placeholder="logistirio@dgsoft.gr" />, "Αντίγραφο κάθε email προς πελάτες (προαιρετικό).")}
        {field(
          "reminderDays",
          "Υπενθύμιση ανανέωσης — ημέρες πριν",
          <Input id="em-reminderDays" name="reminderDays" defaultValue={values.reminderDays.join(", ")} inputMode="numeric" />,
          "π.χ. 14, 3 — μία υπενθύμιση σε κάθε όριο.",
        )}
        {field(
          "overdueDays",
          "Υπενθύμιση πληρωμής — ημέρες μετά τη λήξη",
          <Input id="em-overdueDays" name="overdueDays" defaultValue={values.overdueDays.join(", ")} inputMode="numeric" />,
          "π.χ. 1, 7",
        )}
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border p-3">
        <span>
          <span className="block text-sm font-medium">Ενεργή αποστολή</span>
          <span className="text-xs text-muted-foreground">Όσο είναι ανενεργή, στέλνονται μόνο τα δοκιμαστικά.</span>
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
