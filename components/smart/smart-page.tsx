import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { DashboardErrors } from "@/components/dashboards/blocks";

// Shared header of the smart modules (title, what it does, the AI/data-mining badge).
export function SmartHeader({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          {title}
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-2xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Sparkles className="size-3" /> AI · data mining
          </span>
        </h1>
        <p className="max-w-4xl text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export async function loadSmart<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    console.error("[smart]", (e as Error).message);
    return { data: null, error: (e as Error).message };
  }
}

export function SmartError({ error }: { error: string | null }) {
  return error ? <DashboardErrors errors={[error]} /> : null;
}
