"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/admin/tone";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTenantFromCustomer } from "./actions";

export type CustomerRow = {
  id: string;
  trdr: number;
  code: string;
  name: string;
  afm: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  isActive: boolean;
  syncedAt: string;
  tenant: { id: string; name: string } | null;
};

type Filter = "all" | "linked" | "unlinked";

function Actions({ row, canManage }: { row: CustomerRow; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <RowActions
      label={row.name}
      disabled={pending}
      actions={[
        {
          label: "Άνοιγμα tenant",
          icon: Building2,
          onSelect: () => router.push(`/admin/tenants/${row.tenant!.id}`),
          hidden: !row.tenant,
        },
        {
          label: "Δημιουργία tenant",
          icon: Plus,
          hidden: !!row.tenant || !canManage,
          onSelect: () =>
            start(async () => {
              const r = await createTenantFromCustomer(row.id);
              if (r.ok) {
                toast.success("Ο tenant δημιουργήθηκε.");
                router.push(`/admin/tenants/${r.tenantId}`);
              } else toast.error(r.message);
            }),
        },
      ]}
    />
  );
}

export function CustomersTable({
  data,
  canManage,
  initialFilter,
}: {
  data: CustomerRow[];
  canManage: boolean;
  initialFilter: Filter;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const rows = useMemo(
    () => (filter === "all" ? data : data.filter((r) => (filter === "linked" ? !!r.tenant : !r.tenant))),
    [data, filter],
  );

  const columns: ColumnDef<CustomerRow, unknown>[] = [
    { accessorKey: "code", header: "Κωδικός", size: 100, meta: { label: "Κωδικός" }, cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    {
      accessorKey: "name",
      header: "Επωνυμία",
      size: 280,
      meta: { label: "Επωνυμία" },
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.original.name}</span>
          {!row.original.isActive && <StatusPill tone="slate">Ανενεργός</StatusPill>}
        </span>
      ),
    },
    { accessorKey: "afm", header: "ΑΦΜ", size: 110, meta: { label: "ΑΦΜ" }, cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) ?? "—"}</span> },
    { accessorKey: "email", header: "Email", size: 200, meta: { label: "Email" }, cell: ({ getValue }) => (getValue() as string) ?? "—" },
    { accessorKey: "phone", header: "Τηλέφωνο", size: 120, meta: { label: "Τηλέφωνο" }, cell: ({ getValue }) => (getValue() as string) ?? "—" },
    { accessorKey: "city", header: "Πόλη", size: 120, meta: { label: "Πόλη" }, cell: ({ getValue }) => (getValue() as string) ?? "—" },
    {
      id: "tenant",
      accessorFn: (r) => r.tenant?.name ?? "",
      header: "Tenant",
      size: 200,
      meta: { label: "Tenant" },
      cell: ({ row }) =>
        row.original.tenant ? (
          <Link href={`/admin/tenants/${row.original.tenant.id}`} className="truncate text-primary hover:underline">
            {row.original.tenant.name}
          </Link>
        ) : (
          <StatusPill tone="amber">Χωρίς tenant</StatusPill>
        ),
    },
    {
      accessorKey: "syncedAt",
      header: "Συγχρονισμός",
      size: 140,
      meta: { label: "Συγχρονισμός" },
      cell: ({ getValue }) => new Date(getValue() as string).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }),
    },
    {
      id: "actions",
      header: "",
      size: 52,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      meta: { fixed: true, align: "right" },
      cell: ({ row }) => <Actions row={row.original} canManage={canManage} />,
    },
  ];

  return (
    <DataTable
      storageKey="s1-customers"
      columns={columns}
      data={rows}
      searchPlaceholder="Επωνυμία, κωδικός, ΑΦΜ, email…"
      initialSorting={[{ id: "name", desc: false }]}
      initialHidden={["phone", "city", "syncedAt"]}
      emptyMessage="Πατήστε «Συγχρονισμός» για να φέρετε τους πελάτες από το SoftOne."
      toolbar={
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Φίλτρο αντιστοίχισης">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Όλοι</SelectItem>
            <SelectItem value="unlinked">Χωρίς tenant</SelectItem>
            <SelectItem value="linked">Με tenant</SelectItem>
          </SelectContent>
        </Select>
      }
    />
  );
}
