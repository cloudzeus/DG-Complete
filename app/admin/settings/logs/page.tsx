import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { AuditTable, ErrorsTable, RunsTable, type ErrorRow } from "./logs-tables";

export const metadata: Metadata = { title: "Αρχεία καταγραφής" };

const LIMIT = 2000;

export default async function LogsPage() {
  await requirePermission("platform.settings.manage");

  const [audit, runs, failedPayments, failedConnections, failedTenants] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { actor: { select: { name: true } }, tenant: { select: { name: true } } },
    }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: LIMIT, include: { job: { select: { name: true } } } }),
    prisma.payment.findMany({ where: { s1Status: "FAILED" }, include: { tenant: { select: { name: true } } }, take: 500 }),
    prisma.dataConnection.findMany({ where: { lastTestStatus: "FAILED" }, take: 500 }),
    prisma.tenant.findMany({ where: { warehouseStatus: "ERROR" }, take: 500 }),
  ]);

  const runRows = runs.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    job: r.job?.name ?? "Πελάτες",
    mode: r.mode,
    trigger: r.trigger,
    status: r.status,
    rows: r.rowsUpserted,
    error: r.error,
  }));

  const errors: ErrorRow[] = [
    ...runs
      .filter((r) => r.status === "FAILED")
      .map((r) => ({ id: `run-${r.id}`, at: r.startedAt.toISOString(), source: "Συγχρονισμός", subject: r.job?.name ?? "Πελάτες", message: r.error ?? "" })),
    ...failedPayments.map((p) => ({
      id: `pay-${p.id}`,
      at: p.updatedAt.toISOString(),
      source: "Τιμολόγηση",
      subject: `${p.tenant.name} · ${p.description}`,
      message: p.s1Error ?? "",
    })),
    ...failedConnections.map((c) => ({
      id: `conn-${c.id}`,
      at: (c.lastTestedAt ?? c.updatedAt).toISOString(),
      source: "Σύνδεση δεδομένων",
      subject: c.name,
      message: c.lastTestError ?? "",
    })),
    ...failedTenants.map((t) => ({
      id: `wh-${t.id}`,
      at: t.updatedAt.toISOString(),
      source: "Provisioning",
      subject: t.name,
      message: t.warehouseError ?? "",
    })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Αρχεία καταγραφής"
        description="Ποιος έκανε τι, κάθε εκτέλεση συγχρονισμού και όλα τα σφάλματα σε ένα σημείο."
        icon={ScrollText}
        tone="slate"
      />
      <Card>
        <CardContent>
          <Tabs defaultValue={errors.length ? "errors" : "audit"}>
            <TabsList className="mb-3">
              <TabsTrigger value="audit">Ενέργειες χρηστών ({audit.length.toLocaleString("el-GR")})</TabsTrigger>
              <TabsTrigger value="runs">Συγχρονισμοί ({runs.length.toLocaleString("el-GR")})</TabsTrigger>
              <TabsTrigger value="errors" className={errors.length ? "text-destructive" : undefined}>
                Σφάλματα ({errors.length.toLocaleString("el-GR")})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="audit">
              <AuditTable
                data={audit.map((a) => ({
                  id: a.id,
                  createdAt: a.createdAt.toISOString(),
                  actor: a.actor?.name ?? null,
                  tenant: a.tenant?.name ?? null,
                  action: a.action,
                  entity: a.entity,
                  meta: a.meta,
                }))}
              />
            </TabsContent>
            <TabsContent value="runs">
              <RunsTable data={runRows} />
            </TabsContent>
            <TabsContent value="errors">
              <ErrorsTable data={errors} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
