"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setTenantStatus } from "./actions";

const OPTIONS = [
  { value: "PENDING", label: "Σε αναμονή" },
  { value: "ACTIVE", label: "Ενεργός" },
  { value: "SUSPENDED", label: "Σε αναστολή" },
  { value: "CANCELED", label: "Ακυρωμένος" },
];

export function StatusSelect({ tenantId, status, disabled }: { tenantId: string; status: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={status}
      disabled={disabled || pending}
      onValueChange={(value) =>
        startTransition(async () => {
          const result = await setTenantStatus(tenantId, value);
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <SelectTrigger className="w-44" aria-label="Κατάσταση πελάτη">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
