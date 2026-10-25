import type { Metadata } from "next";
import Link from "next/link";
import { Contact, History } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { getDgsoftConnection } from "@/lib/softone";
import { CustomersTable } from "./customers-table";
import { SyncButtons } from "./sync-buttons";

export const metadata: Metadata = { title: "Πελάτες SoftOne" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const user = await requirePermission("tenants.read");
  const sp = await searchParams;
  const filter = sp.filter === "linked" || sp.filter === "unlinked" ? sp.filter : "all";

  const conn = await getDgsoftConnection();
  if (!conn) {
    return (
      <>
        <PageHeader title="Πελάτες SoftOne" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Ρυθμίστε πρώτα τη σύνδεση με το SoftOne της DGsoft στις{" "}
            <Link href="/admin/settings/softone" className="text-primary hover:underline">
              Ρυθμίσεις
            </Link>
            .
          </CardContent>
        </Card>
      </>
    );
  }

  const [customers, tenants, runs] = await Promise.all([
    prisma.s1Customer.findMany({ where: { connectionId: conn.id }, orderBy: { name: "asc" }, take: 10000 }),
    prisma.tenant.findMany({ where: { s1Trdr: { not: null } }, select: { s1Trdr: true, id: true, name: true } }),
    prisma.syncRun.findMany({
      where: { connectionId: conn.id, kind: "DGSOFT_CUSTOMERS" },
      orderBy: { startedAt: "desc" },
      take: 6,
    }),
  ]);
  const byTrdr = new Map(tenants.map((t) => [t.s1Trdr!, { id: t.id, name: t.name }]));
  const manage = can(user, "tenants.manage");

  return (
    <>
      <PageHeader
        title="Πελάτες SoftOne"
        description="Οι πελάτες του SoftOne της DGsoft. Από εδώ δημιουργούνται οι tenants της πλατφόρμας."
        icon={Contact}
        tone="violet"
        actions={manage ? <SyncButtons /> : null}
      />

      <div className="grid gap-4 2xl:grid-cols-4">
        <Card className="2xl:col-span-3">
          <CardContent>
            <CustomersTable
              canManage={manage}
              initialFilter={filter}
              data={customers.map((c) => ({
                id: c.id,
                trdr: c.trdr,
                code: c.code,
                name: c.name,
                afm: c.afm,
                email: c.email,
                phone: c.phone,
                city: c.city,
                isActive: c.isActive,
                syncedAt: c.syncedAt.toISOString(),
                tenant: byTrdr.get(c.trdr) ?? null,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <SectionTitle icon={History} tone="violet">
                Συγχρονισμοί
              </SectionTitle>
            </CardTitle>
            <CardDescription>Αυτόματα μέσω cron, ή χειροκίνητα.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length === 0 && <p className="text-muted-foreground">Κανένας ακόμα.</p>}
            {runs.map((r) => (
              <div key={r.id} className="space-y-0.5 border-b pb-2 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">
                    {r.startedAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <StatusPill tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "blue"}>
                    {r.status === "SUCCESS" ? "OK" : r.status === "FAILED" ? "Σφάλμα" : "Σε εξέλιξη"}
                  </StatusPill>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.mode === "FULL" ? "Πλήρης" : "Αυξητικός"} · {r.trigger === "cron" ? "cron" : "χειροκίνητα"} · {r.rowsUpserted}{" "}
                  εγγραφές{r.tenantsUpdated ? ` · ${r.tenantsUpdated} tenants ενημερώθηκαν` : ""}
                </div>
                {r.error && <div className="break-all text-xs text-destructive">{r.error}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
