"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, CheckCircle2, DatabaseZap, Eye, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { StatusPill, type Tone } from "@/components/admin/tone";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { provisionWarehouse, setTenantStatus } from "./[id]/actions";

export type TenantRow = {
  id: string;
  name: string;
  email: string | null;
  afm: string | null;
  s1Code: string | null;
  status: string;
  isDemo: boolean;
  warehouseStatus: string;
  users: number;
  connections: number;
  createdAt: string;
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Σε αναμονή", tone: "amber" },
  ACTIVE: { label: "Ενεργός", tone: "green" },
  SUSPENDED: { label: "Σε αναστολή", tone: "red" },
  CANCELED: { label: "Ακυρωμένος", tone: "slate" },
};

const WAREHOUSE: Record<string, { label: string; tone: Tone }> = {
  NONE: { label: "—", tone: "slate" },
  READY: { label: "Έτοιμο", tone: "teal" },
  DISABLED: { label: "Ανενεργό", tone: "amber" },
  ERROR: { label: "Σφάλμα", tone: "red" },
};

function Actions({ row, canManage }: { row: TenantRow; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  return (
    <RowActions
      label={row.name}
      disabled={pending}
      actions={[
        { label: "Προβολή", icon: Eye, onSelect: () => router.push(`/admin/tenants/${row.id}`) },
        {
          label: row.warehouseStatus === "NONE" ? "Provisioning" : "Επανάληψη provisioning",
          icon: DatabaseZap,
          onSelect: () => run(() => provisionWarehouse(row.id)),
          hidden: !canManage,
          separated: true,
        },
        {
          label: "Ενεργοποίηση",
          icon: CheckCircle2,
          onSelect: () => run(() => setTenantStatus(row.id, "ACTIVE")),
          hidden: !canManage || row.status === "ACTIVE",
        },
        {
          label: "Αναστολή",
          icon: PauseCircle,
          onSelect: () => run(() => setTenantStatus(row.id, "SUSPENDED")),
          hidden: !canManage || row.status === "SUSPENDED",
        },
        {
          label: "Ακύρωση",
          icon: Ban,
          destructive: true,
          separated: true,
          onSelect: () => run(() => setTenantStatus(row.id, "CANCELED")),
          hidden: !canManage || row.status === "CANCELED",
        },
      ]}
    />
  );
}

export function TenantsTable({ data, canManage, toolbar }: { data: TenantRow[]; canManage: boolean; toolbar?: React.ReactNode }) {
  const columns: ColumnDef<TenantRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Επωνυμία",
      size: 260,
      meta: { label: "Επωνυμία" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <Link href={`/admin/tenants/${row.original.id}`} className="truncate text-foreground hover:text-primary hover:underline">
              {row.original.name}
            </Link>
            {row.original.isDemo && <StatusPill tone="violet">Demo</StatusPill>}
          </span>
          {row.original.email && <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>}
        </div>
      ),
    },
    { accessorKey: "s1Code", header: "Κωδ. SoftOne", size: 120, meta: { label: "Κωδ. SoftOne" }, cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) ?? "—"}</span> },
    { accessorKey: "afm", header: "ΑΦΜ", size: 110, meta: { label: "ΑΦΜ" }, cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) ?? "—"}</span> },
    {
      accessorKey: "status",
      header: "Κατάσταση",
      size: 130,
      meta: { label: "Κατάσταση" },
      sortingFn: (a, b) => STATUS[a.original.status].label.localeCompare(STATUS[b.original.status].label, "el"),
      cell: ({ row }) => <StatusPill tone={STATUS[row.original.status].tone}>{STATUS[row.original.status].label}</StatusPill>,
    },
    {
      accessorKey: "warehouseStatus",
      header: "Cube",
      size: 110,
      meta: { label: "Cube" },
      cell: ({ row }) => (
        <StatusPill tone={WAREHOUSE[row.original.warehouseStatus].tone}>{WAREHOUSE[row.original.warehouseStatus].label}</StatusPill>
      ),
    },
    { accessorKey: "users", header: "Χρήστες", size: 90, meta: { label: "Χρήστες", align: "right" } },
    { accessorKey: "connections", header: "Συνδέσεις", size: 100, meta: { label: "Συνδέσεις", align: "right" } },
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
      cell: ({ row }) => <Actions row={row.original} canManage={canManage} />,
    },
  ];

  return (
    <DataTable
      storageKey="tenants"
      columns={columns}
      data={data}
      toolbar={toolbar}
      searchPlaceholder="Αναζήτηση επωνυμίας, ΑΦΜ, κωδικού…"
      initialSorting={[{ id: "name", desc: false }]}
      initialHidden={["createdAt"]}
      emptyMessage="Δεν υπάρχουν tenants ακόμα — δημιουργήστε από τους Πελάτες SoftOne."
    />
  );
}
