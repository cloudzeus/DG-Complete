import { CircleCheck, CircleDashed, CircleMinus, CircleX, GripVertical } from "lucide-react";
import { STEP_TYPES } from "@/lib/labels";
import type { StepDef } from "@/lib/data/tenant";

export type Step = { id: string; no: string; type: string; label: string; locator?: string; value?: string; optional?: boolean; children?: Step[] };
export type RunStep = { no: string; label: string; status: "ok" | "failed" | "skipped" | "pending"; durationMs: number; fallback?: boolean };

const show = (v: unknown) => (v === undefined || v === null ? undefined : typeof v === "string" ? v : JSON.stringify(v));

/** DSL steps → numbered display steps (01, 02, 05a …). */
export function numberSteps(steps: StepDef[] = [], prefix = ""): Step[] {
  return steps.map((s, i) => {
    const no = prefix ? `${prefix}${String.fromCharCode(97 + i)}` : String(i + 1).padStart(2, "0");
    return { id: s.id, no, type: s.type, label: s.label ?? s.type, locator: show(s.locator), value: show(s.value ?? s.url), optional: s.optional, children: s.steps ? numberSteps(s.steps, no) : undefined };
  });
}
import { cn } from "@/lib/utils";

// Workflow steps (editor «Λίστα») and run timeline — both server-rendered.

export function StepList({ steps, selected }: { steps: Step[]; selected?: string }) {
  return (
    <ol className="space-y-1" aria-label="Βήματα">
      {steps.map((s) => (
        <li key={s.id}>
          <div
            className={cn(
              "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
              s.id === selected ? "bg-sisyphus-50 font-semibold text-sisyphus-700" : "hover:bg-muted/60",
            )}
          >
            <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">{s.no}</span>
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">{STEP_TYPES[s.type] ?? s.type}</span>
          </div>
          {s.children && (
            <div className="ml-5 border-l border-border/70 pl-2">
              <StepList steps={s.children} selected={selected} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

const ICON = {
  ok: { Icon: CircleCheck, cls: "text-success-500", label: "Επιτυχία" },
  failed: { Icon: CircleX, cls: "text-danger-500", label: "Αποτυχία" },
  skipped: { Icon: CircleMinus, cls: "text-muted-foreground", label: "Παραλείφθηκε" },
  pending: { Icon: CircleDashed, cls: "text-muted-foreground/60", label: "Δεν εκτελέστηκε" },
};

export function StepTimeline({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="space-y-0.5" aria-label="Βήματα εκτέλεσης">
      {steps.map((s) => {
        const { Icon, cls, label } = ICON[s.status];
        return (
          <li key={s.no} className={cn("flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm", s.status === "failed" && "bg-danger-50")}>
            <Icon aria-label={label} className={cn("size-4 shrink-0", cls)} />
            <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">{s.no}</span>
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            {s.fallback && s.status !== "pending" && <span className="hidden rounded-sm bg-warning-50 px-1.5 text-2xs font-semibold text-warning-500 sm:inline">εναλλακτικός επιλογέας</span>}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{s.status === "pending" ? "—" : `${(s.durationMs / 1000).toFixed(1)}″`}</span>
          </li>
        );
      })}
    </ol>
  );
}
