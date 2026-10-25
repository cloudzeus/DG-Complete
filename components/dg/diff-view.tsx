import type { Definition, StepDef } from "@/lib/data/tenant";

// Line diff between two workflow definitions (one line per step: number, label, locator, value).
// LCS on lines — good enough for review; lib/dsl brings the structural diff (P05).

const show = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));

function toLines(steps: StepDef[] = [], prefix = ""): string[] {
  return steps.flatMap((s, i) => {
    const no = prefix ? `${prefix}${String.fromCharCode(97 + i)}` : String(i + 1).padStart(2, "0");
    const line = [no.padEnd(4), (s.label ?? s.type).padEnd(22), show(s.locator), show(s.value ?? s.url)].filter(Boolean).join("  ");
    return [line, ...toLines(s.steps, no)];
  });
}

type Line = { kind: "same" | "add" | "del"; text: string };

export function diffLines(a: string[], b: string[]): Line[] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: a[i++] });
    else out.push({ kind: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] });
  while (j < b.length) out.push({ kind: "add", text: b[j++] });
  return out;
}

export function DiffView({ from, to, before, after }: { from: number | null; to: number; before: Definition; after: Definition }) {
  const lines = diffLines(toLines(before.steps), toLines(after.steps));
  const changed = lines.some((l) => l.kind !== "same");
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70 font-mono text-xs">
      <p className="border-b border-border/70 bg-muted/50 px-3 py-1.5 text-2xs text-muted-foreground">
        {from ? `v${from} → v${to}` : `Πρώτη έκδοση (v${to})`}
      </p>
      {!changed && <p className="px-3 py-2 text-muted-foreground">Καμία αλλαγή στα βήματα.</p>}
      {lines.map((l, i) => (
        <pre key={i} className={l.kind === "add" ? "bg-success-50 px-3 py-0.5 text-success-500" : l.kind === "del" ? "bg-danger-50 px-3 py-0.5 text-danger-500 line-through" : "px-3 py-0.5"}>
          {l.kind === "add" ? "+ " : l.kind === "del" ? "− " : "  "}
          {l.text}
        </pre>
      ))}
    </div>
  );
}
