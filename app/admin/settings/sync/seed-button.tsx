"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleSlash, Database, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createDefaultJobs } from "./actions";

type Report = { name: string; status: "created" | "exists" | "failed" | "skipped"; note?: string }[];
type SeedResult = { ok: true; report: Report } | { ok: false; message: string };

/** Creates + verifies the default reference tables (χώρες, ΔΟΥ, ΦΠΑ, είδη, παραστατικά …). */
export function SeedButton({
  disabled,
  action = createDefaultJobs,
  label = "Προεπιλεγμένοι πίνακες",
  title = "Προεπιλεγμένοι συγχρονισμοί",
}: {
  disabled?: boolean;
  action?: () => Promise<SeedResult>;
  label?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<Report | null>(null);

  function run() {
    start(async () => {
      const r = await action();
      if (!r.ok) return void toast.error(r.message);
      setReport(r.report);
    });
  }

  const created = report?.filter((r) => r.status === "created").length ?? 0;
  const failed = report?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <>
      <Button size="sm" variant="outline" onClick={run} disabled={disabled || pending}>
        <Database />
        {pending ? "Έλεγχος στο SoftOne…" : label}
      </Button>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Δημιουργήθηκαν {created}
              {failed ? `, ${failed} δεν υποστηρίζονται από αυτή την εγκατάσταση SoftOne` : ""}. Κάθε πίνακας ελέγχθηκε
              πρώτα στο SoftOne· οι νέοι συγχρονισμοί τρέχουν αυτόματα στον επόμενο κύκλο.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border/60 rounded-md border">
            {report?.map((r) => (
              <li key={r.name} className="flex items-start gap-2 px-3 py-2">
                {r.status === "created" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-500" />}
                {r.status === "exists" && <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                {r.status === "failed" && <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                {r.status === "skipped" && <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  <span className="block text-sm">{r.name}</span>
                  <span className="block break-all text-2xs text-muted-foreground">
                    {r.status === "exists" ? "υπάρχει ήδη" : r.status === "created" ? (r.note ?? "δημιουργήθηκε") : r.status === "skipped" ? `παραλείφθηκε — ${r.note}` : r.note}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setReport(null)}>Κλείσιμο</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
