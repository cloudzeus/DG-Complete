"use client";

import { useEffect, useState, useTransition } from "react";
import { Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkTenantToCustomer, searchCustomers } from "@/app/admin/customers/actions";

type Found = Awaited<ReturnType<typeof searchCustomers>>[number];

export function S1Link({
  tenantId,
  linked,
  canManage,
}: {
  tenantId: string;
  linked: { trdr: number; code: string | null } | null;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!picking) return;
    const t = setTimeout(() => searchCustomers(query).then(setResults), 250);
    return () => clearTimeout(t);
  }, [query, picking]);

  function link(customerId: string | null) {
    startTransition(async () => {
      const r = await linkTenantToCustomer(tenantId, customerId);
      if (r.ok) {
        toast.success(r.message);
        setPicking(false);
      } else toast.error(r.message);
    });
  }

  if (!canManage) return null;

  if (!picking) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setPicking(true)} disabled={pending}>
          <Link2 />
          {linked ? "Αλλαγή πελάτη" : "Σύνδεση με πελάτη SoftOne"}
        </Button>
        {linked && (
          <Button size="sm" variant="ghost" onClick={() => link(null)} disabled={pending}>
            <Unlink />
            Αποσύνδεση
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Επωνυμία, κωδικός ή ΑΦΜ" />
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {results.length === 0 && <li className="p-3 text-muted-foreground">Κανένα αποτέλεσμα.</li>}
        {results.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 p-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">
                {c.code} · ΑΦΜ {c.afm ?? "—"}
                {c.linkedTenant && ` · ήδη στον «${c.linkedTenant}»`}
              </span>
            </span>
            <Button size="sm" disabled={pending || (!!c.linkedTenant && c.trdr !== linked?.trdr)} onClick={() => link(c.id)}>
              Επιλογή
            </Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>
        Άκυρο
      </Button>
    </div>
  );
}
