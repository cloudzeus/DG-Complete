"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { Button } from "@/components/ui/button";
import { runCustomerSync } from "./actions";

export function SyncButtons() {
  const [pending, startTransition] = useTransition();

  function run(mode: "FULL" | "INCREMENTAL") {
    startTransition(async () => {
      const r = await runCustomerSync(mode);
      if (r.ok) toast.success(`Συγχρονισμός ολοκληρώθηκε: ${r.rowsUpserted} πελάτες${r.tenantsUpdated ? `, ${r.tenantsUpdated} tenants ενημερώθηκαν` : ""}.`);
      else toast.error(r.busy ? "Συγχρονισμός σε εξέλιξη" : "Ο συγχρονισμός απέτυχε", { description: r.error });
    });
  }

  return (
    <>
      <Button onClick={() => run("INCREMENTAL")} disabled={pending}>
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        {pending ? "Συγχρονισμός…" : "Συγχρονισμός"}
      </Button>
      <Button variant="outline" onClick={() => run("FULL")} disabled={pending}>
        Πλήρης
      </Button>
    </>
  );
}
