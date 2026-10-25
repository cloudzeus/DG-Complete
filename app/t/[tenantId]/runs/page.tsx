import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/dg/data-table";
import { EmptyState } from "@/components/dg/empty-state";
import { FilterBar } from "@/components/dg/filter-bar";
import { fmtDateTime, fmtDuration } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { RUN_STATUS, RUN_TRIGGER, type RunStatus } from "@/lib/labels";
import { listMethods, listRuns } from "@/lib/data/tenant";
import { requireTenant } from "@/lib/tenant";
import { SearchX } from "lucide-react";

export const metadata: Metadata = { title: "Εκτελέσεις" };

export default async function RunsPage({ params, searchParams }: PageProps<"/t/[tenantId]/runs">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}/runs`;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = str("status");
  const method = str("method");
  const [rows, methods] = await Promise.all([
    listRuns(tenantId, { q: str("q") || undefined, status: status || undefined, methodId: method || undefined, take: 200 }),
    listMethods(tenantId),
  ]);

  return (
    <>
      <PageHeader eyebrow="Εκτέλεση" title="Εκτελέσεις" description="Κάθε εκτέλεση έχει πλήρη logs, βήματα και στιγμιότυπα σφαλμάτων." />
      <Section>
        <FilterBar
          q={str("q")}
          placeholder="Αναζήτηση id, externalRef, μεθόδου"
          selects={[
            { name: "status", label: "Κατάσταση", value: status, options: (Object.keys(RUN_STATUS) as RunStatus[]).map((k) => ({ value: k, label: RUN_STATUS[k].label })) },
            { name: "method", label: "Μέθοδος", value: method, options: methods.map((m) => ({ value: m.id, label: m.name })) },
          ]}
        />
        <DataTable
          caption="Εκτελέσεις"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={SearchX} title="Καμία εκτέλεση" description="Δεν βρέθηκαν εκτελέσεις με αυτά τα φίλτρα." />}
          columns={[
            { key: "id", header: "Εκτέλεση", cell: (r) => <Link href={`${base}/${r.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{r.id}</Link> },
            { key: "s", header: "Κατάσταση", cell: (r) => <StatusBadge status={r.status} map={RUN_STATUS} /> },
            { key: "m", header: "Μέθοδος", cell: (r) => <span>{r.methodName}<span className="block text-2xs text-muted-foreground">{RUN_TRIGGER[r.trigger] ?? r.trigger}</span></span> },
            { key: "ref", header: "externalRef", cell: (r) => <code className="font-mono text-xs">{r.externalRef ?? "—"}</code> },
            { key: "d", header: "Διάρκεια", align: "right", cell: (r) => fmtDuration(r.durationMs) },
            { key: "t", header: "Ώρα", align: "right", cell: (r) => fmtDateTime(r.createdAt) },
            { key: "e", header: "Σφάλμα", cell: (r) => (r.error ? <code className="font-mono text-2xs text-danger-500">{r.error.code}</code> : "—") },
          ]}
        />
        <nav aria-label="Σελίδες" className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{rows.length === 200 ? "Οι 200 πιο πρόσφατες — περιορίστε με φίλτρα" : `${rows.length} εκτελέσεις`}</span>
        </nav>
      </Section>
    </>
  );
}
