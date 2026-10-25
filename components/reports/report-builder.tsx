"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Calendar,
  ChartArea,
  ChartLine,
  ChartPie,
  Filter,
  GripVertical,
  Hash,
  Loader2,
  Play,
  Printer,
  Rows3,
  Save,
  Search,
  Sigma,
  Table2,
  Columns3,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { deleteReport, filterValues, runReportAction, saveReport } from "@/app/dashboards/[tenantId]/reports/actions";
import { ExportButton, type ExportSheetSpec } from "@/components/dashboards/export-button";
import { flattenPivot, buildPivot, formatOfField, labelOf, resultKey, ReportResult } from "@/components/reports/report-result";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MetaCubeInfo, MetaField } from "@/lib/kimon/catalog";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/period";
import { GRANULARITIES, VIEWS, type ReportDefinition, type ReportFilter, type ReportView } from "@/lib/report-types";
import { cn } from "@/lib/utils";

// Drag & drop report builder: fields of the chosen subject (cube) are dragged — or clicked — into
// Rows / Columns / Values / Filters; the report re-runs on every change and is shown as a pivot,
// table or chart, exported to Excel or printed to PDF, and saved (private or shared).

type Zone = "rows" | "columns" | "values" | "filters";
type ResultState = { def: ReportDefinition; rows: Record<string, unknown>[]; truncated: boolean; period: { label: string } | null };

const ZONES: { key: Zone; label: string; hint: string; icon: LucideIcon; max: number }[] = [
  { key: "rows", label: "Γραμμές", hint: "π.χ. Κατηγορία, Πελάτης", icon: Rows3, max: 4 },
  { key: "columns", label: "Στήλες", hint: "π.χ. Μήνας, Μάρκα", icon: Columns3, max: 3 },
  { key: "values", label: "Τιμές", hint: "π.χ. Τζίρος, Κέρδος", icon: Sigma, max: 8 },
  { key: "filters", label: "Φίλτρα", hint: "π.χ. Μάρκα = BESSEY", icon: Filter, max: 10 },
];
const VIEW_ICON: Record<ReportView, LucideIcon> = { pivot: Table2, table: Rows3, bar: BarChart3, line: ChartLine, area: ChartArea, pie: ChartPie };
const OPS: { key: ReportFilter["operator"]; label: string; measure?: boolean }[] = [
  { key: "equals", label: "είναι" },
  { key: "notEquals", label: "δεν είναι" },
  { key: "contains", label: "περιέχει" },
  { key: "gt", label: "μεγαλύτερο από", measure: true },
  { key: "lt", label: "μικρότερο από", measure: true },
  { key: "set", label: "έχει τιμή" },
  { key: "notSet", label: "κενό" },
];

const baseName = (f: string) => f.split("@")[0];
const EMPTY = (cube: string): ReportDefinition => ({ cube, rows: [], columns: [], values: [], filters: [], period: { preset: "12m" }, view: "pivot" });

export function ReportBuilder({
  tenantId,
  cubes,
  initial,
  saved,
  name,
}: {
  name?: string;
  tenantId: string;
  cubes: MetaCubeInfo[];
  initial: ReportDefinition | null;
  /** The saved report being edited (null = new). */
  saved: { id: string; name: string; description: string | null; shared: boolean; mine: boolean } | null;
}) {
  const router = useRouter();
  const [def, setDef] = useState<ReportDefinition>(() => initial ?? EMPTY(cubes.find((c) => c.name === "sales_lines")?.name ?? cubes[0]?.name ?? ""));
  const cube = cubes.find((c) => c.name === def.cube);
  const fields = useMemo(() => new Map((cube?.fields ?? []).map((f) => [f.name, f])), [cube]);
  const hasDate = (cube?.fields ?? []).some((f) => f.kind === "dimension" && f.type === "time" && /\.date$/.test(f.name));
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, startRun] = useTransition();
  const [dragOver, setDragOver] = useState<Zone | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const runId = useRef(0);

  // Re-run (debounced) whenever the definition changes and has something to show.
  useEffect(() => {
    if (!def.values.length) return;
    const id = ++runId.current;
    const t = setTimeout(() => {
      startRun(async () => {
        const r = await runReportAction(tenantId, def);
        if (id !== runId.current) return;
        if (r.ok) {
          setResult({ def, ...r.result });
          setError(null);
        } else setError(r.error);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [def, tenantId]);

  const used = new Set([...def.rows, ...def.columns, ...def.values].map(baseName));
  const add = (zone: Zone, field: string, at?: number) =>
    setDef((d) => {
      const f = fields.get(baseName(field));
      if (!f) return d;
      if (zone === "values" && f.kind !== "measure") return toastNo("Στις Τιμές μπαίνουν μετρήσεις (π.χ. Τζίρος).", d);
      if ((zone === "rows" || zone === "columns") && f.kind !== "dimension") return toastNo("Στις γραμμές/στήλες μπαίνουν διαστάσεις (π.χ. Μάρκα).", d);
      if (zone === "filters") {
        if (d.filters.length >= 10) return d;
        return { ...d, filters: [...d.filters, { member: f.name, operator: f.kind === "measure" ? "gt" : "equals", values: [] }] };
      }
      const name = f.type === "time" && !field.includes("@") ? `${f.name}@month` : field;
      // Remove from wherever it already is (a field lives in one place), then insert.
      const strip = (arr: string[]) => arr.filter((x) => baseName(x) !== f.name);
      const next = { ...d, rows: strip(d.rows), columns: strip(d.columns), values: strip(d.values) };
      const arr = [...next[zone]];
      if (arr.length >= (ZONES.find((z) => z.key === zone)?.max ?? 8)) return toastNo("Έχετε φτάσει το όριο πεδίων σε αυτή τη θέση.", d);
      arr.splice(at ?? arr.length, 0, name);
      // A second time grouping is not allowed: drop the older one.
      const out = { ...next, [zone]: arr };
      if (f.type === "time") {
        for (const z of ["rows", "columns"] as const) out[z] = out[z].filter((x) => x === name || !x.includes("@"));
      }
      return out;
    });
  const remove = (zone: Exclude<Zone, "filters">, field: string) => setDef((d) => ({ ...d, [zone]: d[zone].filter((x) => x !== field) }));
  const quickAdd = (f: MetaField) => add(f.kind === "measure" ? "values" : def.rows.length && !def.columns.length && f.type === "time" ? "columns" : "rows", f.name);

  const onDrop = (zone: Zone) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const { field } = JSON.parse(e.dataTransfer.getData("application/x-report-field")) as { field: string };
      add(zone, field);
    } catch {}
  };
  const dragStart = (field: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-report-field", JSON.stringify({ field }));
    e.dataTransfer.effectAllowed = "move";
  };

  const changeCube = (name: string) => {
    if (name === def.cube) return;
    setDef(EMPTY(name));
    setResult(null);
  };

  const list = (cube?.fields ?? []).filter((f) => !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.name.toLowerCase().includes(search.toLowerCase()));
  const dims = list.filter((f) => f.kind === "dimension");
  const measures = list.filter((f) => f.kind === "measure");

  const sheets = useMemo<ExportSheetSpec[]>(() => {
    if (!result) return [];
    const d = result.def;
    if (d.view === "table") {
      const cols = [...d.rows, ...d.columns, ...d.values];
      return [
        {
          name: "Αναφορά",
          columns: cols.map((c, i) => ({ key: `k${i}`, label: fields.get(baseName(c))?.title ?? c, format: d.values.includes(c) ? formatOfField(fields.get(c)) : "text" })),
          rows: result.rows.map((r) => Object.fromEntries(cols.map((c, i) => [`k${i}`, d.values.includes(c) ? Number(r[c] ?? 0) : labelOf(c, r[resultKey(c)])]))),
        },
      ];
    }
    const flat = flattenPivot(d, buildPivot(d, result.rows), fields);
    return [{ name: "Αναφορά", columns: flat.columns, rows: flat.rows }];
  }, [result, fields]);

  const title = saved?.name ?? name ?? "Νέα αναφορά";

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden !important; } #report-print, #report-print * { visibility: visible !important; } #report-print { position: absolute; inset: 0 auto auto 0; width: 100%; } @page { size: landscape; margin: 12mm; } }`}</style>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <div className="min-w-48">
          <Label className="mb-1 text-xs text-muted-foreground">Θέμα</Label>
          <Select value={def.cube} onValueChange={changeCube}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cubes.map((c) => (
                <SelectItem key={c.name} value={c.name} className="text-xs">
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasDate && (
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">Περίοδος</Label>
            <div className="flex gap-1.5">
              <Select
                value={def.period?.preset ?? "all"}
                onValueChange={(v) => setDef((d) => ({ ...d, period: v === "all" ? undefined : { preset: v as PeriodPreset, from: d.period?.from, to: d.period?.to } }))}
              >
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    Όλη η ιστορία
                  </SelectItem>
                  {Object.entries(PERIOD_PRESETS).map(([k, label]) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {def.period?.preset === "custom" && (
                <>
                  <Input type="date" className="h-8 w-36 text-xs" value={def.period.from ?? ""} onChange={(e) => setDef((d) => ({ ...d, period: { preset: "custom", from: e.target.value, to: d.period?.to } }))} />
                  <Input type="date" className="h-8 w-36 text-xs" value={def.period.to ?? ""} onChange={(e) => setDef((d) => ({ ...d, period: { preset: "custom", from: d.period?.from, to: e.target.value } }))} />
                </>
              )}
            </div>
          </div>
        )}
        <div>
          <Label className="mb-1 text-xs text-muted-foreground">Εμφάνιση</Label>
          <div className="flex rounded-md border p-0.5">
            {VIEWS.map((v) => {
              const Icon = VIEW_ICON[v.key];
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setDef((d) => ({ ...d, view: v.key }))}
                  className={cn("flex h-7 items-center gap-1 rounded px-2 text-xs", def.view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                  aria-pressed={def.view === v.key}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!def.values.length || running} onClick={() => setDef((d) => ({ ...d }))}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} Εκτέλεση
          </Button>
          {result && <ExportButton tenantId={tenantId} title={title} subtitle={result.period?.label} sheets={sheets} />}
          <Button size="sm" variant="outline" disabled={!result} onClick={() => window.print()}>
            <Printer /> PDF
          </Button>
          <Button size="sm" disabled={!def.values.length} onClick={() => setSaveOpen(true)}>
            <Save /> Αποθήκευση
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        {/* Field library */}
        <aside className="rounded-xl border bg-card p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <div className="relative mb-2">
            <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Αναζήτηση πεδίου…" className="h-8 pl-7 text-xs" />
          </div>
          <p className="mb-2 text-2xs text-muted-foreground">Σύρετε ένα πεδίο σε μια θέση — ή πατήστε το για αυτόματη τοποθέτηση.</p>
          <FieldList title="Μετρήσεις" fields={measures} used={used} onPick={quickAdd} dragStart={dragStart} icon={Hash} tone="text-emerald-600" />
          <FieldList title="Διαστάσεις" fields={dims} used={used} onPick={quickAdd} dragStart={dragStart} icon={Rows3} tone="text-blue-600" />
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Drop zones */}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ZONES.map((z) => (
              <div
                key={z.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(z.key);
                }}
                onDragLeave={() => setDragOver((v) => (v === z.key ? null : v))}
                onDrop={onDrop(z.key)}
                className={cn("min-h-24 rounded-xl border-2 border-dashed bg-card p-2 transition-colors", dragOver === z.key ? "border-primary bg-primary/5" : "border-border")}
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                  <z.icon className="size-3.5 text-muted-foreground" /> {z.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {z.key === "filters"
                    ? def.filters.map((f, i) => (
                        <FilterChip
                          key={`${f.member}-${i}`}
                          tenantId={tenantId}
                          cube={def.cube}
                          filter={f}
                          field={fields.get(f.member)}
                          onChange={(nf) => setDef((d) => ({ ...d, filters: d.filters.map((x, j) => (j === i ? nf : x)) }))}
                          onRemove={() => setDef((d) => ({ ...d, filters: d.filters.filter((_, j) => j !== i) }))}
                        />
                      ))
                    : def[z.key].map((f) => (
                        <FieldChip
                          key={f}
                          field={f}
                          meta={fields.get(baseName(f))}
                          zone={z.key}
                          dragStart={dragStart(f)}
                          onRemove={() => remove(z.key as Exclude<Zone, "filters">, f)}
                          onGranularity={(g) =>
                            setDef((d) => ({ ...d, [z.key]: (d[z.key as "rows"] as string[]).map((x) => (x === f ? `${baseName(f)}@${g}` : x)) }))
                          }
                        />
                      ))}
                  {(z.key === "filters" ? def.filters.length : def[z.key].length) === 0 && <span className="text-2xs text-muted-foreground">{z.hint}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Result */}
          <section id="report-print" className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold">{title}</h2>
              {result?.period && <span className="text-xs text-muted-foreground">{result.period.label}</span>}
              {result && <span className="text-xs text-muted-foreground">{result.rows.length.toLocaleString("el-GR")} εγγραφές</span>}
              {result?.truncated && <span className="text-xs text-amber-600">Εμφανίζονται οι πρώτες 5.000 εγγραφές — προσθέστε φίλτρα για ακρίβεια.</span>}
              {running && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
            {error && <p className="mb-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
            {!def.values.length ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                Ξεκινήστε σύροντας μια <b>Μέτρηση</b> (π.χ. Τζίρος) στις Τιμές και μια <b>Διάσταση</b> (π.χ. Κατηγορία) στις Γραμμές.
              </div>
            ) : result ? (
              <div className={cn("transition-opacity", running && "opacity-60")}>
                <ReportResult def={result.def} rows={result.rows} fields={fields} />
              </div>
            ) : (
              <div className="flex justify-center py-14">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </section>
        </div>
      </div>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        saved={saved}
        onSave={async (input, asNew) => {
          const r = await saveReport(tenantId, { ...input, id: asNew ? undefined : saved?.id, definition: def });
          if (!r.ok) return toast.error(r.message);
          toast.success(r.message);
          setSaveOpen(false);
          if (r.id && r.id !== saved?.id) router.replace(`/dashboards/${tenantId}/reports/builder?id=${r.id}`);
          else router.refresh();
        }}
        onDelete={
          saved?.mine
            ? async () => {
                const r = await deleteReport(tenantId, saved.id);
                if (!r.ok) return toast.error(r.message);
                toast.success(r.message);
                router.push(`/dashboards/${tenantId}/reports`);
              }
            : undefined
        }
      />
    </div>
  );
}

function toastNo(msg: string, d: ReportDefinition) {
  toast.info(msg);
  return d;
}

function FieldList({
  title,
  fields,
  used,
  onPick,
  dragStart,
  icon: Icon,
  tone,
}: {
  title: string;
  fields: MetaField[];
  used: Set<string>;
  onPick: (f: MetaField) => void;
  dragStart: (field: string) => (e: React.DragEvent) => void;
  icon: LucideIcon;
  tone: string;
}) {
  if (!fields.length) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</div>
      <ul className="space-y-0.5">
        {fields.map((f) => (
          <li key={f.name}>
            <button
              type="button"
              draggable
              onDragStart={dragStart(f.name)}
              onClick={() => onPick(f)}
              title={f.description ?? f.title}
              className={cn(
                "group flex w-full cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted active:cursor-grabbing",
                used.has(f.name) && "bg-primary/5 font-medium",
              )}
            >
              <GripVertical className="size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
              {f.type === "time" ? <Calendar className={cn("size-3.5 shrink-0", tone)} /> : <Icon className={cn("size-3.5 shrink-0", tone)} />}
              <span className="truncate">{f.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldChip({
  field,
  meta,
  zone,
  dragStart,
  onRemove,
  onGranularity,
}: {
  field: string;
  meta: MetaField | undefined;
  zone: Zone;
  dragStart: (e: React.DragEvent) => void;
  onRemove: () => void;
  onGranularity: (g: string) => void;
}) {
  const g = field.split("@")[1];
  return (
    <span
      draggable
      onDragStart={dragStart}
      className={cn(
        "inline-flex cursor-grab items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-1.5 text-xs active:cursor-grabbing",
        zone === "values" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
      )}
    >
      <GripVertical className="size-3 opacity-50" />
      {meta?.title ?? field}
      {g && (
        <select value={g} onChange={(e) => onGranularity(e.target.value)} className="rounded bg-transparent text-xs font-semibold outline-none" aria-label="Ομαδοποίηση ημερομηνίας">
          {GRANULARITIES.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={onRemove} className="rounded p-0.5 hover:bg-black/10" aria-label="Αφαίρεση">
        <X className="size-3" />
      </button>
    </span>
  );
}

function FilterChip({
  tenantId,
  cube,
  filter,
  field,
  onChange,
  onRemove,
}: {
  tenantId: string;
  cube: string;
  filter: ReportFilter;
  field: MetaField | undefined;
  onChange: (f: ReportFilter) => void;
  onRemove: () => void;
}) {
  const isMeasure = field?.kind === "measure";
  const [open, setOpen] = useState(filter.values.length === 0 && !isMeasure);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || isMeasure) return;
    const t = setTimeout(async () => {
      setLoading(true);
      setOptions(await filterValues(tenantId, cube, filter.member, q));
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, isMeasure, tenantId, cube, filter.member]);
  const ops = OPS.filter((o) => (isMeasure ? o.measure : !o.measure));
  const summary =
    filter.operator === "set" || filter.operator === "notSet"
      ? OPS.find((o) => o.key === filter.operator)?.label
      : filter.values.length
        ? `${OPS.find((o) => o.key === filter.operator)?.label} ${filter.values.slice(0, 2).join(", ")}${filter.values.length > 2 ? ` +${filter.values.length - 2}` : ""}`
        : "επιλέξτε…";
  const toggle = (v: string) => onChange({ ...filter, values: filter.values.includes(v) ? filter.values.filter((x) => x !== v) : [...filter.values, v] });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 py-0.5 pr-0.5 pl-1.5 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <PopoverTrigger asChild>
          <button type="button" className="max-w-56 truncate text-left">
            <b>{field?.title ?? filter.member}</b> {summary}
          </button>
        </PopoverTrigger>
        <button type="button" onClick={onRemove} className="rounded p-0.5 hover:bg-black/10" aria-label="Αφαίρεση φίλτρου">
          <X className="size-3" />
        </button>
      </span>
      <PopoverContent className="w-72 space-y-2 p-3" align="start">
        <Select value={filter.operator} onValueChange={(v) => onChange({ ...filter, operator: v as ReportFilter["operator"], values: v === "set" || v === "notSet" ? [] : filter.values })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map((o) => (
              <SelectItem key={o.key} value={o.key} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filter.operator === "set" || filter.operator === "notSet" ? null : isMeasure ? (
          <Input type="number" className="h-8 text-xs" value={filter.values[0] ?? ""} onChange={(e) => onChange({ ...filter, values: e.target.value ? [e.target.value] : [] })} placeholder="Τιμή" />
        ) : filter.operator === "contains" ? (
          <Input className="h-8 text-xs" value={filter.values[0] ?? ""} onChange={(e) => onChange({ ...filter, values: e.target.value ? [e.target.value] : [] })} placeholder="Κείμενο" />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση τιμής…" className="h-8 pl-7 text-xs" autoFocus />
            </div>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto">
              {filter.values
                .filter((v) => !options.includes(v))
                .concat(options)
                .map((v) => (
                  <li key={v}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                      <Checkbox checked={filter.values.includes(v)} onCheckedChange={() => toggle(v)} />
                      <span className="truncate">{v}</span>
                    </label>
                  </li>
                ))}
              {loading && (
                <li className="flex justify-center py-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </li>
              )}
              {!loading && !options.length && <li className="px-1 py-2 text-xs text-muted-foreground">Καμία τιμή.</li>}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  saved,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saved: { id: string; name: string; description: string | null; shared: boolean; mine: boolean } | null;
  onSave: (input: { name: string; description: string; shared: boolean }, asNew: boolean) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}) {
  const [name, setName] = useState(saved?.name ?? "");
  const [description, setDescription] = useState(saved?.description ?? "");
  const [shared, setShared] = useState(saved?.shared ?? false);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Αποθήκευση αναφοράς</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rep-name">Όνομα</Label>
            <Input id="rep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="π.χ. Μάρκες ανά μήνα 2026" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rep-desc">Περιγραφή (προαιρετικά)</Label>
            <Textarea id="rep-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} />
            Κοινή χρήση με όλους τους χρήστες της επιχείρησης
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {onDelete ? (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={run(onDelete)}>
              <Trash2 /> Διαγραφή
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {saved && (
              <Button variant="outline" size="sm" disabled={busy} onClick={run(() => onSave({ name, description, shared }, true))}>
                Ως νέα
              </Button>
            )}
            <Button size="sm" disabled={busy || name.trim().length < 2} onClick={run(() => onSave({ name, description, shared }, false))}>
              {busy && <Loader2 className="animate-spin" />} Αποθήκευση
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
