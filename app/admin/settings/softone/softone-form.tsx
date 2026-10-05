"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveSoftOne, testSoftOneDraft, type SoftOneFormState } from "../actions";

export type SoftOneValues = {
  id: string;
  baseUrl: string;
  appId: string;
  username: string;
  company: string;
  branch: string;
  module: string;
  refId: string;
};

export function SoftOneForm({ values }: { values?: SoftOneValues }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState<SoftOneFormState, FormData>(saveSoftOne, {});
  const [testState, setTestState] = useState<SoftOneFormState>({});
  const [testing, startTest] = useTransition();
  const [ids, setIds] = useState({
    company: values?.company ?? "",
    branch: values?.branch ?? "",
    module: values?.module ?? "",
    refId: values?.refId ?? "",
  });

  useEffect(() => {
    if (state.ok) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  const errors = { ...testState.errors, ...state.errors };
  const test = state.test ?? testState.test;

  function runTest() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTest(async () => setTestState(await testSoftOneDraft(fd)));
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Διεύθυνση Web Services" hint="Serial ή πλήρες URL, π.χ. https://01234567.oncloud.gr/s1services" error={errors.baseUrl} className="sm:col-span-2">
          <Input name="baseUrl" defaultValue={values?.baseUrl} placeholder="https://<serial>.oncloud.gr/s1services" required />
        </Field>
        <Field label="AppID" error={errors.appId}>
          <Input name="appId" inputMode="numeric" defaultValue={values?.appId} required />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Χρήστης (Web account)" error={errors.username}>
          <Input name="username" defaultValue={values?.username} autoComplete="off" required />
        </Field>
        <Field label="Κωδικός" error={errors.password}>
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={values ? "•••••••• (αμετάβλητος)" : undefined}
            required={!values}
          />
        </Field>
      </div>

      <fieldset className="grid gap-4 rounded-md border p-4 sm:grid-cols-4">
        <legend className="px-1 text-sm font-medium">Εταιρεία σύνδεσης</legend>
        {(["company", "branch", "module", "refId"] as const).map((k) => (
          <Field
            key={k}
            label={{ company: "Company *", branch: "Branch", module: "Module", refId: "RefID" }[k]}
            error={errors[k]}
          >
            <Input
              name={k}
              inputMode="numeric"
              value={ids[k]}
              onChange={(e) => setIds((s) => ({ ...s, [k]: e.target.value }))}
            />
          </Field>
        ))}
        <p className="text-xs text-muted-foreground sm:col-span-4">
          Υποχρεωτικό μόνο το Company· τα υπόλοιπα στέλνονται μόνο αν συμπληρωθούν. Πατήστε «Δοκιμή σύνδεσης» για
          να δείτε τους διαθέσιμους συνδυασμούς του λογαριασμού.
        </p>
      </fieldset>

      {test &&
        (test.ok ? (
          <Alert>
            <CheckCircle2 className="text-success-500" />
            <AlertTitle>{test.authenticated ? "Login και authenticate πέτυχαν" : "Το login πέτυχε"}</AlertTitle>
            <AlertDescription>
              {test.objs.length > 0 && (
                <div className="mt-2 w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>RefID</TableHead>
                        <TableHead className="w-0" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {test.objs.map((o) => (
                        <TableRow key={`${o.COMPANY}-${o.BRANCH}-${o.MODULE}-${o.REFID}`}>
                          <TableCell>
                            {o.COMPANY} <span className="text-muted-foreground">{o.COMPANYNAME}</span>
                          </TableCell>
                          <TableCell>
                            {o.BRANCH} <span className="text-muted-foreground">{o.BRANCHNAME}</span>
                          </TableCell>
                          <TableCell>
                            {o.MODULE} <span className="text-muted-foreground">{o.MODULENAME}</span>
                          </TableCell>
                          <TableCell>
                            {o.REFID} <span className="text-muted-foreground">{o.REFIDNAME}</span>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setIds({
                                  company: String(o.COMPANY),
                                  branch: String(o.BRANCH),
                                  module: String(o.MODULE),
                                  refId: String(o.REFID),
                                })
                              }
                            >
                              Επιλογή
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Η σύνδεση απέτυχε</AlertTitle>
            <AlertDescription className="break-all">{test.error}</AlertDescription>
          </Alert>
        ))}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={runTest} disabled={testing || saving}>
          {testing ? "Δοκιμή…" : "Δοκιμή σύνδεσης"}
        </Button>
        <Button type="submit" disabled={saving || testing}>
          {saving ? "Έλεγχος & αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
