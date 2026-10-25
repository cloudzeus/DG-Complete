"use client";

import { useState, useTransition } from "react";
import { Lock, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { resetGrants, saveGrants } from "./actions";

type Def = { key: string; label: string; group: string };

const ROLE_HEAD: Record<string, { label: string; hint: string; className: string }> = {
  SUPER_ADMIN: { label: "Super admin", hint: "Πλατφόρμα", className: "text-dg-red-600" },
  ADMIN: { label: "Admin", hint: "DGsoft", className: "text-sisyphus-700" },
  TENANT_ADMIN: { label: "Tenant admin", hint: "Πελάτης", className: "text-violet-700" },
  TENANT_USER: { label: "Tenant user", hint: "Πελάτης", className: "text-slate-600" },
};

export function AccessMatrix({
  roles,
  permissions,
  initial,
}: {
  roles: string[];
  permissions: Def[];
  initial: Record<string, string[]>;
}) {
  const [grants, setGrants] = useState<Record<string, Set<string>>>(
    () => Object.fromEntries(roles.map((r) => [r, new Set(initial[r] ?? [])])),
  );
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const groups = [...new Set(permissions.map((p) => p.group))];

  function toggle(role: string, perm: string, on: boolean) {
    setGrants((g) => {
      const next = new Set(g[role]);
      if (on) next.add(perm);
      else next.delete(perm);
      return { ...g, [role]: next };
    });
    setDirty(true);
  }

  function save() {
    start(async () => {
      const r = await saveGrants(Object.fromEntries(roles.map((role) => [role, [...grants[role]]])));
      if (r.ok) {
        toast.success(r.message);
        setDirty(false);
      } else toast.error(r.message);
    });
  }

  function reset() {
    start(async () => {
      const r = await resetGrants();
      setGrants(Object.fromEntries(roles.map((role) => [role, new Set<string>(r.grants[role as keyof typeof r.grants] ?? [])])));
      setDirty(false);
      toast.success(r.message);
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/80">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/70">
            <tr className="border-b border-border/80">
              <th scope="col" className="px-3 py-2 text-left text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
                Δικαίωμα
              </th>
              {roles.map((r) => (
                <th key={r} scope="col" className="w-32 px-3 py-2 text-center">
                  <span className={cn("block text-xs font-semibold", ROLE_HEAD[r].className)}>{ROLE_HEAD[r].label}</span>
                  <span className="block text-2xs font-normal text-muted-foreground">{ROLE_HEAD[r].hint}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows
                key={group}
                group={group}
                perms={permissions.filter((p) => p.group === group)}
                roles={roles}
                grants={grants}
                onToggle={toggle}
                disabled={pending}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> Ο super admin έχει πάντα όλα τα δικαιώματα.
        </p>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <RotateCcw />
                Προεπιλογές
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Επαναφορά δικαιωμάτων;</AlertDialogTitle>
                <AlertDialogDescription>Όλοι οι ρόλοι επιστρέφουν στα προεπιλεγμένα δικαιώματα της πλατφόρμας.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                <AlertDialogAction onClick={reset}>Επαναφορά</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={save} disabled={pending || !dirty}>
            <Save />
            {pending ? "Αποθήκευση…" : "Αποθήκευση"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  perms,
  roles,
  grants,
  onToggle,
  disabled,
}: {
  group: string;
  perms: Def[];
  roles: string[];
  grants: Record<string, Set<string>>;
  onToggle: (role: string, perm: string, on: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-sisyphus-50/50 dark:bg-white/5">
        <th colSpan={roles.length + 1} scope="colgroup" className="px-3 py-1.5 text-left text-2xs font-semibold tracking-wider text-sisyphus-700 uppercase">
          {group}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p.key} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="px-3 py-2">
            <span className="block">{p.label}</span>
            <code className="text-2xs text-muted-foreground">{p.key}</code>
          </td>
          {roles.map((r) => {
            const locked = r === "SUPER_ADMIN";
            return (
              <td key={r} className="px-3 py-2 text-center">
                <Checkbox
                  aria-label={`${p.label} — ${ROLE_HEAD[r].label}`}
                  checked={locked || grants[r].has(p.key)}
                  disabled={locked || disabled}
                  onCheckedChange={(v) => onToggle(r, p.key, v === true)}
                  className="data-[state=checked]:border-dg-red-500 data-[state=checked]:bg-dg-red-500"
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
