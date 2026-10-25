import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { EmptyState } from "@/components/dg/empty-state";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/lib/actions/tenant";
import { listNotifications } from "@/lib/data/tenant";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ειδοποιήσεις" };

export default async function NotificationsPage({ params }: PageProps<"/t/[tenantId]/notifications">) {
  const { tenantId } = await params;
  const { user } = await requireTenant(tenantId);
  const items = await listNotifications(tenantId, user.id);
  return (
    <>
      <PageHeader
        title="Ειδοποιήσεις"
        actions={
          items.some((n) => !n.read) && (
            <form action={markNotificationsReadAction.bind(null, tenantId)}>
              <Button type="submit" size="sm" variant="outline">
                <CheckCheck aria-hidden /> Σήμανση όλων ως αναγνωσμένων
              </Button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Καμία ειδοποίηση" />
      ) : (
        <Section bodyClassName="p-0">
          <ul className="divide-y divide-border/60">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.href ? `/t/${tenantId}/${n.href.replace(/^\//, "")}` : `/t/${tenantId}`} className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/40 sm:px-5">
                  <Bell aria-hidden className={cn("mt-0.5 size-4 shrink-0", n.read ? "text-muted-foreground" : "text-sisyphus-500")} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className={cn("block", !n.read && "font-semibold")}>{n.text}</span>
                    {n.body && <span className="block text-xs text-muted-foreground">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDateTime(n.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
