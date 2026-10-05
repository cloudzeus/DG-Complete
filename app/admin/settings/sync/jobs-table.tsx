"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pause, Pencil, Play, Plus, RefreshCcw, Table2, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusPill } from "@/components/admin/tone";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
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
import { deleteJob, runJobNow, setJobEnabled } from "./actions";
import { JobDialog, type JobValues } from "./job-dialog";

export type JobRow = JobValues & {
  lastRunAt: string | null;
  lastStatus: string | null;
  nextRunAt: string | null;
  records: number;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }) : "—";

const every = (m: number) =>
  m % 1440 === 0 ? `${m / 1440} ημ.` : m % 60 === 0 ? `${m / 60} ώρ.` : `${m} λεπ.`;

export function JobsTable({
  data,
  connected,
  toolbar,
  canCreate = true,
  dataHref = (id: string) => `/admin/settings/sync/${id}`,
  storageKey = "sync-jobs",
}: {
  data: JobRow[];
  connected: boolean;
  toolbar?: React.ReactNode;
  canCreate?: boolean;
  dataHref?: (id: string) => string;
  storageKey?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<JobValues | "new" | null>(null);
  const [deleting, setDeleting] = useState<JobRow | null>(null);
  const [pending, start] = useTransition();

  const run = (row: JobRow, mode: "FULL" | "INCREMENTAL") =>
    start(async () => {
      const id = toast.loading(`Εκτέλεση «${row.name}»…`);
      const r = await runJobNow(row.id, mode);
      toast.dismiss(id);
      if (r.ok) toast.success(`«${row.name}»: ${r.rowsUpserted} εγγραφές${r.tenantsUpdated ? `, ${r.tenantsUpdated} tenants` : ""}.`);
      else toast.error(r.busy ? "Εκτελείται ήδη" : `«${row.name}» απέτυχε`, { description: r.error });
    });

  const simple = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });

  const columns: ColumnDef<JobRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Συγχρονισμός",
      size: 240,
      meta: { label: "Συγχρονισμός" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate">
            <a href={dataHref(row.original.id)} className="truncate hover:text-primary hover:underline">
              {row.original.name}
            </a>
            {row.original.type === "CUSTOMERS" && <StatusPill tone="violet">ενσωματωμένο</StatusPill>}
          </div>

        </div>
      ),
    },
    {
      accessorKey: "intervalMinutes",
      header: "Συχνότητα",
      size: 120,
      meta: { label: "Συχνότητα" },
      cell: ({ getValue }) => `κάθε ${every(getValue() as number)}`,
    },
    {
      accessorKey: "enabled",
      header: "Κατάσταση",
      size: 120,
      meta: { label: "Κατάσταση" },
      cell: ({ getValue }) => (getValue() ? <StatusPill tone="green">Ενεργό</StatusPill> : <StatusPill tone="slate">Παύση</StatusPill>),
    },
    {
      accessorKey: "lastStatus",
      header: "Τελευταία εκτέλεση",
      size: 190,
      meta: { label: "Τελευταία εκτέλεση" },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.lastStatus === "SUCCESS" && <StatusPill tone="green">OK</StatusPill>}
          {row.original.lastStatus === "FAILED" && <StatusPill tone="red">Σφάλμα</StatusPill>}
          {row.original.lastStatus === "RUNNING" && <StatusPill tone="blue">Τρέχει</StatusPill>}
          <span className="text-xs text-muted-foreground">{fmt(row.original.lastRunAt)}</span>
        </span>
      ),
    },
    {
      accessorKey: "nextRunAt",
      header: "Επόμενη",
      size: 130,
      meta: { label: "Επόμενη" },
      cell: ({ row }) => (row.original.enabled ? (row.original.nextRunAt ? fmt(row.original.nextRunAt) : "στο επόμενο tick") : "—"),
    },
    { accessorKey: "records", header: "Εγγραφές", size: 110, meta: { label: "Εγγραφές", align: "right" }, cell: ({ getValue }) => (getValue() as number).toLocaleString("el-GR") },
    {
      id: "actions",
      header: "",
      size: 52,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      meta: { fixed: true, align: "right" },
      cell: ({ row }) => {
        const j = row.original;
        return (
          <RowActions
            label={j.name}
            disabled={pending || !connected}
            actions={[
              { label: "Δεδομένα", icon: Table2, onSelect: () => router.push(dataHref(j.id)) },
              { label: "Εκτέλεση τώρα", icon: Zap, onSelect: () => run(j, "INCREMENTAL"), separated: true },
              { label: "Πλήρης εκτέλεση", icon: RefreshCcw, onSelect: () => run(j, "FULL"), hidden: !j.updField },
              { label: "Επεξεργασία", icon: Pencil, onSelect: () => setEditing(j), separated: true },
              {
                label: j.enabled ? "Παύση" : "Ενεργοποίηση",
                icon: j.enabled ? Pause : Play,
                onSelect: () => simple(() => setJobEnabled(j.id, !j.enabled)),
              },
              { label: "Διαγραφή", icon: Trash2, destructive: true, separated: true, hidden: j.type === "CUSTOMERS", onSelect: () => setDeleting(j) },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        storageKey={storageKey}
        columns={columns}
        data={data}
        searchPlaceholder="Αναζήτηση συγχρονισμών…"
        initialSorting={[{ id: "name", desc: false }]}
        emptyMessage="Κανένας συγχρονισμός ακόμα."
        toolbar={
          <>
            {toolbar}
            {canCreate && (
              <Button size="sm" onClick={() => setEditing("new")} disabled={!connected}>
                <Plus />
                Νέος συγχρονισμός
              </Button>
            )}
          </>
        }
      />
      <JobDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} job={editing && editing !== "new" ? editing : undefined} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{deleting?.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Διαγράφονται το job, το ιστορικό του και οι {deleting?.records.toLocaleString("el-GR")} συγχρονισμένες εγγραφές
              στην εφαρμογή. Το SoftOne δεν επηρεάζεται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && simple(() => deleteJob(deleting.id))}>Διαγραφή</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
