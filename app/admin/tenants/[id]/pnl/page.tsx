import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ListTree, Scale, TableProperties } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { previewPnl, tenantSeries, unmappedAccounts, type PnlPreview, type UnmappedAccount } from "@/lib/pnl";
import { TEMPLATES, type TemplateKey } from "@/lib/pnl-templates";
import type { Capabilities } from "@/lib/softone-detect";
import { LinesTable } from "./lines-table";
import { PnlStatement } from "./pnl-statement";
import { PnlToolbar } from "./pnl-toolbar";
import { UnmappedTable } from "./unmapped-table";

export const metadata: Metadata = { title: "Αποτελέσματα χρήσης" };

export default async function TenantPnlPage({ params, searchParams }: PageProps<"/admin/tenants/[id]/pnl">) {
  const { id } = await params;
  const { year: yearParam } = await searchParams;
  const user = await requirePermission("tenants.read");
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true, warehouseStatus: true } });
  if (!tenant) notFound();
  const canEdit = can(user, "tenant.dashboards.edit", tenant.id);

  const [config, lines, source] = await Promise.all([
    prisma.pnlConfig.findUnique({ where: { tenantId: id } }),
    prisma.pnlLine.findMany({ where: { tenantId: id }, include: { rules: { orderBy: { pattern: "asc" } } }, orderBy: { sortOrder: "asc" } }),
    prisma.softOneConnection.findFirst({ where: { scope: "TENANT", tenantId: id }, select: { capabilities: true } }),
  ]);
  const caps = source?.capabilities as Capabilities | null;
  const recommended: TemplateKey = caps?.recommended === "COMMERCIAL" ? "COMMERCIAL" : "EGLS";

  const requested = Number(yearParam);
  let preview: PnlPreview | null = null;
  let unmapped: UnmappedAccount[] = [];
  let warehouseError: string | null = null;
  const series = await tenantSeries(id);
  if (tenant.warehouseStatus === "READY" || tenant.warehouseStatus === "DISABLED") {
    try {
      preview = await previewPnl(id, Number.isInteger(requested) ? requested : undefined);
      if (preview && config?.source === "GL") unmapped = await unmappedAccounts(id, preview.year);
    } catch (err) {
      warehouseError = (err as Error).message;
    }
  }

  const totals = (code: string) => (preview?.months[code] ?? []).reduce((a, b) => a + b, 0);
  const lineRows = lines.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    section: l.section,
    sortOrder: l.sortOrder,
    rules: l.rules.map((r) => ({ source: r.source as "GL" | "SALES" | "PURCHASES", pattern: r.pattern, negate: r.negate })),
    total: totals(l.code),
  }));
  const year = preview?.year ?? new Date().getFullYear();

  return (
    <>
      <Link href={`/admin/tenants/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {tenant.name}
      </Link>
      <PageHeader
        title="Αποτελέσματα χρήσης"
        description="Πώς οι κινήσεις του πελάτη (Γενική Λογιστική ή παραστατικά) σχηματίζουν τα αποτελέσματα. Η δομή είναι ανά πελάτη και επεξεργάσιμη· ξαναϋπολογίζεται αυτόματα μετά από κάθε άντληση."
        icon={Scale}
        tone="green"
        actions={<PnlToolbar tenantId={id} recommended={recommended}
            current={config?.template as TemplateKey | undefined} hasLines={lines.length > 0} canEdit={canEdit} />}
      />

      {config && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone={config.source === "GL" ? "blue" : "violet"}>{TEMPLATES[config.template as TemplateKey]?.label ?? config.template}</StatusPill>
          {config.builtAt && (
            <span>
              Τελευταίος υπολογισμός {config.builtAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" })} ·{" "}
              {(config.buildRows ?? 0).toLocaleString("el-GR")} κινήσεις
            </span>
          )}
          {config.buildError && <StatusPill tone="red">Σφάλμα υπολογισμού</StatusPill>}
        </div>
      )}
      {config?.buildError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertDescription>{config.buildError}</AlertDescription>
        </Alert>
      )}
      {warehouseError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertDescription>Η αποθήκη δεδομένων δεν είναι διαθέσιμη: {warehouseError}</AlertDescription>
        </Alert>
      )}

      {!config ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Δεν έχει οριστεί δομή αποτελεσμάτων. Επιλέξτε πρότυπο πάνω δεξιά —{" "}
            {recommended === "EGLS" ? "βρέθηκε Γενική Λογιστική, προτείνεται το ΕΓΛΣ." : "προτείνεται το εμπορικό (από παραστατικά)."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={TableProperties} tone="green">
                  Κατάσταση αποτελεσμάτων {year}
                </SectionTitle>
              </CardTitle>
              <CardDescription>Ανά μήνα, με υποσύνολα και σύγκριση με την προηγούμενη χρήση.</CardDescription>
            </CardHeader>
            <CardContent>
              {preview && preview.years.length ? (
                <PnlStatement lines={lines} preview={preview} hrefForYear={(y) => `/admin/tenants/${id}/pnl?year=${y}`} />
              ) : (
                <p className="text-sm text-muted-foreground">Δεν υπάρχουν ακόμα κινήσεις — πατήστε «Υπολογισμός» μετά την άντληση δεδομένων.</p>
              )}
            </CardContent>
          </Card>

          {config.source === "GL" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <SectionTitle icon={AlertTriangle} tone="amber" extra={<StatusPill tone={unmapped.length ? "amber" : "green"}>{unmapped.length}</StatusPill>}>
                    Μη αντιστοιχισμένοι λογαριασμοί {year}
                  </SectionTitle>
                </CardTitle>
                <CardDescription>
                  Λογαριασμοί με κινήσεις στις ομάδες που χρησιμοποιούν οι κανόνες, που δεν καταλήγουν σε καμία γραμμή.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UnmappedTable tenantId={id} data={unmapped} lines={lines.map((l) => ({ id: l.id, name: l.name }))} canEdit={canEdit} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={ListTree} tone="blue">
                  Γραμμές & κανόνες
                </SectionTitle>
              </CardTitle>
              <CardDescription>Η δομή των αποτελεσμάτων του πελάτη. Κάθε αλλαγή ξαναϋπολογίζει αμέσως τα στοιχεία.</CardDescription>
            </CardHeader>
            <CardContent>
              <LinesTable tenantId={id} data={lineRows} series={series} canEdit={canEdit} year={year} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
