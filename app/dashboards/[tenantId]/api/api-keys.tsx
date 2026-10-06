"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createKey, revokeKey } from "./actions";

export type KeyRow = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revoked: boolean };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "ποτέ");

export function ApiKeys({ tenantId, keys, canManage }: { tenantId: string; keys: KeyRow[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {canManage && (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setName("");
            setCreated(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Νέο API key
        </Button>
      )}
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">Δεν υπάρχουν κλειδιά ακόμα.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {keys.map((k) => (
            <li key={k.id} className={`flex items-center gap-3 px-3 py-2.5 ${k.revoked ? "opacity-50" : ""}`}>
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {k.name} {k.revoked && <span className="text-xs font-normal text-muted-foreground">· ανακλήθηκε</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  <code>{k.prefix}…</code> · δημιουργία {when(k.createdAt)} · τελευταία χρήση {when(k.lastUsedAt)}
                </div>
              </div>
              {canManage && !k.revoked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  disabled={pending}
                  aria-label={`Ανάκληση ${k.name}`}
                  onClick={() => {
                    if (!window.confirm(`Ανάκληση του κλειδιού «${k.name}»; Οι εφαρμογές που το χρησιμοποιούν θα σταματήσουν να λαμβάνουν δεδομένα.`)) return;
                    start(async () => {
                      const r = await revokeKey(tenantId, k.id);
                      if (r.ok) toast.success(r.message);
                      else toast.error(r.message);
                    });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{created ? "Το κλειδί δημιουργήθηκε" : "Νέο API key"}</DialogTitle>
            <DialogDescription>
              {created
                ? "Αντιγράψτε το τώρα — για λόγους ασφαλείας δεν θα εμφανιστεί ξανά. Φυλάξτε το μόνο στον server της εφαρμογής σας."
                : "Ένα κλειδί ανά εφαρμογή, ώστε να μπορείτε να το ανακαλέσετε χωρίς να επηρεάσετε τις άλλες."}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="flex gap-2">
              <Input readOnly value={created} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(created).then(() => toast.success("Αντιγράφηκε."))}>
                <Copy className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Όνομα</Label>
              <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="π.χ. Intranet πωλήσεων" autoFocus />
            </div>
          )}
          <DialogFooter>
            {created ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Το αντέγραψα
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await createKey(tenantId, name);
                    if (r.ok) setCreated(r.key);
                    else toast.error(r.message);
                  })
                }
              >
                {pending ? "Δημιουργία…" : "Δημιουργία"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
