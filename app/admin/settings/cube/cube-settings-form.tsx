"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveCubeDeployment, type CubeFormState } from "./actions";

type Conn = { id: string; name: string; environment: string; host: string; database: string; lastTestStatus: string };

type Values = {
  apiUrl: string;
  devUrl: string;
  controlPlaneUrl: string;
  warehouseConnectionId: string;
  devConnectionId: string;
};

const NONE = "__none__";

export function CubeSettingsForm({ connections, values }: { connections: Conn[]; values?: Values }) {
  const [state, formAction, pending] = useActionState<CubeFormState, FormData>(saveCubeDeployment, {});
  const [devConnectionId, setDevConnectionId] = useState(values?.devConnectionId || NONE);

  useEffect(() => {
    if (state.ok) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  const e = state.errors ?? {};
  const label = (c: Conn) =>
    `${c.name} — ${c.database}@${c.host}${c.lastTestStatus === "OK" ? "" : c.lastTestStatus === "FAILED" ? " (σφάλμα)" : " (μη ελεγμένη)"}`;

  if (connections.length === 0) {
    return (
      <p className="text-muted-foreground">
        Προσθέστε πρώτα μια σύνδεση «Βάση Cube» τύπου PostgreSQL από τις Συνδέσεις δεδομένων.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Cube API (production)" error={e.apiUrl}>
        <Input name="apiUrl" defaultValue={values?.apiUrl ?? "https://cube.dgsmart.gr"} required />
      </Field>
      <Field label="URL εφαρμογής (το καλεί το Cube)" error={e.controlPlaneUrl}>
        <Input name="controlPlaneUrl" defaultValue={values?.controlPlaneUrl ?? "https://app.dgsmart.gr"} required />
      </Field>

      <Field label="Βάση production" error={e.warehouseConnectionId}>
        <Select name="warehouseConnectionId" defaultValue={values?.warehouseConnectionId || undefined}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Επιλέξτε σύνδεση" />
          </SelectTrigger>
          <SelectContent>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {label(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Βάση development (Playground)" error={e.devConnectionId}>
        <Select value={devConnectionId} onValueChange={setDevConnectionId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Χωρίς Playground</SelectItem>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {label(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {devConnectionId !== NONE && <input type="hidden" name="devConnectionId" value={devConnectionId} />}
      </Field>

      {devConnectionId !== NONE && (
        <Field label="Cube Playground URL" error={e.devUrl} className="sm:col-span-2">
          <Input name="devUrl" defaultValue={values?.devUrl || "https://cube-dev.dgsmart.gr"} />
        </Field>
      )}

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Αποθήκευση…" : values ? "Αποθήκευση & ανανέωση YAML" : "Αποθήκευση & δημιουργία YAML"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
