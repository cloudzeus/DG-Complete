"use client";

import { useActionState, useEffect, useEffectEvent, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { addMembership, removeMembership, saveUser, type UserFormState } from "./actions";

export type UserValues = {
  id: string;
  name: string;
  email: string;
  platformRole: string;
  active: boolean;
  memberships: { tenantId: string; tenantName: string; role: string }[];
};

type TenantOption = { id: string; name: string };

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Admin (DGsoft)", USER: "Χρήστης πελάτη" };
const TENANT_ROLE_LABEL: Record<string, string> = { TENANT_ADMIN: "Tenant admin", TENANT_USER: "Tenant user" };
const NONE = "__none__";

/** Add (no `user`) or edit (`user`) — a controlled modal opened from the toolbar or the row "⋯" menu. */
export function UserDialog({
  open,
  onOpenChange,
  user,
  tenants,
  canManagePlatformRoles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserValues;
  tenants: TenantOption[];
  canManagePlatformRoles: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? "Επεξεργασία χρήστη" : "Νέος χρήστης"}</DialogTitle>
          <DialogDescription>
            {user ? "Αφήστε τον κωδικό κενό για να μην αλλάξει." : "Ο χρήστης συνδέεται με το email και τον αρχικό κωδικό."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <UserForm
            user={user}
            tenants={tenants}
            canManagePlatformRoles={canManagePlatformRoles}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserForm({
  user,
  tenants,
  canManagePlatformRoles,
  onDone,
}: {
  user?: UserValues;
  tenants: TenantOption[];
  canManagePlatformRoles: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(saveUser, {});
  const [role, setRole] = useState(user?.platformRole ?? "USER");
  const [tenantId, setTenantId] = useState(NONE);
  const handleDone = useEffectEvent(onDone);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      handleDone();
    } else if (state.message) toast.error(state.message);
  }, [state]);

  const e = state.errors ?? {};
  const roles = canManagePlatformRoles ? ["USER", "ADMIN", "SUPER_ADMIN"] : ["USER"];

  return (
    <form action={formAction} className="space-y-4">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ονοματεπώνυμο *" error={e.name} className="sm:col-span-2">
          <Input name="name" defaultValue={user?.name} required autoComplete="off" />
        </Field>
        <Field label="Email *" error={e.email}>
          <Input name="email" type="email" defaultValue={user?.email} required autoComplete="off" />
        </Field>
        <Field label={user ? "Νέος κωδικός" : "Αρχικός κωδικός *"} error={e.password}>
          <Input name="password" type="password" autoComplete="new-password" placeholder={user ? "••••••••" : "τουλ. 10 χαρακτήρες"} />
        </Field>
        <Field label="Ρόλος πλατφόρμας" error={e.platformRole}>
          <Select name="platformRole" value={role} onValueChange={setRole} disabled={!canManagePlatformRoles && role !== "USER"}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-md border p-2.5">
          <span className="text-sm font-medium">Ενεργός</span>
          <Switch name="active" defaultChecked={user?.active ?? true} />
        </label>

        {!user && (
          <>
            <Field label="Πρόσβαση σε tenant" className="sm:col-span-1">
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Κανένας</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tenantId !== NONE && <input type="hidden" name="tenantId" value={tenantId} />}
            </Field>
            <Field label="Ρόλος στον tenant">
              <Select name="tenantRole" defaultValue="TENANT_USER" disabled={tenantId === NONE}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TENANT_ADMIN">Tenant admin</SelectItem>
                  <SelectItem value="TENANT_USER">Tenant user</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </div>

      {user && <Memberships user={user} tenants={tenants} />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Άκυρο
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Αποθήκευση…" : user ? "Αποθήκευση" : "Δημιουργία"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Memberships({ user, tenants }: { user: UserValues; tenants: TenantOption[] }) {
  const [pending, start] = useTransition();
  const [tenantId, setTenantId] = useState("");
  const [role, setRole] = useState("TENANT_USER");
  const [list, setList] = useState(user.memberships);
  const available = tenants.filter((t) => !list.some((m) => m.tenantId === t.id));

  function add() {
    if (!tenantId) return;
    start(async () => {
      const r = await addMembership(user.id, tenantId, role);
      if (!r.ok) return void toast.error(r.message);
      setList((l) => [...l, { tenantId, tenantName: tenants.find((t) => t.id === tenantId)!.name, role }]);
      setTenantId("");
    });
  }

  function remove(id: string) {
    start(async () => {
      const r = await removeMembership(user.id, id);
      if (!r.ok) return void toast.error(r.message);
      setList((l) => l.filter((m) => m.tenantId !== id));
    });
  }

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Πρόσβαση σε tenants</legend>
      {list.length === 0 && <p className="text-xs text-muted-foreground">Καμία πρόσβαση.</p>}
      <ul className="space-y-1">
        {list.map((m) => (
          <li key={m.tenantId} className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1">
            <span className="truncate text-sm">
              {m.tenantName} <span className="text-xs text-muted-foreground">· {TENANT_ROLE_LABEL[m.role]}</span>
            </span>
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => remove(m.tenantId)} disabled={pending} aria-label="Αφαίρεση πρόσβασης">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger size="sm" className="w-full sm:flex-1">
              <SelectValue placeholder="Επιλέξτε tenant" />
            </SelectTrigger>
            <SelectContent>
              {available.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger size="sm" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TENANT_ADMIN">Tenant admin</SelectItem>
              <SelectItem value="TENANT_USER">Tenant user</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={pending || !tenantId}>
            <Plus />
            Προσθήκη
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
