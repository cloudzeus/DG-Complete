"use client";

import { useState, useTransition } from "react";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { registerMailgunWebhooks, saveTracking, type ActionResult } from "./actions";

const notify = (r: ActionResult) => (r.ok ? toast.success(r.message) : toast.error(r.message));

export function TrackingForm({ keyHint, trackOpens, webhookUrl }: { keyHint: string | null; trackOpens: boolean; webhookUrl: string }) {
  const [key, setKey] = useState("");
  const [opens, setOpens] = useState(trackOpens);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mg-webhook-key">HTTP webhook signing key</Label>
          <Input
            id="mg-webhook-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={keyHint ? `Αποθηκευμένο (${keyHint}) — αφήστε κενό` : "Mailgun → Sending → Webhooks"}
          />
          <p className="text-xs text-muted-foreground">Με αυτό ελέγχεται ότι κάθε γεγονός έρχεται πράγματι από το Mailgun.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Διεύθυνση webhook</Label>
          <code className="block truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{webhookUrl}</code>
          <p className="text-xs text-muted-foreground">Παραδόσεις, ανοίγματα, αποτυχίες, διαγραφές και αναφορές spam.</p>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={opens} onCheckedChange={setOpens} />
        Καταγραφή ανοιγμάτων (pixel του Mailgun)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() =>
            start(async () => {
              const r = await saveTracking({ webhookKey: key, trackOpens: opens });
              notify(r);
              if (r.ok) setKey("");
            })
          }>
          Αποθήκευση
        </Button>
        <Button variant="outline" disabled={pending || !keyHint} onClick={() => start(async () => void notify(await registerMailgunWebhooks()))}>
          <Webhook className="size-4" /> Καταχώρηση webhooks στο Mailgun
        </Button>
      </div>
    </div>
  );
}
