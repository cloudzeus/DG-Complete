// Read-only JSON with light syntax colouring, rendered on the server.
function Value({ v, depth }: { v: unknown; depth: number }) {
  const pad = "  ".repeat(depth + 1);
  const end = "  ".repeat(depth);
  if (v === null) return <span className="text-muted-foreground">null</span>;
  if (typeof v === "string") return <span className="text-success-500">&quot;{v}&quot;</span>;
  if (typeof v === "number" || typeof v === "boolean") return <span className="text-sisyphus-700">{String(v)}</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <>[]</>;
    return (
      <>
        {"[\n"}
        {v.map((x, i) => (
          <span key={i}>
            {pad}
            <Value v={x} depth={depth + 1} />
            {i < v.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {end}]
      </>
    );
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return <>{"{}"}</>;
  return (
    <>
      {"{\n"}
      {entries.map(([k, x], i) => (
        <span key={k}>
          {pad}
          <span className="text-warning-500">&quot;{k}&quot;</span>: <Value v={x} depth={depth + 1} />
          {i < entries.length - 1 ? ",\n" : "\n"}
        </span>
      ))}
      {end}
      {"}"}
    </>
  );
}

export function JsonViewer({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={`overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-relaxed ${className ?? ""}`}>
      <Value v={value} depth={0} />
    </pre>
  );
}
