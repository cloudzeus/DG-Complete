"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjustTenantTokens } from "./actions";

/** Add (+) or remove (−) tokens by hand, with a note. */
export function AdjustTokens({ tenantId }: { tenantId: string }) {
  const [tokens, setTokens] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const n = Math.round(Number(tokens.replace(/[^\d-]/g, "")) || 0);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await adjustTenantTokens(tenantId, n, note);
          if (r.ok) {
            toast.success(r.message);
            setTokens("");
            setNote("");
          } else toast.error(r.message);
        });
      }}
    >
      <Input aria-label="Tokens (+ ή −)" inputMode="numeric" value={tokens} onChange={(e) => setTokens(e.target.value)} placeholder="π.χ. 1000000 ή -50000" className="h-10 w-48" />
      <Input aria-label="Σημείωση" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Σημείωση (π.χ. δώρο, διόρθωση)" className="h-10 min-w-48 flex-1" />
      <Button type="submit" variant="outline" disabled={pending || !n}>
        {n < 0 ? "Αφαίρεση" : "Προσθήκη"}
      </Button>
    </form>
  );
}
