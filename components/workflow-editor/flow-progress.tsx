import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Where a workflow stands — Βήματα → Σύνδεση → Δοκιμή → Δημοσίευση → API — and the one next action.
export type ProgressStep = { key: string; label: string; detail: string; state: "done" | "todo" | "warn"; href?: string };

export function FlowProgress({ steps, next }: { steps: ProgressStep[]; next?: { text: string; action: React.ReactNode } }) {
  return (
    <section aria-label="Πρόοδος της ροής" className="mb-4 rounded-lg border border-border/70 bg-card shadow-fluent-2">
      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-t-lg bg-border/60 sm:grid-cols-5">
        {steps.map((st, i) => {
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-2xs font-semibold",
                  st.state === "done" ? "bg-success-500 text-white" : st.state === "warn" ? "bg-warning-500 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {st.state === "done" ? <Check className="size-3.5" /> : st.state === "warn" ? <AlertTriangle className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{st.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{st.detail}</span>
              </span>
            </>
          );
          return (
            <li key={st.key} className="bg-card">
              {st.href ? (
                <Link href={st.href} className="flex h-full items-center gap-2 px-3 py-2.5 hover:bg-muted/50">
                  {body}
                </Link>
              ) : (
                <div className="flex h-full items-center gap-2 px-3 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {next && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-sisyphus-50/60 px-4 py-2.5">
          <p className="min-w-0 flex-1 text-sm">
            <span className="eyebrow mr-2 text-sisyphus-700">Επόμενο</span>
            {next.text}
          </p>
          {next.action}
        </div>
      )}
    </section>
  );
}
