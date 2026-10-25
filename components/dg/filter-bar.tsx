import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// GET form: filters live in the URL and are applied on the server. No client JS.
export function FilterBar({
  q,
  placeholder = "Αναζήτηση",
  selects = [],
}: {
  q?: string;
  placeholder?: string;
  selects?: { name: string; label: string; value?: string; options: { value: string; label: string }[] }[];
}) {
  return (
    <form role="search" className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <label className="relative min-w-0 flex-1 sm:max-w-80">
        <span className="sr-only">{placeholder}</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-9 w-full rounded-sm border border-input bg-card pr-3 pl-8 text-sm outline-none transition-colors duration-150 focus-visible:border-sisyphus-500 focus-visible:ring-2 focus-visible:ring-sisyphus-500/30"
        />
      </label>
      {selects.map((s) => (
        <label key={s.name} className="flex items-center gap-2 text-sm">
          <span className="sr-only sm:not-sr-only sm:text-xs sm:text-muted-foreground">{s.label}</span>
          <select
            name={s.name}
            defaultValue={s.value ?? ""}
            className="h-9 w-full rounded-sm border border-input bg-card px-2 text-sm outline-none focus-visible:border-sisyphus-500 focus-visible:ring-2 focus-visible:ring-sisyphus-500/30 sm:w-auto"
          >
            <option value="">Όλα</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <Button type="submit" variant="outline" size="sm" className="h-9">
        Εφαρμογή
      </Button>
    </form>
  );
}
