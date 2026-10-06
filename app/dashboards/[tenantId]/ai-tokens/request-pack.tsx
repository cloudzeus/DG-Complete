"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelTokenRequest, requestTokenPack } from "./actions";

export function RequestPack({ tenantId, tokens, disabled }: { tenantId: string; tokens: number; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await requestTokenPack(tenantId, tokens);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      Αίτημα αγοράς
    </Button>
  );
}

export function CancelRequest({ tenantId, id }: { tenantId: string; id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelTokenRequest(tenantId, id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    >
      Ακύρωση
    </Button>
  );
}
