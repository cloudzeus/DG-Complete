"use client";

import { useActionState, useEffect, useEffectEvent, useState, useTransition } from "react";
import { KeyRound, Mail, MoreHorizontal, Pencil, Plus, Trash2, UserMinus } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { StatusPill } from "@/components/admin/tone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deleteTenantUser, removeTenantUser, saveTenantUser, sendAccessEmail, type TenantUserState } from "./users-actions";

// Who sees this tenant's dashboards: create, edit, remove from the tenant, delete the account.

export type TenantUserRow = {
  id: string;
  name: string;
  email: string;
  role: "TENANT_ADMIN" | "TENANT_DESIGNER" | "TENANT_OPERATOR" | "TENANT_USER";
  active: boolean;
  /** Belongs to other tenants too (shared account). */
  otherTenants: number;
  lastLogin: string | null;
};

const ROLE: Record<TenantUserRow["role"], string> = { TENANT_ADMIN: "Διαχειριστής", TENANT_DESIGNER: "Σχεδιαστής", TENANT_OPERATOR: "Χειριστής", TENANT_USER: "Προβολή" };

function newPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("el-GR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "ποτέ";

export function TenantUsers({ tenantId, users, canManage, currentUserId }: { tenantId: string; users: TenantUserRow[]; canManage: boolean; currentUserId: string }) {
  const [editing, setEditing] = useState<TenantUserRow | null | undefined>(undefined); // undefined = closed, null = new
  const [confirm, setConfirm] = useState<{ user: TenantUserRow; kind: "remove" | "delete" } | null>(null);
  const [pending, start] = useTransition();

  function act(kind: "remove" | "delete", user: TenantUserRow) {
    start(async () => {
      const r = kind === "remove" ? await removeTenantUser(tenantId, user.id) : await deleteTenantUser(tenantId, user.id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      setConfirm(null);
    });
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setEditing(null)}>
          <Plus className="size-4" />
          Νέος χρήστης
        </Button>
      )}
      {users.length === 0 && <p className="text-sm text-muted-foreground">Κανένας χρήστης ακόμα — δημιουργήστε τον πρώτο για να δει τα dashboards.</p>}
      <ul className="divide-y">
        {users.map((u) => (
          <li key={u.id} className="flex items-start gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium">{u.name}</span>
                {!u.active && <StatusPill tone="slate">Ανενεργός</StatusPill>}
                {u.role !== "TENANT_USER" && <StatusPill tone="blue">{ROLE[u.role]}</StatusPill>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              <div className="text-2xs text-muted-foreground">
                Τελευταία σύνδεση: {when(u.lastLogin)}
                {u.otherTenants > 0 && ` · και σε ${u.otherTenants} ακόμα πελάτ${u.otherTenants === 1 ? "η" : "ες"}`}
              </div>
            </div>
            {canManage && u.id !== currentUserId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Ενέργειες για ${u.name}`} disabled={pending}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(u)}>
                    <Pencil className="size-4" /> Επεξεργασία
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      start(async () => {
                        const r = await sendAccessEmail(tenantId, u.id);
                        if (r.ok) toast.success(r.message);
                        else toast.error(r.message);
                      })
                    }
                  >
                    <Mail className="size-4" /> Email για νέο κωδικό
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing({ ...u, _reset: true } as TenantUserRow)}>
                    <KeyRound className="size-4" /> Ορισμός κωδικού εδώ
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfirm({ user: u, kind: "remove" })}>
                    <UserMinus className="size-4" /> Αφαίρεση από τον πελάτη
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" disabled={u.otherTenants > 0} onSelect={() => setConfirm({ user: u, kind: "delete" })}>
                    <Trash2 className="size-4" /> Διαγραφή λογαριασμού
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Επεξεργασία χρήστη" : "Νέος χρήστης"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Αφήστε τον κωδικό κενό για να μην αλλάξει. Νέος κωδικός ή απενεργοποίηση αποσυνδέει τον χρήστη."
                : "Ο χρήστης συνδέεται στο complete.dgsmart.gr με το email και τον κωδικό που ορίζετε και έχει πρόσβαση στην περιοχή του πελάτη."}
            </DialogDescription>
          </DialogHeader>
          {editing !== undefined && <UserForm key={editing?.id ?? "new"} tenantId={tenantId} user={editing} onDone={() => setEditing(undefined)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "delete" ? "Οριστική διαγραφή λογαριασμού" : "Αφαίρεση από τον πελάτη"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? `Ο λογαριασμός ${confirm.user.email} θα διαγραφεί οριστικά, μαζί με τις συνομιλίες του με τον Κίμωνα. Δεν αναιρείται.`
                : `Ο ${confirm?.user.name} δεν θα βλέπει πλέον τα dashboards αυτού του πελάτη. Ο λογαριασμός του παραμένει.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={confirm?.kind === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) act(confirm.kind, confirm.user);
              }}
            >
              {confirm?.kind === "delete" ? "Διαγραφή" : "Αφαίρεση"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserForm({ tenantId, user, onDone }: { tenantId: string; user: TenantUserRow | null; onDone: () => void }) {
  const [state, action, saving] = useActionState<TenantUserState, FormData>(saveTenantUser.bind(null, tenantId), {});
  const reset = !!(user as (TenantUserRow & { _reset?: boolean }) | null)?._reset;
  const [password, setPassword] = useState(reset ? newPassword() : "");
  const [active, setActive] = useState(user?.active ?? true);
  const [welcome, setWelcome] = useState(!user);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
      done();
    } else if (state.message) toast.error(state.message);
  }, [state]);

  const err = state.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="tu-name">Ονοματεπώνυμο</Label>
        <Input id="tu-name" name="name" defaultValue={user?.name} required autoComplete="off" />
        {err.name && <p className="text-xs text-destructive">{err.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tu-email">Email</Label>
        <Input id="tu-email" name="email" type="email" defaultValue={user?.email} required autoComplete="off" />
        {err.email && <p className="text-xs text-destructive">{err.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tu-password">{user ? "Νέος κωδικός" : "Αρχικός κωδικός"}</Label>
        <div className="flex gap-2">
          <Input
            id="tu-password"
            name="password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={user ? "αμετάβλητος" : welcome ? "προαιρετικό — ο χρήστης τον ορίζει από το email" : "τουλάχιστον 10 χαρακτήρες"}
            autoComplete="new-password"
            className="font-mono"
          />
          <Button type="button" variant="outline" onClick={() => setPassword(newPassword())}>
            Δημιουργία
          </Button>
        </div>
        {err.password ? (
          <p className="text-xs text-destructive">{err.password}</p>
        ) : (
          password && !welcome && <p className="text-xs text-muted-foreground">Σημειώστε τον κωδικό και δώστε τον στον χρήστη — δεν θα εμφανιστεί ξανά.</p>
        )}
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tu-role">Ρόλος</Label>
          <select id="tu-role" name="role" defaultValue={user?.role ?? "TENANT_USER"} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            <option value="TENANT_USER">{ROLE.TENANT_USER} — μόνο ανάγνωση</option>
            <option value="TENANT_OPERATOR">{ROLE.TENANT_OPERATOR} — εκτελέσεις, μαζικές εργασίες</option>
            <option value="TENANT_DESIGNER">{ROLE.TENANT_DESIGNER} — καταγραφές, ροές, συστήματα</option>
            <option value="TENANT_ADMIN">{ROLE.TENANT_ADMIN} — όλα, μαζί με μέλη και εγκρίσεις</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="tu-active" name="active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="tu-active">Ενεργός</Label>
        </div>
      </div>
      {!user && (
        <label className="flex items-center justify-between gap-3 rounded-md border p-3">
          <span>
            <span className="block text-sm font-medium">Email πρόσβασης</span>
            <span className="text-xs text-muted-foreground">Ο χρήστης λαμβάνει σύνδεσμο για να ορίσει μόνος του κωδικό (ισχύει 7 ημέρες).</span>
          </span>
          <Switch name="sendWelcome" checked={welcome} onCheckedChange={setWelcome} />
        </label>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Άκυρο
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Αποθήκευση…" : user ? "Αποθήκευση" : "Δημιουργία χρήστη"}
        </Button>
      </DialogFooter>
    </form>
  );
}
