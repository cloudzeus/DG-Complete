import { INTENTS, type Intent } from "@/lib/labels";
import { cn } from "@/lib/utils";

// HTTP method + function of a workflow (docs/24 §2): GET · Ανάγνωση εγγραφών, POST · Δημιουργία …
const TONE: Record<string, string> = {
  GET: "bg-sisyphus-50 text-sisyphus-700",
  POST: "bg-success-50 text-success-500",
  PATCH: "bg-warning-50 text-warning-500",
  DELETE: "bg-danger-50 text-danger-500",
};

export function IntentBadge({ intent, className }: { intent?: string | null; className?: string }) {
  const i = intent && intent in INTENTS ? INTENTS[intent as Intent] : null;
  if (!i) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-xs font-medium", TONE[i.http], className)} title={i.hint}>
      <code className="font-mono text-2xs font-semibold">{i.http}</code> {i.label}
    </span>
  );
}
