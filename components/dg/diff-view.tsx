// Line diff between two versions (mock lines until lib/dsl provides the structural diff).
const DIFF = [
  { kind: "same", text: "02  Συμπλήρωση ΑΦΜ    label \"ΑΦΜ\"" },
  { kind: "del", text: "03  Επωνυμία         css #name" },
  { kind: "add", text: "03  Επωνυμία         label \"Επωνυμία\"" },
  { kind: "add", text: "05  Για κάθε επαφή   {{input.contacts}}" },
  { kind: "add", text: "05a Νέα επαφή        role button \"Προσθήκη επαφής\"" },
  { kind: "same", text: "06  Αποθήκευση       role button \"Αποθήκευση\"" },
] as const;

export function DiffView({ from, to }: { from: number; to: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70 font-mono text-xs">
      <p className="border-b border-border/70 bg-muted/50 px-3 py-1.5 text-2xs text-muted-foreground">
        v{from} → v{to}
      </p>
      {DIFF.map((l, i) => (
        <pre key={i} className={l.kind === "add" ? "bg-success-50 px-3 py-0.5 text-success-500" : l.kind === "del" ? "bg-danger-50 px-3 py-0.5 text-danger-500 line-through" : "px-3 py-0.5"}>
          {l.kind === "add" ? "+ " : l.kind === "del" ? "− " : "  "}
          {l.text}
        </pre>
      ))}
    </div>
  );
}
