"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UnmappedAccount } from "@/lib/pnl";
import { mapAccountToLine } from "./actions";

/** GL accounts with movements that no rule covers — map them in one click. */
export function UnmappedTable({
  tenantId,
  data,
  lines,
  canEdit,
}: {
  tenantId: string;
  data: UnmappedAccount[];
  lines: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [mapping, setMapping] = useState<UnmappedAccount | null>(null);
  const [lineId, setLineId] = useState("");
  const [pattern, setPattern] = useState("");
  const [pending, start] = useTransition();

  const open = (a: UnmappedAccount) => {
    setMapping(a);
    setPattern(a.code);
    setLineId("");
  };

  const columns: ColumnDef<UnmappedAccount, unknown>[] = [
    { accessorKey: "code", header: "Λογαριασμός", size: 150, meta: { label: "Λογαριασμός" }, cell: ({ getValue }) => <span className="font-mono">{getValue() as string}</span> },
    { accessorKey: "name", header: "Περιγραφή", size: 280, meta: { label: "Περιγραφή", grow: true } },
    {
      accessorKey: "amount",
      header: "Ποσό (Π−Χ)",
      size: 130,
      meta: { label: "Ποσό", align: "right" },
      cell: ({ getValue }) => (getValue() as number).toLocaleString("el-GR", { maximumFractionDigits: 2 }),
    },
    { accessorKey: "lines", header: "Κινήσεις", size: 100, meta: { label: "Κινήσεις", align: "right" } },
    {
      id: "actions",
      header: "",
      size: 52,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,
      meta: { fixed: true, align: "right" },
      cell: ({ row }) => (
        <RowActions
          label={row.original.code}
          disabled={!canEdit || pending}
          actions={[{ label: "Αντιστοίχιση σε γραμμή…", icon: Link2, onSelect: () => open(row.original) }]}
        />
      ),
    },
  ];

  const save = () =>
    start(async () => {
      if (!lineId) return void toast.error("Επιλέξτε γραμμή.");
      const r = await mapAccountToLine(tenantId, lineId, pattern);
      if (r.ok) {
        toast.success(r.message);
        setMapping(null);
      } else toast.error(r.message);
    });

  return (
    <>
      <DataTable
        storageKey="pnl-unmapped"
        columns={columns}
        data={data}
        searchPlaceholder="Αναζήτηση λογαριασμών…"
        initialSorting={[{ id: "code", desc: false }]}
        emptyMessage="Όλοι οι λογαριασμοί με κινήσεις έχουν αντιστοιχιστεί."
      />
      <Dialog open={!!mapping} onOpenChange={(o) => !o && setMapping(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Αντιστοίχιση λογαριασμού</DialogTitle>
            <DialogDescription>
              {mapping?.code} · {mapping?.name}. Μπορείτε να αντιστοιχίσετε ολόκληρο τον γονικό λογαριασμό (π.χ. «64.07»).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="map-pattern">Λογαριασμός ή πρόθεμα</Label>
              <Input id="map-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Γραμμή αποτελεσμάτων</Label>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Επιλέξτε…" />
                </SelectTrigger>
                <SelectContent>
                  {lines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapping(null)} disabled={pending}>
              Άκυρο
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Αποθήκευση…" : "Αντιστοίχιση"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
