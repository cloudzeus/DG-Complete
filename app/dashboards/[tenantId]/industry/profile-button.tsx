"use client";

import { useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateSegmentProfile } from "./actions";

export function ProfileButton({ tenantId, segment, again }: { tenantId: string; segment: string; again: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={again ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateSegmentProfile(tenantId, segment);
          if (!r.ok) toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {pending ? "Ο Κίμων γράφει το προφίλ…" : again ? "Νέο προφίλ" : "Δημιουργία προφίλ κλάδου"}
    </Button>
  );
}
