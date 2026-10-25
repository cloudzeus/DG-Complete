import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/dg/data-table";
import { EmptyState } from "@/components/dg/empty-state";
import { FilterBar } from "@/components/dg/filter-bar";
import { fmtDateTime, fmtDuration } from "@/components/dg/format";
import { PageHeader } from "@/components/dg/page-header";
import { Section } from "@/components/dg/section";
import { StatusBadge } from "@/components/dg/status-badge";
import { RUN_STATUS, type RunStatus } from "@/lib/labels";
import { methodOf, methods, runs } from "@/lib/mock/data";
import { requireTenant } from "@/lib/tenant";
import { SearchX } from "lucide-react";

export const metadata: Metadata = { title: "Εκτελέσεις" };

const TRIGGER = { api: "API", job: "Μαζική", manual: "Χειροκίνητη" };

export default async function RunsPage({ params, searchParams }: PageProps<"/t/[tenantId]/runs">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  await requireTenant(tenantId);
  const base = `/t/${tenantId}/runs`;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").toLowerCase();
  const status = str("status");
  const method = str("method");
  const rows = runs.filter(
    (r) =>
      (!status || r.status === status) &&
      (!method || r.methodId === method) &&
      (!q || r.id.includes(q) || (r.externalRef ?? "").toLowerCase().includes(q) || (methodOf(r.methodId)?.key.toLowerCase() ?? "").includes(q)),
  );

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
            { key: "m", header: "Μέθοδος", cell: (r) => <span>{methodOf(r.methodId)?.name}<span className="block text-2xs text-muted-foreground">{TRIGGER[r.trigger]}</span></span> },
            { key: "ref", header: "externalRef", cell: (r) => <code className="font-mono text-xs">{r.externalRef ?? "—"}</code> },
            { key: "d", header: "Διάρκεια", align: "right", cell: (r) => fmtDuration(r.durationMs) },
            { key: "t", header: "Ώρα", align: "right", cell: (r) => fmtDateTime(r.createdAt) },
            { key: "e", header: "Σφάλμα", cell: (r) => (r.error ? <code className="font-mono text-2xs text-danger-500">{r.error.code}</code> : "—") },
          ]}
        />
        <nav aria-label="Σελίδες" className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{rows.length} εκτελέσεις</span>
          <span className="tabular-nums">Σελίδα 1 από 1</span>
        </nav>
      </Section>
    </>
  );
}
