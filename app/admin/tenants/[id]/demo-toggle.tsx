"use client";

import { useTransition } from "react";
import { toast } from "@/components/dg/notice";
import { Switch } from "@/components/ui/switch";
import { setTenantDemo } from "./actions";

export function DemoToggle({ tenantId, isDemo, disabled }: { tenantId: string; isDemo: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-xs font-medium">
      <Switch
        checked={isDemo}
        disabled={disabled || pending}
        onCheckedChange={(v) =>
          start(async () => {
            const r = await setTenantDemo(tenantId, v);
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
          })
        }
        aria-label="Demo tenant"
      />
      Demo
    </label>
  );
}
