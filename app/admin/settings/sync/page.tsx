import type { Metadata } from "next";
import Link from "next/link";
import { History, RefreshCcw, Timer } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getDgsoftConnection } from "@/lib/softone";
import { ensureCustomersJob } from "@/lib/softone-sync";
import { JobsTable } from "./jobs-table";

export const metadata: Metadata = { title: "Συγχρονισμοί" };

export default async function SyncPage() {
  await requirePermission("platform.settings.manage");
  const conn = await getDgsoftConnection();
  if (conn) await ensureCustomersJob(conn.id, conn.company);

  const [jobs, counts, customers, runs] = await Promise.all([
    prisma.syncJob.findMany({ orderBy: { name: "asc" } }),
    prisma.s1Record.groupBy({ by: ["jobId"], _count: { _all: true } }),
    conn ? prisma.s1Customer.count({ where: { connectionId: conn.id } }) : 0,
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 12, include: { job: { select: { name: true } } } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Συγχρονισμοί (cron jobs)"
        description="Ποιοι πίνακες του SoftOne της DGsoft αντιγράφονται στην εφαρμογή και πόσο συχνά."
        icon={RefreshCcw}
        tone="violet"
      />

      {!conn && (
        <Card className="mb-4">
          <CardContent className="text-muted-foreground">
            Ρυθμίστε πρώτα τη{" "}
            <Link href="/admin/settings/softone" className="text-primary hover:underline">
              σύνδεση SoftOne
            </Link>
            .
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 2xl:grid-cols-4">
        <Card className="2xl:col-span-3">
          <CardContent>
            <JobsTable
              connected={!!conn}
              data={jobs.map((j) => ({
                id: j.id,
                name: j.name,
                type: j.type,
                table: j.table,
                fields: j.fields,
                keyField: j.keyField,
                updField: j.updField,
                filter: j.filter,
                intervalMinutes: j.intervalMinutes,
                enabled: j.enabled,
                lastRunAt: j.lastRunAt?.toISOString() ?? null,
                lastStatus: j.lastStatus,
                nextRunAt: j.nextRunAt?.toISOString() ?? null,
                records: j.type === "CUSTOMERS" ? customers : (counts.find((c) => c.jobId === j.id)?._count._all ?? 0),
              }))}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1 2xl:content-start">
          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={Timer} tone="blue">
                  Χρονοπρογραμματισμός
                </SectionTitle>
              </CardTitle>
              <CardDescription>Scheduled task στο Coolify κάθε 5 λεπτά:</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-md bg-muted p-2.5 font-mono text-2xs leading-relaxed">
                {`curl -fsS -X POST \\\n  -H "Authorization: Bearer $CRON_SECRET" \\\n  https://<app>/api/internal/cron/run`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={History} tone="violet">
                  Πρόσφατες εκτελέσεις
                </SectionTitle>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs.length === 0 && <p className="text-muted-foreground">Καμία ακόμα.</p>}
              {runs.map((r) => (
                <div key={r.id} className="space-y-0.5 border-b border-border/60 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{r.job?.name ?? "Πελάτες"}</span>
                    <StatusPill tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "blue"}>
                      {r.status === "SUCCESS" ? "OK" : r.status === "FAILED" ? "Σφάλμα" : "Τρέχει"}
                    </StatusPill>
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    {r.startedAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {r.mode === "FULL" ? "πλήρης" : "αυξητικός"} · {r.trigger === "cron" ? "cron" : "χειροκίνητα"} · {r.rowsUpserted}
                  </div>
                  {r.error && <div className="line-clamp-2 break-all text-2xs text-destructive">{r.error}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
