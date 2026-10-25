// Progress bar (server). Two segments: done (blue) and failed (danger).
export function Progress({ total, done, failed = 0, label }: { total: number; done: number; failed?: number; label?: string }) {
  const ok = total ? ((done - failed) / total) * 100 : 0;
  const bad = total ? (failed / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label={label ?? "Πρόοδος"}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <span className="h-full bg-sisyphus-500 transition-[width] duration-400 ease-fluent" style={{ width: `${ok}%` }} />
        <span className="h-full bg-danger-500" style={{ width: `${bad}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {done.toLocaleString("el-GR")} / {total.toLocaleString("el-GR")}
        {failed > 0 && <span className="text-danger-500"> · {failed.toLocaleString("el-GR")} σφάλματα</span>}
      </p>
    </div>
  );
}
