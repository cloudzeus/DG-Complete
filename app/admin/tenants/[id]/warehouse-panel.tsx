"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, DatabaseZap, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { checkCube, provisionWarehouse, verifyWarehouse } from "./actions";

type Step = { label: string; ok: boolean; detail?: string };

export function WarehousePanel({
  tenantId,
  status,
  error,
  provisionedAt,
  cubeConfigured,
  canManage,
}: {
  tenantId: string;
  status: string;
  error: string | null;
  provisionedAt: string | null;
  cubeConfigured: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [steps, setSteps] = useState<Step[] | null>(null);

  const provisioned = status === "READY" || status === "DISABLED";

  function provision() {
    startTransition(async () => {
      const result = await provisionWarehouse(tenantId);
      if (result.ok) toast.success(result.message);
      else toast.error("Το provisioning απέτυχε", { description: result.message });
      setSteps(null);
    });
  }

  function verify() {
    startTransition(async () => {
      const db = await verifyWarehouse(tenantId);
      const out: Step[] = "error" in db ? [{ label: "Έλεγχος βάσης", ok: false, detail: db.error }] : db.steps;
      const cube = await checkCube(tenantId);
      out.push(
        cube.ok
          ? { label: `Cube API (${cube.latencyMs} ms)`, ok: true, detail: `${cube.cubes.length} cubes διαθέσιμα` }
          : { label: "Cube API", ok: false, detail: cube.error },
      );
      setSteps(out);
    });
  }

  return (
    <div className="space-y-4">
      {status === "ERROR" && error && (
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Το τελευταίο provisioning απέτυχε</AlertTitle>
          <AlertDescription className="break-all font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}
      {provisionedAt && (
        <p className="text-xs text-muted-foreground">
          Τελευταίο provisioning: {new Date(provisionedAt).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canManage && (
          <Button onClick={provision} disabled={pending || !cubeConfigured}>
            <DatabaseZap />
            {provisioned ? "Επανάληψη provisioning" : "Provisioning"}
          </Button>
        )}
        <Button variant="outline" onClick={verify} disabled={pending || !provisioned}>
          <ShieldCheck />
          Έλεγχος απομόνωσης & Cube
        </Button>
      </div>

      {pending && <p className="text-muted-foreground">Παρακαλώ περιμένετε…</p>}

      {steps && (
        <ul className="space-y-2 rounded-md border p-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              {s.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-500" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <span>
                {s.label}
                {s.detail && <span className="block break-all font-mono text-xs text-muted-foreground">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!provisioned && status !== "ERROR" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <PlugZap className="size-4" />
          Ο πελάτης δεν έχει ακόμα χώρο στην αποθήκη δεδομένων του Cube.
        </p>
      )}
    </div>
  );
}
