// Fallback while a page streams in (root Suspense): canvas, header bar and card placeholders.
export function PageSkeleton() {
  return (
    <div className="dg-canvas min-h-svh" aria-busy="true" aria-label="Φόρτωση">
      <div className="h-12 border-b border-border/60 bg-card/70" />
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
        <div className="grid gap-4 *:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-card shadow-fluent-2 motion-reduce:animate-none" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-card shadow-fluent-2 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
