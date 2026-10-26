"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { Button } from "@/components/ui/button";
import { approveTokenRequest, rejectTokenRequest } from "./actions";

export type PendingRequest = { id: string; tenant: string; tokens: number; priceEur: number; requestedBy: string | null; createdAt: string };

/** Pending token pack requests with approve (tokens added) / reject. */
export function TokenRequests({ rows }: { rows: PendingRequest[] }) {
  const [pending, start] = useTransition();
  if (!rows.length) return <p className="text-sm text-muted-foreground">Δεν υπάρχουν αιτήματα σε αναμονή.</p>;
  const act = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.tenant}</span>
            <span className="text-xs text-muted-foreground">
              {r.tokens.toLocaleString("el-GR")} tokens · {r.priceEur.toLocaleString("el-GR", { minimumFractionDigits: 2 })} € · {r.createdAt}
              {r.requestedBy && ` · ${r.requestedBy}`}
            </span>
          </span>
          <span className="flex gap-1.5">
            <Button size="sm" disabled={pending} onClick={() => act(() => approveTokenRequest(r.id))}>
              <Check className="size-4" /> Πληρώθηκε — έγκριση
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => rejectTokenRequest(r.id))} aria-label="Απόρριψη">
              <X className="size-4" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
