import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { fmtDateTime } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { notifications } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Ειδοποιήσεις" };

export default async function NotificationsPage({ params }: PageProps<"/t/[tenantId]/notifications">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  return (
    <>
      <PageHeader title="Ειδοποιήσεις" />
      <Section bodyClassName="p-0">
        <ul className="divide-y divide-border/60">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link href={`/t/${tenantId}/${n.href}`} className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/40 sm:px-5">
                <Bell aria-hidden className="mt-0.5 size-4 shrink-0 text-sisyphus-500" />
                <span className="min-w-0 flex-1 text-sm">{n.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDateTime(n.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
