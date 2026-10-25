import Link from "next/link";
import { ChevronRight } from "lucide-react";

// Page title block of the tenant area: breadcrumb, eyebrow, 24/600 title, description, actions.
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  crumbs,
}: {
  title: string;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-1">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Διαδρομή" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((c) => (
              <span key={c.href} className="inline-flex items-center gap-1">
                <Link href={c.href} className="hover:text-primary hover:underline">
                  {c.label}
                </Link>
                <ChevronRight aria-hidden className="size-3" />
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
