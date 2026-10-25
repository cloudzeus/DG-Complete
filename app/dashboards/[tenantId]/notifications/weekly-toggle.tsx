"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { sendWeeklyReportNow, setWeeklyReport } from "./actions";

export function WeeklyToggle({ tenantId, userId, on, label }: { tenantId: string; userId: string; on: boolean; label: string }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(v) =>
        start(async () => {
          setValue(v);
          const r = await setWeeklyReport(tenantId, userId, v);
          if (r.ok) toast.success(r.message);
          else {
            setValue(!v);
            toast.error(r.message);
          }
        })
      }
    />
  );
}

export function SendNow({ tenantId }: { tenantId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendWeeklyReportNow(tenantId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      <Send className="size-4" /> {pending ? "Ο Κίμων γράφει την αναφορά…" : "Στείλε μου την αναφορά τώρα"}
    </Button>
  );
}
