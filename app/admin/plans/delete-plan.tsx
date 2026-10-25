"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deletePlan } from "./actions";

export function DeletePlan({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Διαγραφή ${name}`}
      onClick={() => {
        if (!window.confirm(`Διαγραφή του πακέτου «${name}»;`)) return;
        start(async () => {
          const r = await deletePlan(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        });
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
