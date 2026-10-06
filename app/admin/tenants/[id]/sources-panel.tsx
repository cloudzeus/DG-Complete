"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Database, Pencil, PlugZap, Plus, Radar, ShoppingCart, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { SoftOneForm, type SoftOneValues } from "@/components/admin/softone-form";
import { StatusPill } from "@/components/admin/tone";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Capabilities } from "@/lib/softone-detect";
import { deleteTenantSoftOne, redetectTenantSoftOne, saveTenantSoftOne, testTenantSoftOne } from "./sources-actions";

export type TenantSoftOne = SoftOneValues & {
  host: string;
  lastTestStatus: string;
  capabilities: Capabilities | null;
  detectedAt: string | null;
};

type DbSource = { id: string; name: string; engine: string; database: string; lastTestStatus: string };

const ENGINE = { POSTGRES: "PostgreSQL", MYSQL: "MySQL", MSSQL: "SQL Server" } as Record<string, string>;

export function SourcesPanel({
  tenantId,
  softone,
  databases,
  canManage,
}: {
  tenantId: string;
  softone: TenantSoftOne | null;
  databases: DbSource[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  function detect() {
    if (!softone) return;
    start(async () => {
      const r = await redetectTenantSoftOne(tenantId, softone.id);
      if (r.ok) toast.success("Η ανίχνευση ολοκληρώθηκε.");
      else toast.error("Η ανίχνευση απέτυχε", { description: r.message });
    });
  }

  function remove() {
    if (!softone) return;
    start(async () => {
      const r = await deleteTenantSoftOne(tenantId, softone.id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      setConfirmDelete(false);
    });
  }

  const caps = softone?.capabilities;

  return (
    <div className="space-y-3">
      {/* SoftOne of the customer */}
      {softone ? (
        <div className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <PlugZap className="size-4 text-violet-600" />
                <span className="font-medium">SoftOne πελάτη</span>
                {softone.lastTestStatus === "OK" ? (
                  <StatusPill tone="green">Συνδεδεμένο</StatusPill>
                ) : softone.lastTestStatus === "UNTESTED" ? (
                  <StatusPill tone="slate">Ημιτελής</StatusPill>
                ) : (
                  <StatusPill tone="red">Σφάλμα</StatusPill>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {softone.host || "χωρίς διεύθυνση"} · εταιρεία {softone.company || "—"}
              </div>
            </div>
            {canManage && (
              <RowActions
                disabled={pending}
                actions={[
                  { label: "Ανίχνευση δεδομένων", icon: Radar, onSelect: detect },
                  { label: "Επεξεργασία", icon: Pencil, onSelect: () => setEditing(true) },
                  { label: "Διαγραφή", icon: Trash2, destructive: true, separated: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
            )}
          </div>

          {caps ? (
            <div className="mt-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <Capability icon={BookOpen} label="Γενική Λογιστική" probe={caps.gl} />
                <Capability icon={ShoppingCart} label="Πωλήσεις" probe={caps.sales} />
                <Capability icon={Truck} label="Αγορές" probe={caps.purchases} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Προτεινόμενη πηγή P&amp;L:</span>
                {caps.recommended === "GL" && <StatusPill tone="violet">Γενική Λογιστική</StatusPill>}
                {caps.recommended === "COMMERCIAL" && <StatusPill tone="blue">Εμπορικά παραστατικά</StatusPill>}
                {caps.recommended === "NONE" && <StatusPill tone="slate">Δεν βρέθηκαν κινήσεις</StatusPill>}
                {caps.fiscalYears.length > 0 && (
                  <span className="text-muted-foreground">
                    · Χρήσεις: {caps.fiscalYears.slice(0, 5).map((y) => y.year).join(", ")}
                    {caps.fiscalYears.length > 5 ? "…" : ""}
                  </span>
                )}
              </div>
              {softone.detectedAt && (
                <p className="text-2xs text-muted-foreground">
                  Ανίχνευση: {new Date(softone.detectedAt).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })} · βάσει
                  του προηγούμενου μήνα
                </p>
              )}
            </div>
          ) : (
            canManage && (
              <Button size="sm" variant="outline" className="mt-3" onClick={detect} disabled={pending}>
                <Radar />
                {pending ? "Ανίχνευση…" : "Ανίχνευση δεδομένων"}
              </Button>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">Δεν έχει οριστεί σύνδεση με το SoftOne του πελάτη.</p>
          {canManage && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Plus />
              Σύνδεση SoftOne πελάτη
            </Button>
          )}
        </div>
      )}

      {/* Database sources */}
      {databases.length > 0 && (
        <ul className="space-y-1">
          {databases.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Database className="size-4 shrink-0 text-teal-600" />
                <span className="truncate">{d.name}</span>
                <span className="text-xs text-muted-foreground">{ENGINE[d.engine] ?? d.engine}</span>
              </span>
              {d.lastTestStatus === "OK" ? <StatusPill tone="green">OK</StatusPill> : d.lastTestStatus === "FAILED" ? <StatusPill tone="red">Σφάλμα</StatusPill> : <StatusPill tone="slate">Μη ελεγμένη</StatusPill>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Άλλες βάσεις δεδομένων προστίθενται από τις{" "}
        <Link href="/admin/settings/connections" className="text-primary hover:underline">
          Συνδέσεις δεδομένων
        </Link>
        .
      </p>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>SoftOne πελάτη</DialogTitle>
            <DialogDescription>
              Τα στοιχεία Web Services του πελάτη. Ο χρήστης χρειάζεται δικαίωμα ανάγνωσης στη Γενική Λογιστική και στα
              παραστατικά. Ο κωδικός κρυπτογραφείται.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <SoftOneForm
              values={softone ?? undefined}
              save={saveTenantSoftOne}
              test={testTenantSoftOne}
              hidden={{ tenantId }}
              onSaved={() => setEditing(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή σύνδεσης SoftOne;</AlertDialogTitle>
            <AlertDialogDescription>
              Οι συγχρονισμοί του πελάτη σταματούν. Τα δεδομένα που έχουν ήδη αντληθεί παραμένουν.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Διαγραφή</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Capability({
  icon: Icon,
  label,
  probe,
}: {
  icon: typeof BookOpen;
  label: string;
  probe: Capabilities["gl"];
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2" title={probe.error}>
      <Icon className={probe.available ? "size-4 text-emerald-600" : "size-4 text-muted-foreground"} />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-2xs text-muted-foreground">
          {probe.error ? "μη διαθέσιμο" : probe.available ? `${probe.rowsLastMonth.toLocaleString("el-GR")} κινήσεις/μήνα` : "χωρίς κινήσεις"}
        </span>
      </span>
    </div>
  );
}
