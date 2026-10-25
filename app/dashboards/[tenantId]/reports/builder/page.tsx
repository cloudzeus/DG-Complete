import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportBuilder } from "@/components/reports/report-builder";
import { can } from "@/lib/rbac";
import { requireDashboardTenant } from "@/lib/dashboards";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { REPORT_LIBRARY, type ReportDefinition } from "@/lib/report-types";
import { reportMeta } from "@/lib/reports";

export const metadata: Metadata = { title: "Report builder" };

export default async function ReportBuilderPage({ params, searchParams }: PageProps<"/dashboards/[tenantId]/reports/builder">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const { user } = await requireDashboardTenant(tenantId, "reports/builder");
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);

  let initial: ReportDefinition | null = null;
  let saved: { id: string; name: string; description: string | null; shared: boolean; mine: boolean } | null = null;
  const id = one("id");
  if (id) {
    const r = await prisma.savedReport.findFirst({ where: { id, tenantId, OR: [{ userId: user.id }, { shared: true }] } });
    if (!r) notFound();
    initial = r.definition as ReportDefinition;
    saved = { id: r.id, name: r.name, description: r.description, shared: r.shared, mine: r.userId === user.id || can(user, "tenant.dashboards.edit", tenantId) };
  } else {
    const preset = REPORT_LIBRARY.find((r) => r.key === one("preset"));
    if (preset) initial = structuredClone(preset.definition);
  }
  const period = one("period");
  if (initial && period && period in PERIOD_PRESETS && period !== "custom") initial = { ...initial, period: { preset: period as PeriodPreset } };

  const cubes = await reportMeta(tenantId);
  const libName = REPORT_LIBRARY.find((r) => r.key === one("preset"))?.name;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{saved?.name ?? libName ?? "Νέα αναφορά"}</h1>
        <p className="text-xs text-muted-foreground">
          Σύρετε πεδία στις γραμμές, στήλες, τιμές και φίλτρα. Η αναφορά ενημερώνεται αμέσως· εξαγωγή σε Excel ή PDF και αποθήκευση για εσάς ή όλη την ομάδα.
        </p>
      </div>
      {cubes.length ? (
        <ReportBuilder key={id ?? one("preset") ?? "new"} tenantId={tenantId} cubes={cubes} initial={initial} saved={saved} name={libName} />
      ) : (
        <p className="text-sm text-muted-foreground">Δεν υπάρχουν διαθέσιμα δεδομένα για αναφορές.</p>
      )}
    </>
  );
}
