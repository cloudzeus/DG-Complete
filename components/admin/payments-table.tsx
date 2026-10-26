"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, RotateCw, Send } from "lucide-react";
import { toast } from "@/components/dg/notice";
import { StatusPill } from "@/components/admin/tone";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { postPayment } from "@/app/admin/payments/actions";

export type PaymentRow = {
  id: string;
  paidAt: string;
  amount: string;
  description: string;
  method: string;
  status: string;
  s1Status: string;
  s1Fincode: string | null;
  s1Findoc: number | null;
  s1Error: string | null;
  tenant?: { id: string; name: string };
};

const METHOD: Record<string, string> = { CARD: "Κάρτα", BANK_TRANSFER: "Τράπεζα", CASH: "Μετρητά", VIVA: "Viva" };
const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });

function Actions({ row, canPost }: { row: PaymentRow; canPost: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const postable = canPost && row.status === "PAID" && (row.s1Status === "NOT_POSTED" || row.s1Status === "FAILED");
  return (
    <RowActions
      label={row.description}
      disabled={pending}
      actions={[
        {
          label: row.s1Status === "FAILED" ? "Επανάληψη αποστολής" : "Αποστολή στο SoftOne",
          icon: row.s1Status === "FAILED" ? RotateCw : Send,
          hidden: !postable,
          onSelect: () =>
            start(async () => {
              const r = await postPayment(row.id);
              if (r.ok) toast.success(`Καταχωρήθηκε στο SoftOne${r.fincode ? `: ${r.fincode}` : ""}`);
              else toast.error("Η αποστολή απέτυχε", { description: r.error });
            }),
        },
        {
          label: "Άνοιγμα tenant",
          icon: Building2,
          hidden: !row.tenant,
          separated: postable,
          onSelect: () => router.push(`/admin/tenants/${row.tenant!.id}`),
        },
      ]}
    />
  );
}

export function PaymentsTable({
  payments,
  canPost,
  toolbar,
  storageKey = "payments",
}: {
  payments: PaymentRow[];
  canPost: boolean;
  toolbar?: React.ReactNode;
  storageKey?: string;
}) {
  const showTenant = payments.some((p) => p.tenant);
  const columns: ColumnDef<PaymentRow, unknown>[] = [
    {
      accessorKey: "paidAt",
      header: "Ημερομηνία",
      size: 110,
      meta: { label: "Ημερομηνία" },
      cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString("el-GR"),
    },
    ...(showTenant
      ? ([
          {
            id: "tenant",
            accessorFn: (r) => r.tenant?.name ?? "",
            header: "Tenant",
            size: 200,
            meta: { label: "Tenant" },
            cell: ({ row }) =>
              row.original.tenant && (
                <Link href={`/admin/tenants/${row.original.tenant.id}`} className="truncate hover:text-primary hover:underline">
                  {row.original.tenant.name}
                </Link>
              ),
          },
        ] satisfies ColumnDef<PaymentRow, unknown>[])
      : []),
    { accessorKey: "description", header: "Περιγραφή", size: 260, meta: { label: "Περιγραφή" } },
    {
      accessorKey: "method",
      header: "Τρόπος",
      size: 100,
      meta: { label: "Τρόπος" },
      cell: ({ getValue }) => METHOD[getValue() as string] ?? (getValue() as string),
    },
    {
      id: "amount",
      accessorFn: (r) => Number(r.amount),
      header: "Ποσό",
      size: 110,
      meta: { label: "Ποσό", align: "right" },
      cell: ({ getValue }) => <span className="font-semibold">{eur.format(getValue() as number)}</span>,
    },
    {
      accessorKey: "s1Status",
      header: "SoftOne",
      size: 170,
      meta: { label: "SoftOne" },
      cell: ({ row }) => {
        const p = row.original;
        if (p.s1Status === "POSTED")
          return (
            <span className="flex min-w-0 flex-col gap-0.5" title={p.s1Error ?? undefined}>
              <StatusPill tone="green">{p.s1Fincode ?? "Καταχωρήθηκε"}</StatusPill>
              {p.s1Error && <span className="truncate text-xs text-warning-500">{p.s1Error}</span>}
            </span>
          );
        if (p.s1Status === "POSTING") return <StatusPill tone="blue">Αποστολή…</StatusPill>;
        if (p.s1Status === "FAILED")
          return (
            <span className="flex min-w-0 flex-col gap-0.5" title={p.s1Error ?? undefined}>
              <StatusPill tone="red">Σφάλμα</StatusPill>
              <span className="truncate text-xs text-destructive">{p.s1Error}</span>
            </span>
          );
        return <StatusPill tone="amber">Εκκρεμεί</StatusPill>;
      },
    },
    {
      id: "actions",
      header: "",
      size: 52,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      meta: { fixed: true, align: "right" },
      cell: ({ row }) => <Actions row={row.original} canPost={canPost} />,
    },
  ];

  return (
    <DataTable
      storageKey={storageKey}
      columns={columns}
      data={payments}
      toolbar={toolbar}
      searchPlaceholder="Αναζήτηση πληρωμών…"
      initialSorting={[{ id: "paidAt", desc: true }]}
      initialHidden={["method"]}
      emptyMessage="Καμία πληρωμή."
    />
  );
}
