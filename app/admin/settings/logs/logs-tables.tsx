"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusPill, type Tone } from "@/components/admin/tone";
import { DataTable } from "@/components/data-table/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RowActions } from "@/components/data-table/row-actions";
import { Eye } from "lucide-react";

const when = (iso: string) => new Date(iso).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "medium" });

// ───────────── Audit log ─────────────

export type AuditRow = {
  id: string;
  createdAt: string;
  actor: string | null;
  tenant: string | null;
  action: string;
  entity: string;
  meta: unknown;
};

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  "connection.create": { label: "Νέα σύνδεση δεδομένων", tone: "teal" },
  "connection.update": { label: "Αλλαγή σύνδεσης δεδομένων", tone: "teal" },
  "connection.delete": { label: "Διαγραφή σύνδεσης δεδομένων", tone: "red" },
  "tenant.create": { label: "Νέος tenant", tone: "blue" },
  "tenant.status": { label: "Αλλαγή κατάστασης tenant", tone: "amber" },
  "tenant.warehouse.provision": { label: "Provisioning αποθήκης", tone: "teal" },
  "tenant.s1.link": { label: "Αντιστοίχιση με πελάτη SoftOne", tone: "violet" },
  "tenant.s1.unlink": { label: "Αποσύνδεση από πελάτη SoftOne", tone: "amber" },
  "user.create": { label: "Νέος χρήστης", tone: "blue" },
  "user.update": { label: "Αλλαγή χρήστη", tone: "blue" },
  "user.activate": { label: "Ενεργοποίηση χρήστη", tone: "green" },
  "user.deactivate": { label: "Απενεργοποίηση χρήστη", tone: "red" },
  "membership.set": { label: "Πρόσβαση σε tenant", tone: "blue" },
  "membership.remove": { label: "Αφαίρεση πρόσβασης", tone: "amber" },
  "rbac.update": { label: "Αλλαγή δικαιωμάτων", tone: "red" },
  "rbac.reset": { label: "Επαναφορά δικαιωμάτων", tone: "red" },
  "softone.create": { label: "Σύνδεση SoftOne", tone: "violet" },
  "softone.update": { label: "Αλλαγή σύνδεσης SoftOne", tone: "violet" },
  "softone.billing.update": { label: "Ρυθμίσεις τιμολόγησης", tone: "green" },
  "softone.customers.sync": { label: "Συγχρονισμός πελατών", tone: "violet" },
  "sync.job.create": { label: "Νέος συγχρονισμός", tone: "violet" },
  "sync.job.update": { label: "Αλλαγή συγχρονισμού", tone: "violet" },
  "sync.job.delete": { label: "Διαγραφή συγχρονισμού", tone: "red" },
  "sync.job.run": { label: "Χειροκίνητη εκτέλεση", tone: "violet" },
  "sync.job.enable": { label: "Ενεργοποίηση συγχρονισμού", tone: "green" },
  "sync.job.disable": { label: "Παύση συγχρονισμού", tone: "amber" },
  "sync.job.seed": { label: "Προεπιλεγμένοι πίνακες", tone: "violet" },
  "payment.create": { label: "Νέα πληρωμή", tone: "green" },
  "payment.s1.post": { label: "Αποστολή πληρωμής στο SoftOne", tone: "green" },
  "cube.create": { label: "Ρύθμιση Cube", tone: "red" },
  "cube.update": { label: "Αλλαγή ρυθμίσεων Cube", tone: "red" },
  "cube.secrets.reveal": { label: "Εμφάνιση secrets Cube", tone: "red" },
  "cube.secrets.rotate": { label: "Νέα secrets Cube", tone: "red" },
};

export function AuditTable({ data }: { data: AuditRow[] }) {
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const columns: ColumnDef<AuditRow, unknown>[] = [
    { accessorKey: "createdAt", header: "Πότε", size: 150, meta: { label: "Πότε" }, cell: ({ getValue }) => when(getValue() as string) },
    { accessorKey: "actor", header: "Χρήστης", size: 170, meta: { label: "Χρήστης" }, cell: ({ getValue }) => (getValue() as string) ?? <span className="text-muted-foreground">σύστημα</span> },
    {
      id: "action",
      accessorFn: (r) => ACTIONS[r.action]?.label ?? r.action,
      header: "Ενέργεια",
      size: 260,
      meta: { label: "Ενέργεια", grow: true },
      cell: ({ row }) => {
        const a = ACTIONS[row.original.action];
        return <StatusPill tone={a?.tone ?? "slate"}>{a?.label ?? row.original.action}</StatusPill>;
      },
    },
    { accessorKey: "tenant", header: "Tenant", size: 180, meta: { label: "Tenant" }, cell: ({ getValue }) => (getValue() as string) ?? "—" },
    {
      id: "actions",
      header: "",
      size: 52,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      meta: { fixed: true, align: "right" },
      cell: ({ row }) => (
        <RowActions actions={[{ label: "Λεπτομέρειες", icon: Eye, onSelect: () => setDetail(row.original), hidden: !row.original.meta }]} />
      ),
    },
  ];
  return (
    <>
      <DataTable storageKey="logs-audit" columns={columns} data={data} searchPlaceholder="Χρήστης, ενέργεια, tenant…" initialSorting={[{ id: "createdAt", desc: true }]} initialPageSize={50} emptyMessage="Καμία καταγραφή." />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail && (ACTIONS[detail.action]?.label ?? detail.action)}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60svh] overflow-auto rounded-md bg-muted p-3 font-mono text-2xs leading-relaxed">
            {detail && JSON.stringify(detail.meta, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────── Sync runs ─────────────

export type RunRow = {
  id: string;
  startedAt: string;
  durationMs: number | null;
  job: string;
  mode: string;
  trigger: string;
  status: string;
  rows: number;
  error: string | null;
};

export function RunsTable({ data, storageKey = "logs-runs" }: { data: RunRow[]; storageKey?: string }) {
  const columns: ColumnDef<RunRow, unknown>[] = [
    { accessorKey: "startedAt", header: "Έναρξη", size: 150, meta: { label: "Έναρξη" }, cell: ({ getValue }) => when(getValue() as string) },
    { accessorKey: "job", header: "Συγχρονισμός", size: 220, meta: { label: "Συγχρονισμός", grow: true } },
    {
      accessorKey: "status",
      header: "Αποτέλεσμα",
      size: 120,
      meta: { label: "Αποτέλεσμα" },
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <StatusPill tone={s === "SUCCESS" ? "green" : s === "FAILED" ? "red" : "blue"}>{s === "SUCCESS" ? "Επιτυχία" : s === "FAILED" ? "Σφάλμα" : "Σε εξέλιξη"}</StatusPill>;
      },
    },
    { accessorKey: "mode", header: "Τύπος", size: 100, meta: { label: "Τύπος" }, cell: ({ getValue }) => (getValue() === "FULL" ? "Πλήρης" : "Αυξητικός") },
    { accessorKey: "trigger", header: "Από", size: 110, meta: { label: "Από" }, cell: ({ getValue }) => (getValue() === "cron" ? "Scheduler" : "Χειροκίνητα") },
    { accessorKey: "rows", header: "Εγγραφές", size: 100, meta: { label: "Εγγραφές", align: "right" }, cell: ({ getValue }) => (getValue() as number).toLocaleString("el-GR") },
    {
      accessorKey: "durationMs",
      header: "Διάρκεια",
      size: 100,
      meta: { label: "Διάρκεια", align: "right" },
      cell: ({ getValue }) => {
        const ms = getValue() as number | null;
        return ms === null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
      },
    },
    {
      accessorKey: "error",
      header: "Σφάλμα",
      size: 260,
      meta: { label: "Σφάλμα" },
      cell: ({ getValue }) => {
        const e = getValue() as string | null;
        return e ? <span className="text-destructive" title={e}>{e}</span> : <span className="text-muted-foreground">—</span>;
      },
    },
  ];
  return <DataTable storageKey={storageKey} columns={columns} data={data} searchPlaceholder="Αναζήτηση εκτελέσεων…" initialSorting={[{ id: "startedAt", desc: true }]} initialPageSize={50} emptyMessage="Καμία εκτέλεση." />;
}

// ───────────── Errors (everything that failed) ─────────────

export type ErrorRow = { id: string; at: string; source: string; subject: string; message: string };

export function ErrorsTable({ data }: { data: ErrorRow[] }) {
  const columns: ColumnDef<ErrorRow, unknown>[] = [
    { accessorKey: "at", header: "Πότε", size: 150, meta: { label: "Πότε" }, cell: ({ getValue }) => when(getValue() as string) },
    { accessorKey: "source", header: "Πηγή", size: 140, meta: { label: "Πηγή" }, cell: ({ getValue }) => <StatusPill tone="red">{getValue() as string}</StatusPill> },
    { accessorKey: "subject", header: "Αφορά", size: 200, meta: { label: "Αφορά" } },
    {
      accessorKey: "message",
      header: "Μήνυμα",
      size: 360,
      meta: { label: "Μήνυμα", grow: true },
      cell: ({ getValue }) => <span className="text-destructive" title={getValue() as string}>{getValue() as string}</span>,
    },
  ];
  return <DataTable storageKey="logs-errors" columns={columns} data={data} searchPlaceholder="Αναζήτηση σφαλμάτων…" initialSorting={[{ id: "at", desc: true }]} initialPageSize={50} emptyMessage="Κανένα σφάλμα." />;
}
