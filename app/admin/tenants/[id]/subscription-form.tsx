"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/dg/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceDef } from "@/lib/services";
import { saveSubscription } from "./subscription-actions";

// Subscription of a tenant: period, amount, valid until — a payment extends it by one period, and
// the reminders (Ρυθμίσεις → Email) go to the billing email + the tenant admins.

export function SubscriptionForm({
  tenantId,
  values,
  canManage,
  today,
  plans,
}: {
  tenantId: string;
  plans: { id: string; name: string; period: "MONTHLY" | "YEARLY"; price: string; services: string[]; active: boolean }[];
  /** Today in Athens (YYYY-MM-DD), from the server — keeps render pure. */
  today: string;
  values: { planId: string; period: string; amount: string; endsAt: string; email: string };
  canManage: boolean;
}) {
  const [v, setV] = useState(values);
  const [pending, start] = useTransition();
  const daysLeft = v.endsAt ? Math.round((Date.parse(v.endsAt) - Date.parse(today)) / 86_400_000) : null;
  const select = "h-10 w-full rounded-md border bg-background px-3 text-sm";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSubscription(tenantId, v as never);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="sub-plan">Πακέτο</Label>
          <select
            id="sub-plan"
            className={select}
            value={v.planId}
            disabled={!canManage}
            onChange={(e) => {
              const p = plans.find((x) => x.id === e.target.value);
              // Choosing a plan fills period + amount (still editable, e.g. for a discount).
              setV({ ...v, planId: e.target.value, ...(p ? { period: p.period, amount: p.price } : {}) });
            }}
          >
            <option value="">— Χωρίς πακέτο (dashboards + Κίμων) —</option>
            {plans
              .filter((p) => p.active || p.id === v.planId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {Number(p.price).toLocaleString("el-GR", { minimumFractionDigits: 2 })} € / {p.period === "MONTHLY" ? "μήνα" : "έτος"}
                  {p.active ? "" : " (ανενεργό)"}
                </option>
              ))}
          </select>
          {v.planId && (
            <p className="text-xs text-muted-foreground">
              Υπηρεσίες: {plans.find((p) => p.id === v.planId)?.services.map((s) => serviceDef(s)?.name ?? s).join(" · ")}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-period">Περίοδος</Label>
          <select id="sub-period" className={select} value={v.period} disabled={!canManage} onChange={(e) => setV({ ...v, period: e.target.value })}>
            <option value="">— Χωρίς συνδρομή —</option>
            <option value="MONTHLY">Μηνιαία</option>
            <option value="YEARLY">Ετήσια</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-amount">Ποσό (€, με ΦΠΑ)</Label>
          <Input id="sub-amount" inputMode="decimal" value={v.amount} disabled={!canManage} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sub-ends">Ισχύει έως</Label>
          <Input id="sub-ends" type="date" value={v.endsAt} disabled={!canManage} onChange={(e) => setV({ ...v, endsAt: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="sub-email">Email τιμολόγησης</Label>
          <Input id="sub-email" type="email" value={v.email} disabled={!canManage} placeholder="logistirio@pelatis.gr" onChange={(e) => setV({ ...v, email: e.target.value })} />
          <p className="text-xs text-muted-foreground">Υπενθυμίσεις και αποδεικτικά πηγαίνουν εδώ και στους διαχειριστές του πελάτη.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={daysLeft !== null && daysLeft <= 14 ? "text-sm font-medium text-warning-500" : "text-sm text-muted-foreground"}>
          {daysLeft === null ? "Χωρίς ημερομηνία λήξης — δεν στέλνονται υπενθυμίσεις." : daysLeft >= 0 ? `Λήγει σε ${daysLeft} ημέρες.` : `Έληξε πριν από ${-daysLeft} ημέρες.`}
        </p>
        {canManage && (
          <Button type="submit" disabled={pending}>
            {pending ? "Αποθήκευση…" : "Αποθήκευση"}
          </Button>
        )}
      </div>
    </form>
  );
}
