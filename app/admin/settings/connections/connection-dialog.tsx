"use client";

import { useActionState, useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { CheckCircle2, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveConnection, testConnectionDraft, type FormState } from "./actions";

type Purpose = "CUBE_WAREHOUSE" | "TENANT_SOURCE";
type Engine = "POSTGRES" | "MYSQL" | "MSSQL";

export type ConnectionFormValues = {
  id?: string;
  name: string;
  purpose: Purpose;
  engine: Engine;
  environment: "PRODUCTION" | "DEVELOPMENT";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  tenantId: string;
};

const DEFAULT_PORTS: Record<Engine, number> = { POSTGRES: 5432, MYSQL: 3306, MSSQL: 1433 };

const PURPOSE_LABEL: Record<Purpose, string> = {
  CUBE_WAREHOUSE: "Βάση Cube",
  TENANT_SOURCE: "Πηγή δεδομένων πελάτη",
};

type Props = {
  tenants: { id: string; name: string }[];
  allowedPurposes: Purpose[];
  values?: ConnectionFormValues;
  /** Controlled mode (row actions): no trigger button is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ConnectionDialog({ tenants, allowedPurposes, values, ...controlled }: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlled.open !== undefined;
  const open = isControlled ? controlled.open! : uncontrolledOpen;
  const setOpen = isControlled ? controlled.onOpenChange! : setUncontrolledOpen;
  const isEdit = !!values?.id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button disabled={allowedPurposes.length === 0}>
            <Plus />
            Νέα σύνδεση
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Επεξεργασία σύνδεσης" : "Νέα σύνδεση"}</DialogTitle>
          <DialogDescription>
            Ο κωδικός κρυπτογραφείται πριν αποθηκευτεί.{" "}
            {isEdit && "Αφήστε τον κενό για να κρατήσετε τον υπάρχοντα."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ConnectionForm
            tenants={tenants}
            allowedPurposes={allowedPurposes}
            values={values}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectionForm({
  tenants,
  allowedPurposes,
  values,
  onDone,
}: Pick<Props, "tenants" | "allowedPurposes" | "values"> & { onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState<FormState, FormData>(saveConnection, {});
  const [testState, setTestState] = useState<FormState>({});
  const [testing, startTest] = useTransition();

  const [purpose, setPurpose] = useState<Purpose>(values?.purpose ?? allowedPurposes[0]);
  const [engine, setEngine] = useState<Engine>(values?.engine ?? "POSTGRES");
  const [port, setPort] = useState(String(values?.port ?? DEFAULT_PORTS.POSTGRES));

  const handleDone = useEffectEvent(onDone);
  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      handleDone();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state]);

  const errors = { ...testState.errors, ...state.errors };

  function runTest() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTest(async () => setTestState(await testConnectionDraft(fd)));
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Όνομα" error={errors.name} className="sm:col-span-2">
          <Input name="name" defaultValue={values?.name} placeholder="π.χ. Cube production" required />
        </Field>

        <Field label="Χρήση" error={errors.purpose}>
          <Select name="purpose" value={purpose} onValueChange={(v) => setPurpose(v as Purpose)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedPurposes.map((p) => (
                <SelectItem key={p} value={p}>
                  {PURPOSE_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Περιβάλλον" error={errors.environment}>
          <Select name="environment" defaultValue={values?.environment ?? "PRODUCTION"}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCTION">Production</SelectItem>
              <SelectItem value="DEVELOPMENT">Development</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {purpose === "TENANT_SOURCE" && (
          <Field label="Πελάτης" error={errors.tenantId} className="sm:col-span-2">
            <Select name="tenantId" defaultValue={values?.tenantId || undefined}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={tenants.length ? "Επιλέξτε πελάτη" : "Δεν υπάρχουν πελάτες"} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label="Τύπος βάσης" error={errors.engine}>
          <Select
            name="engine"
            value={engine}
            onValueChange={(v) => {
              const next = v as Engine;
              if (port === String(DEFAULT_PORTS[engine])) setPort(String(DEFAULT_PORTS[next]));
              setEngine(next);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="POSTGRES">PostgreSQL</SelectItem>
              <SelectItem value="MYSQL">MySQL</SelectItem>
              <SelectItem value="MSSQL">SQL Server</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Βάση" error={errors.database}>
          <Input name="database" defaultValue={values?.database} placeholder="cubebiproduction" required />
        </Field>

        <Field label="Host" error={errors.host}>
          <Input name="host" defaultValue={values?.host} placeholder="100.70.50.43" required />
        </Field>

        <Field label="Port" error={errors.port}>
          <Input name="port" type="number" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} required />
        </Field>

        <Field label="Χρήστης" error={errors.username}>
          <Input name="username" defaultValue={values?.username} autoComplete="off" required />
        </Field>

        <Field label="Κωδικός" error={errors.password}>
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={values?.id ? "•••••••• (αμετάβλητος)" : undefined}
            required={!values?.id}
          />
        </Field>

        <label className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
          <span>
            <span className="block font-medium">SSL / TLS</span>
            <span className="text-xs text-muted-foreground">Κρυπτογραφημένη σύνδεση με τον server της βάσης</span>
          </span>
          <Switch name="ssl" defaultChecked={values?.ssl} />
        </label>
      </div>

      {testState.test &&
        (testState.test.ok ? (
          <Alert>
            <CheckCircle2 className="text-success-500" />
            <AlertTitle>Η σύνδεση πέτυχε ({testState.test.latencyMs} ms)</AlertTitle>
            <AlertDescription className="font-mono text-xs">{testState.test.serverVersion}</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Η σύνδεση απέτυχε</AlertTitle>
            <AlertDescription className="break-all font-mono text-xs">{testState.test.error}</AlertDescription>
          </Alert>
        ))}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={runTest} disabled={testing || saving}>
          {testing ? "Δοκιμή…" : "Δοκιμή σύνδεσης"}
        </Button>
        <Button type="submit" disabled={saving || testing}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </DialogFooter>
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
