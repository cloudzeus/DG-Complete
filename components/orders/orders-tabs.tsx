import Link from "next/link";
import { cn } from "@/lib/utils";

// Παραγγελίες αγορών: the order editor and the per-brand suggestions with their justification.

export function OrdersTabs({ tenantId, active }: { tenantId: string; active: "editor" | "brands" }) {
  const base = `/dashboards/${tenantId}/orders`;
  const tabs = [
    { key: "editor", label: "Παραγγελία", href: base },
    { key: "brands", label: "Προτάσεις ανά μάρκα · τεκμηρίωση & εναλλακτικά", href: `${base}/brands` },
  ] as const;
  return (
    <nav aria-label="Παραγγελίες" className="flex flex-wrap gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px min-h-10 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.key ? "border-dg-red-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
