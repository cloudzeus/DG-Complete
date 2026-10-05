import Link from "next/link";
import { Activity, Building2, Contact, CreditCard, Database, LayoutDashboard, PlugZap, Server } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });

export default async function AdminHome() {
  const user = await requireUser();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [tenants, activeTenants, customers, revenue, pendingS1, connections, failedConnections, softone, cube, lastSync, recent] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.s1Customer.count(),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "PAID", paidAt: { gte: monthStart } } }),
      prisma.payment.count({ where: { status: "PAID", s1Status: { in: ["NOT_POSTED", "FAILED"] } } }),
      prisma.dataConnection.count(),
      prisma.dataConnection.count({ where: { lastTestStatus: "FAILED" } }),
      prisma.softOneConnection.findFirst({ where: { scope: "DGSOFT" }, select: { lastTestStatus: true } }),
      prisma.cubeDeployment.findUnique({ where: { id: "default" }, select: { apiUrl: true } }),
      prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" }, select: { status: true, startedAt: true, rowsUpserted: true } }),
      prisma.payment.findMany({
        orderBy: { paidAt: "desc" },
        take: 5,
        include: { tenant: { select: { id: true, name: true } } },
      }),
    ]);

  const system = [
    {
      label: "SoftOne DGsoft",
      icon: PlugZap,
      href: "/admin/settings/softone",
      state: softone ? (softone.lastTestStatus === "OK" ? "ok" : "error") : "none",
      detail: softone ? "Web Services" : "Δεν έχει ρυθμιστεί",
    },
    {
      label: "Cube server",
      icon: Server,
      href: "/admin/settings/cube",
      state: cube ? "ok" : "none",
      detail: cube ? new URL(cube.apiUrl).host : "Δεν έχει ρυθμιστεί",
    },
    {
      label: "Συγχρονισμός πελατών",
      icon: Activity,
      href: "/admin/customers",
      state: lastSync ? (lastSync.status === "SUCCESS" ? "ok" : lastSync.status === "FAILED" ? "error" : "running") : "none",
      detail: lastSync
        ? `${lastSync.startedAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })} · ${lastSync.rowsUpserted} εγγραφές`
        : "Δεν έχει τρέξει",
    },
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Επισκόπηση"
        title={`Καλώς ήρθατε, ${user.name.split(" ")[0]}`}
        description="Η εικόνα της πλατφόρμας DGsmart BI με μια ματιά."
        icon={LayoutDashboard}
        tone="red"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard href="/admin/tenants" label="Tenants" value={tenants} hint={`${activeTenants} ενεργοί`} icon={Building2} tone="blue" />
        <StatCard href="/admin/customers" label="Πελάτες SoftOne" value={customers} hint="συγχρονισμένοι" icon={Contact} tone="violet" />
        <StatCard
          href="/admin/payments"
          label="Έσοδα μήνα"
          value={eur.format(Number(revenue._sum.amount ?? 0))}
          hint={pendingS1 ? `${pendingS1} εκκρεμούν προς SoftOne` : "όλες στο SoftOne"}
          icon={CreditCard}
          tone="green"
        />
        <StatCard
          href="/admin/settings/connections"
          label="Συνδέσεις δεδομένων"
          value={connections}
          hint={failedConnections ? `${failedConnections} με σφάλμα` : "χωρίς σφάλματα"}
          icon={Database}
          tone={failedConnections ? "amber" : "teal"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={CreditCard} tone="green">
                Πρόσφατες πληρωμές
              </SectionTitle>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">Καμία πληρωμή ακόμα.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <Link href={`/admin/tenants/${p.tenant.id}`} className="block truncate font-medium hover:underline">
                        {p.tenant.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {p.paidAt.toLocaleDateString("el-GR")} · {p.description}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums">{eur.format(Number(p.amount))}</span>
                      {p.s1Status === "POSTED" ? (
                        <StatusPill tone="green">SoftOne</StatusPill>
                      ) : (
                        <StatusPill tone="amber">Εκκρεμεί</StatusPill>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={Activity} tone="red">
                Κατάσταση συστήματος
              </SectionTitle>
            </CardTitle>
            <CardDescription>Διασυνδέσεις και εργασίες παρασκηνίου.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {system.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/70"
              >
                <s.icon className="size-4 text-dg-red-500" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
                </span>
                {s.state === "ok" && <StatusPill tone="green">OK</StatusPill>}
                {s.state === "error" && <StatusPill tone="red">Σφάλμα</StatusPill>}
                {s.state === "running" && <StatusPill tone="blue">Τρέχει</StatusPill>}
                {s.state === "none" && <StatusPill tone="slate">—</StatusPill>}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
