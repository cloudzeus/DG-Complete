"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckCircle2, FlaskConical, KeyRound, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ModelInfo } from "@/lib/openrouter";
import { removeAiKey, saveAiSettings, testAi, type AiFormState, type AiTestResult } from "./actions";

export type AiValues = {
  keyHint: string | null;
  defaultModel: string;
  markupPercent: number;
  enabled: boolean;
};

const usd = (n: number, digits = 2) => `$${n.toLocaleString("el-GR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function AiForm({ values, models }: { values: AiValues; models: ModelInfo[] }) {
  const [state, formAction, saving] = useActionState<AiFormState, FormData>(saveAiSettings, {});
  const [model, setModel] = useState(values.defaultModel);
  const [markup, setMarkup] = useState(String(values.markupPercent));
  const [test, setTest] = useState<AiTestResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const info = models.find((m) => m.id === model);
  const m = Number(markup) || 0;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="ai-key">Κλειδί API OpenRouter</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="ai-key"
              name="apiKey"
              type="password"
              autoComplete="off"
              className="pl-8 font-mono"
              placeholder={values.keyHint ? `Αποθηκευμένο ••••${values.keyHint} — αφήστε κενό για να μείνει` : "sk-or-v1-…"}
              aria-invalid={!!state.errors?.apiKey}
            />
          </div>
          {values.keyHint && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Αφαίρεση κλειδιού"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await removeAiKey();
                  toast.success(r.message);
                  setTest(null);
                })
              }
            >
              <Trash2 />
            </Button>
          )}
        </div>
        {state.errors?.apiKey ? (
          <p className="text-xs text-destructive">{state.errors.apiKey}</p>
        ) : (
          <p className="text-2xs text-muted-foreground">
            Αποθηκεύεται κρυπτογραφημένο (AES-256-GCM) και ελέγχεται στο OpenRouter πριν την αποθήκευση. Ορίστε όριο
            δαπάνης στο ίδιο το κλειδί από το openrouter.ai.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="space-y-1.5">
          <Label htmlFor="ai-model">Προεπιλεγμένο μοντέλο</Label>
          <Input
            id="ai-model"
            name="defaultModel"
            list="ai-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="font-mono"
            aria-invalid={!!state.errors?.defaultModel}
          />
          <datalist id="ai-models">
            {models.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </datalist>
          {state.errors?.defaultModel ? (
            <p className="text-xs text-destructive">{state.errors.defaultModel}</p>
          ) : info ? (
            <p className="text-2xs text-muted-foreground">
              {info.name} · είσοδος {usd(info.promptPerM)} / έξοδος {usd(info.completionPerM)} ανά 1M tokens · πελάτης πληρώνει{" "}
              {usd(info.promptPerM * (1 + m / 100))} / {usd(info.completionPerM * (1 + m / 100))}
            </p>
          ) : (
            <p className="text-2xs text-muted-foreground">Π.χ. anthropic/claude-sonnet-5.5 — πληκτρολογήστε για αναζήτηση.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-markup">Markup %</Label>
          <Input
            id="ai-markup"
            name="markupPercent"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            aria-invalid={!!state.errors?.markupPercent}
          />
          {state.errors?.markupPercent ? (
            <p className="text-xs text-destructive">{state.errors.markupPercent}</p>
          ) : (
            <p className="text-2xs text-muted-foreground">Πάνω στο κόστος OpenRouter.</p>
          )}
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
        <span>
          <span className="block text-sm font-medium">Ενεργό AI για τους tenants</span>
          <span className="block text-2xs text-muted-foreground">Όταν είναι ανενεργό, μόνο οι δοκιμές από αυτή τη σελίδα επιτρέπονται.</span>
        </span>
        <Switch name="enabled" defaultChecked={values.enabled} />
      </label>

      {test && (
        <Alert variant={test.ok ? "default" : "destructive"}>
          {test.ok ? <CheckCircle2 className="text-success-500" /> : <XCircle />}
          <AlertDescription>
            {test.ok ? (
              <>
                «{test.reply}» από {test.model} σε {test.latencyMs} ms · κόστος {usd(test.costUsd, 6)}. Κλειδί
                {test.key.label ? ` «${test.key.label}»` : ""}: έχει καταναλώσει {usd(test.key.usage)}
                {test.key.limit !== null ? `, υπόλοιπο ορίου ${usd(test.key.limitRemaining ?? 0)}` : " (χωρίς όριο)"}.
              </>
            ) : (
              test.message
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || saving || !values.keyHint}
          onClick={() => start(async () => setTest(await testAi()))}
        >
          <FlaskConical />
          {pending ? "Δοκιμή…" : "Δοκιμή"}
        </Button>
        <Button type="submit" disabled={saving || pending}>
          {saving ? "Έλεγχος & αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </div>
    </form>
  );
}
