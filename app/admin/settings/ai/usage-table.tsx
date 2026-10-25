"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import type { TenantUsageRow } from "@/lib/openrouter";

const usd = (n: number) => `$${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const int = (n: number) => n.toLocaleString("el-GR");

const columns: ColumnDef<TenantUsageRow, unknown>[] = [
  {
    accessorKey: "tenantName",
    header: "Tenant",
    size: 220,
    meta: { label: "Tenant", grow: true },
    cell: ({ row }) =>
      row.original.tenantId ? (
        <Link href={`/admin/tenants/${row.original.tenantId}`} className="truncate hover:text-primary hover:underline">
          {row.original.tenantName}
        </Link>
      ) : (
        <span className="text-muted-foreground">{row.original.tenantName}</span>
      ),
  },
  { accessorKey: "requests", header: "Κλήσεις", size: 80, meta: { label: "Κλήσεις", align: "right" }, cell: ({ getValue }) => int(getValue() as number) },
  {
    accessorKey: "failed",
    header: "Αποτυχίες",
    size: 90,
    meta: { label: "Αποτυχίες", align: "right" },
    cell: ({ getValue }) => {
      const n = getValue() as number;
      return n ? <span className="text-red-700">{int(n)}</span> : <span className="text-muted-foreground">—</span>;
    },
  },
  { accessorKey: "promptTokens", header: "Tokens εισόδου", size: 120, meta: { label: "Tokens εισόδου", align: "right" }, cell: ({ getValue }) => int(getValue() as number) },
  { accessorKey: "completionTokens", header: "Tokens εξόδου", size: 120, meta: { label: "Tokens εξόδου", align: "right" }, cell: ({ getValue }) => int(getValue() as number) },
  { accessorKey: "costUsd", header: "Κόστος OpenRouter", size: 140, meta: { label: "Κόστος OpenRouter", align: "right" }, cell: ({ getValue }) => usd(getValue() as number) },
  {
    accessorKey: "billedUsd",
    header: "Χρέωση πελάτη",
    size: 125,
    meta: { label: "Χρέωση πελάτη", align: "right" },
    cell: ({ getValue }) => <span className="font-medium">{usd(getValue() as number)}</span>,
  },
  {
    id: "margin",
    accessorFn: (r) => r.billedUsd - r.costUsd,
    header: "Περιθώριο",
    size: 110,
    meta: { label: "Περιθώριο", align: "right" },
    cell: ({ getValue }) => <span className="text-success-500">{usd(getValue() as number)}</span>,
  },
];

export function UsageTable({ data, month }: { data: TenantUsageRow[]; month: string }) {
  return (
    <DataTable
      storageKey="ai-usage"
      columns={columns}
      data={data}
      searchPlaceholder="Αναζήτηση tenant…"
      initialSorting={[{ id: "costUsd", desc: true }]}
      emptyMessage={`Καμία χρήση AI — ${month}.`}
      initialHidden={["promptTokens", "completionTokens"]}
    />
  );
}
