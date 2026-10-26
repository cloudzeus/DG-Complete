"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { StatusPill } from "@/components/admin/tone";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { Button } from "@/components/ui/button";
import { setUserActive } from "./actions";
import { UserDialog, type UserValues } from "./user-dialog";

export type UserRow = UserValues & { createdAt: string };

const ROLE: Record<string, { label: string; tone: "red" | "blue" | "slate" }> = {
  SUPER_ADMIN: { label: "Super admin", tone: "red" },
  ADMIN: { label: "Admin", tone: "blue" },
  USER: { label: "Χρήστης πελάτη", tone: "slate" },
};

export function UsersTable({
  data,
  tenants,
  currentUserId,
  canManagePlatformRoles,
  canCreate,
}: {
  data: UserRow[];
  tenants: { id: string; name: string }[];
  currentUserId: string;
  canManagePlatformRoles: boolean;
  canCreate: boolean;
}) {
  // One dialog for the whole table: "new" or the row being edited.
  const [editing, setEditing] = useState<UserValues | "new" | null>(null);
  const [pending, start] = useTransition();

  const toggleActive = (u: UserRow) =>
    start(async () => {
      const r = await setUserActive(u.id, !u.active);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Χρήστης",
      size: 240,
      meta: { label: "Χρήστης" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">
            {row.original.name}
            {row.original.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(εσείς)</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
        </div>
      ),
    },
    {
      accessorKey: "platformRole",
      header: "Ρόλος",
      size: 140,
      meta: { label: "Ρόλος" },
      cell: ({ getValue }) => {
        const r = ROLE[getValue() as string];
        return <StatusPill tone={r.tone}>{r.label}</StatusPill>;
      },
    },
    {
      id: "tenants",
      accessorFn: (r) => r.memberships.map((m) => m.tenantName).join(", "),
      header: "Tenants",
      size: 260,
      meta: { label: "Tenants" },
      cell: ({ row }) =>
        row.original.memberships.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="truncate" title={row.original.memberships.map((m) => m.tenantName).join(", ")}>
            {row.original.memberships.map((m) => m.tenantName).join(", ")}
          </span>
        ),
    },
    {
      accessorKey: "active",
      header: "Κατάσταση",
      size: 110,
      meta: { label: "Κατάσταση" },
      cell: ({ getValue }) =>
        getValue() ? <StatusPill tone="green">Ενεργός</StatusPill> : <StatusPill tone="slate">Ανενεργός</StatusPill>,
    },
    {
      accessorKey: "createdAt",
      header: "Δημιουργία",
      size: 110,
      meta: { label: "Δημιουργία" },
      cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString("el-GR"),
    },
    {
      id: "actions",
      header: "",
      size: 52,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      meta: { fixed: true, align: "right" },
      cell: ({ row }) => {
        const u = row.original;
        const editable = u.platformRole === "USER" || canManagePlatformRoles;
        return (
          <RowActions
            label={u.email}
            disabled={pending}
            actions={[
              { label: "Επεξεργασία", icon: Pencil, onSelect: () => setEditing(u), hidden: !editable },
              {
                label: u.active ? "Απενεργοποίηση" : "Ενεργοποίηση",
                icon: u.active ? UserX : UserCheck,
                destructive: u.active,
                separated: true,
                hidden: !editable || u.id === currentUserId,
                onSelect: () => toggleActive(u),
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        storageKey="users"
        columns={columns}
        data={data}
        searchPlaceholder="Όνομα, email, tenant…"
        initialSorting={[{ id: "name", desc: false }]}
        initialHidden={["createdAt"]}
        toolbar={
          canCreate ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus />
              Νέος χρήστης
            </Button>
          ) : null
        }
      />
      <UserDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        user={editing && editing !== "new" ? editing : undefined}
        tenants={tenants}
        canManagePlatformRoles={canManagePlatformRoles}
      />
    </>
  );
}
