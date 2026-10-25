"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { StatusPill, type Tone } from "@/components/admin/tone";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SECTION_LABEL, SECTION_ORDER } from "@/lib/pnl-templates";
import type { PnlSection } from "@/lib/generated/prisma/enums";
import { deletePnlLine, savePnlLine } from "./actions";

export type RuleRow = { source: "GL" | "SALES" | "PURCHASES"; pattern: string; negate: boolean };
export type LineRow = {
  id: string;
  code: string;
  name: string;
  section: PnlSection;
  sortOrder: number;
  rules: RuleRow[];
  total: number;
};
export type SeriesOption = { series: number; name: string; sosource: number | null };

const SECTION_TONE: Record<PnlSection, Tone> = {
  REVENUE: "green",
  COGS: "amber",
  OTHER_INCOME: "teal",
  OPEX: "red",
  DEPRECIATION: "violet",
  FINANCIAL: "blue",
  EXTRAORDINARY: "slate",
  TAX: "slate",
};

const SOURCE_LABEL = { GL: "Λογαριασμός Γ.Λ.", SALES: "Σειρά πωλήσεων", PURCHASES: "Σειρά αγορών" } as const;

export function LinesTable({
  tenantId,
  data,
  series,
  canEdit,
  year,
}: {
  tenantId: string;
  data: LineRow[];
  series: SeriesOption[];
  canEdit: boolean;
  year: number;
}) {
  const [editing, setEditing] = useState<LineRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<LineRow | null>(null);
  const [pending, start] = useTransition();
  const seriesName = new Map(series.map((s) => [String(s.series), s.name]));

  const ruleLabel = (r: RuleRow) =>
    r.source === "GL" ? r.pattern : r.pattern === "*" ? "όλες" : (seriesName.get(r.pattern) ?? `#${r.pattern}`);

  const columns: ColumnDef<LineRow, unknown>[] = [
    { accessorKey: "sortOrder", header: "Σειρά", size: 70, meta: { label: "Σειρά", align: "right" } },
    {
      accessorKey: "name",
      header: "Γραμμή",
      size: 240,
      meta: { label: "Γραμμή" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.name}</div>
          <div className="font-mono text-2xs text-muted-foreground">{row.original.code}</div>
        </div>
      ),
    },
    {
      accessorKey: "section",
      header: "Ενότητα",
      size: 230,
      meta: { label: "Ενότητα" },
      sortingFn: (a, b) => SECTION_ORDER.indexOf(a.original.section) - SECTION_ORDER.indexOf(b.original.section),
      cell: ({ row }) => <StatusPill tone={SECTION_TONE[row.original.section]}>{SECTION_LABEL[row.original.section]}</StatusPill>,
    },
    {
      id: "rules",
      accessorFn: (r) => r.rules.map(ruleLabel).join(" "),
      header: "Κανόνες",
      size: 320,
      meta: { label: "Κανόνες", grow: true },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1 py-0.5">
          {row.original.rules.length === 0 && <span className="text-muted-foreground">—</span>}
          {row.original.rules.slice(0, 8).map((r, i) => (
            <span
              key={i}
              className="rounded border bg-muted/50 px-1.5 py-px font-mono text-2xs"
              title={`${SOURCE_LABEL[r.source]}${r.negate ? " · αφαιρείται" : ""}`}
            >
              {r.negate ? "−" : ""}
              {ruleLabel(r)}
            </span>
          ))}
          {row.original.rules.length > 8 && <span className="text-2xs text-muted-foreground">+{row.original.rules.length - 8}</span>}
        </div>
      ),
    },
    {
      accessorKey: "total",
      header: `Σύνολο ${year}`,
      size: 130,
      meta: { label: `Σύνολο ${year}`, align: "right" },
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className={v < 0 ? "text-red-700" : undefined}>{v.toLocaleString("el-GR", { maximumFractionDigits: 0 })}</span>;
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
      cell: ({ row }) => (
        <RowActions
          label={row.original.name}
          disabled={!canEdit || pending}
          actions={[
            { label: "Επεξεργασία", icon: Pencil, onSelect: () => setEditing(row.original) },
            { label: "Διαγραφή", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(row.original) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        storageKey="pnl-lines"
        columns={columns}
        data={data}
        searchPlaceholder="Αναζήτηση γραμμών ή λογαριασμών…"
        initialSorting={[{ id: "sortOrder", desc: false }]}
        initialPageSize={50}
        emptyMessage="Δεν υπάρχουν γραμμές — εφαρμόστε ένα πρότυπο."
        toolbar={
          canEdit && (
            <Button size="sm" onClick={() => setEditing("new")} disabled={pending}>
              <Plus />
              Νέα γραμμή
            </Button>
          )
        }
      />
      <LineDialog
        tenantId={tenantId}
        series={series}
        line={editing === "new" ? null : editing}
        open={editing !== null}
        nextOrder={Math.max(0, ...data.map((d) => d.sortOrder)) + 10}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{deleting?.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              Διαγράφονται η γραμμή και οι {deleting?.rules.length} κανόνες της. Οι λογαριασμοί της θα εμφανιστούν στους μη
              αντιστοιχισμένους.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting &&
                start(async () => {
                  const r = await deletePnlLine(tenantId, deleting.id);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.message);
                })
              }
            >
              Διαγραφή
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LineDialog({
  tenantId,
  series,
  line,
  open,
  nextOrder,
  onOpenChange,
}: {
  tenantId: string;
  series: SeriesOption[];
  line: LineRow | null;
  open: boolean;
  nextOrder: number;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{line ? "Επεξεργασία γραμμής" : "Νέα γραμμή αποτελεσμάτων"}</DialogTitle>
          <DialogDescription>
            Οι κανόνες ορίζουν ποιες κινήσεις καταλήγουν στη γραμμή. Λογαριασμός «60» = όλοι οι 60.xx· «20.01» μόνο οι
            20.01.xx· ο πιο συγκεκριμένος κανόνας υπερισχύει.
          </DialogDescription>
        </DialogHeader>
        {open && <LineForm key={line?.id ?? "new"} tenantId={tenantId} series={series} line={line} nextOrder={nextOrder} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LineForm({
  tenantId,
  series,
  line,
  nextOrder,
  onDone,
}: {
  tenantId: string;
  series: SeriesOption[];
  line: LineRow | null;
  nextOrder: number;
  onDone: () => void;
}) {
  const [name, setName] = useState(line?.name ?? "");
  const [code, setCode] = useState(line?.code ?? "");
  const [section, setSection] = useState<PnlSection>(line?.section ?? "OPEX");
  const [sortOrder, setSortOrder] = useState(String(line?.sortOrder ?? nextOrder));
  const [rules, setRules] = useState<RuleRow[]>(line?.rules ?? [{ source: "GL", pattern: "", negate: false }]);
  const [pending, start] = useTransition();

  const setRule = (i: number, patch: Partial<RuleRow>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const r = await savePnlLine(tenantId, {
        id: line?.id,
        code,
        name,
        section,
        sortOrder,
        rules: rules.filter((x) => x.pattern.trim()),
      });
      if (r.ok) {
        toast.success(r.message);
        onDone();
      } else toast.error(r.message);
    });

  const seriesFor = (source: RuleRow["source"]) => series.filter((s) => s.sosource === (source === "SALES" ? 1351 : 1251));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label htmlFor="pnl-name">Περιγραφή</Label>
          <Input id="pnl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="π.χ. Ενοίκια" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pnl-code">Κωδικός</Label>
          <Input id="pnl-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="OPEX_RENT" className="font-mono" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label>Ενότητα</Label>
          <Select value={section} onValueChange={(v) => setSection(v as PnlSection)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTION_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {SECTION_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pnl-order">Σειρά εμφάνισης</Label>
          <Input id="pnl-order" type="number" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Κανόνες</Label>
          <Button type="button" size="xs" variant="outline" onClick={() => setRules((rs) => [...rs, { source: "GL", pattern: "", negate: false }])}>
            <Plus />
            Κανόνας
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {rules.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Χωρίς κανόνες η γραμμή μένει κενή.</p>}
          {rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 px-2 py-2">
              <Select value={r.source} onValueChange={(v) => setRule(i, { source: v as RuleRow["source"], pattern: v === "GL" ? "" : "*" })}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABEL) as RuleRow["source"][]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {r.source === "GL" ? (
                <Input
                  value={r.pattern}
                  onChange={(e) => setRule(i, { pattern: e.target.value })}
                  placeholder="π.χ. 62.04"
                  className="h-7 min-w-0 flex-1 font-mono"
                  aria-label="Λογαριασμός"
                />
              ) : (
                <Select value={r.pattern} onValueChange={(v) => setRule(i, { pattern: v })}>
                  <SelectTrigger size="sm" className="min-w-0 flex-1">
                    <SelectValue placeholder="Σειρά" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">Όλες οι σειρές</SelectItem>
                    {seriesFor(r.source).map((s) => (
                      <SelectItem key={s.series} value={String(s.series)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={r.negate} onCheckedChange={(v) => setRule(i, { negate: v })} size="sm" />
                αφαίρεση
              </label>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Αφαίρεση κανόνα" onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-2xs text-muted-foreground">
          «Αφαίρεση» αντιστρέφει το πρόσημο — π.χ. πιστωτικά τιμολόγια και επιστροφές στις σειρές παραστατικών.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Άκυρο
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? "Αποθήκευση & υπολογισμός…" : "Αποθήκευση"}
        </Button>
      </DialogFooter>
    </div>
  );
}
