"use client";

import { useActionState, useEffect, useEffectEvent, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { recordPayment, type PaymentFormState } from "./actions";

type TenantOption = { id: string; name: string; linked: boolean };

/** Pass `tenantId` on a tenant page, or `tenants` to pick one (global payments page). */
export function PaymentDialog({ tenantId, linked = false, tenants }: { tenantId?: string; linked?: boolean; tenants?: TenantOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Νέα πληρωμή
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Καταχώριση πληρωμής</DialogTitle>
          <DialogDescription>Για πληρωμές εκτός Viva (τράπεζα, POS κ.λπ.).</DialogDescription>
        </DialogHeader>
        {open && <PaymentForm tenantId={tenantId} linked={linked} tenants={tenants} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  tenantId,
  linked,
  tenants,
  onDone,
}: {
  tenantId?: string;
  linked: boolean;
  tenants?: TenantOption[];
  onDone: () => void;
}) {
  const [picked, setPicked] = useState(tenantId ?? "");
  const isLinked = tenantId ? linked : !!tenants?.find((t) => t.id === picked)?.linked;
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(recordPayment, {});
  const handleDone = useEffectEvent(onDone);
  useEffect(() => {
    if (state.ok) {
      if (state.message?.includes("απέτυχε")) toast.warning(state.message);
      else toast.success(state.message);
      handleDone();
    } else if (state.message) toast.error(state.message);
  }, [state]);
  const e = state.errors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenantId" value={picked} />
      <div className="grid gap-4 sm:grid-cols-2">
        {!tenantId && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tenant</Label>
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Επιλέξτε tenant" />
              </SelectTrigger>
              <SelectContent>
                {(tenants ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {e.tenantId && <p className="text-xs text-destructive">Επιλέξτε tenant</p>}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="amount">Ποσό (€, με ΦΠΑ)</Label>
          <Input id="amount" name="amount" inputMode="decimal" required />
          {e.amount && <p className="text-xs text-destructive">{e.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paidAt">Ημερομηνία</Label>
          <Input id="paidAt" name="paidAt" type="date" defaultValue={today} required />
          {e.paidAt && <p className="text-xs text-destructive">{e.paidAt}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Περιγραφή</Label>
          <Input id="description" name="description" placeholder="π.χ. Συνδρομή DGsmart BI — Οκτώβριος 2026" required />
          {e.description && <p className="text-xs text-destructive">{e.description}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Τρόπος</Label>
          <Select name="method" defaultValue="BANK_TRANSFER">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BANK_TRANSFER">Τραπεζική μεταφορά</SelectItem>
              <SelectItem value="CARD">Κάρτα (POS)</SelectItem>
              <SelectItem value="CASH">Μετρητά</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
          <span>
            <span className="block font-medium">Αποστολή στο SoftOne</span>
            <span className="text-xs text-muted-foreground">
              {isLinked ? "Δημιουργία παραστατικού στον πελάτη SoftOne" : "Ο tenant δεν είναι αντιστοιχισμένος με πελάτη SoftOne"}
            </span>
          </span>
          <Switch key={String(isLinked)} name="postToSoftOne" defaultChecked={isLinked} disabled={!isLinked} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2">
          <span>
            <span className="block font-medium">Αποδεικτικό με email</span>
            <span className="text-xs text-muted-foreground">Στο email του πελάτη και στους διαχειριστές του· η συνδρομή παρατείνεται κατά μία περίοδο.</span>
          </span>
          <Switch name="sendReceipt" defaultChecked />
        </label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Καταχώριση…" : "Καταχώριση"}
        </Button>
      </DialogFooter>
    </form>
  );
}
