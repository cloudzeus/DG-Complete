import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Cable,
  CreditCard,
  DatabaseZap,
  Plug,
  Users,
} from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { StatusPill, type Tone } from "@/components/admin/tone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { roleName, schemaName } from "@/lib/warehouse";
import { PaymentsTable } from "@/components/admin/payments-table";
import { PaymentDialog } from "@/app/admin/payments/payment-dialog";
import { S1Link } from "./s1-link";
import { StatusSelect } from "./status-select";
import { DemoToggle } from "./demo-toggle";
import { SourcesPanel } from "./sources-panel";
import { openSoftOneCredentials } from "@/lib/softone";
import type { Capabilities } from "@/lib/softone-detect";
import { WarehousePanel } from "./warehouse-panel";

export async function generateMetadata({
  params,
}: PageProps<"/admin/tenants/[id]">): Promise<Metadata> {
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: tenant?.name ?? "Πελάτης" };
}

const WAREHOUSE: Record<string, { label: string; tone: Tone }> = {
  NONE: { label: "Χωρίς provisioning", tone: "slate" },
  READY: { label: "Έτοιμο", tone: "green" },
  DISABLED: { label: "Απενεργοποιημένο", tone: "amber" },
  ERROR: { label: "Σφάλμα", tone: "red" },
};

export default async function TenantPage({
  params,
}: PageProps<"/admin/tenants/[id]">) {
  const user = await requirePermission("tenants.read");
  const { id } = await params;
  const [tenant, deployment, payments] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id },
      include: {
        memberships: {
          include: { user: { select: { name: true, email: true } } },
        },
        connections: {
          select: {
            id: true,
            name: true,
            engine: true,
            database: true,
            lastTestStatus: true,
          },
        },
      },
    }),
    prisma.cubeDeployment.findUnique({
      where: { id: "default" },
      select: {
        apiUrl: true,
        warehouseConnection: { select: { database: true, host: true } },
      },
    }),
    prisma.payment.findMany({
      where: { tenantId: id },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
  ]);
  if (!tenant) notFound();
  const s1Customer = tenant.s1Trdr
    ? await prisma.s1Customer.findFirst({
        where: { trdr: tenant.s1Trdr, connection: { scope: "DGSOFT" } },
      })
    : null;
  const canBill = can(user, "tenant.billing.manage", tenant.id);
  const canSources = can(user, "connections.tenant.manage", tenant.id);
  const tenantSoftOne = await prisma.softOneConnection.findFirst({
    where: { scope: "TENANT", tenantId: tenant.id },
  });
  const manage = can(user, "tenants.manage");
  const wh = WAREHOUSE[tenant.warehouseStatus];

  return (
    <>
      <Link
        href="/admin/tenants"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Πελάτες
      </Link>
      <PageHeader
        title={tenant.name}
        eyebrow={tenant.isDemo ? "Tenant · Demo (χωρίς συνδρομή)" : "Tenant"}
        description={
          [tenant.afm && `ΑΦΜ ${tenant.afm}`, tenant.email]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        icon={Building2}
        tone="blue"
        actions={
          <>
            <DemoToggle
              tenantId={tenant.id}
              isDemo={tenant.isDemo}
              disabled={!manage}
            />
            <StatusSelect
              tenantId={tenant.id}
              status={tenant.status}
              disabled={!manage}
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={Cable} tone="violet">
                  Πηγές δεδομένων
                </SectionTitle>
              </CardTitle>
              <CardDescription>
                Από πού αντλούνται τα δεδομένα του πελάτη για το BI (SoftOne
                πελάτη, βάσεις δεδομένων).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SourcesPanel
                tenantId={tenant.id}
                canManage={canSources}
                databases={tenant.connections}
                softone={
                  tenantSoftOne
                    ? {
                        id: tenantSoftOne.id,
                        baseUrl: tenantSoftOne.baseUrl,
                        appId: tenantSoftOne.appId,
                        username: openSoftOneCredentials(
                          tenantSoftOne.id,
                          tenantSoftOne.credentialsEnc,
                        ).username,
                        company: tenantSoftOne.company,
                        branch: tenantSoftOne.branch,
                        module: tenantSoftOne.module,
                        refId: tenantSoftOne.refId,
                        host: new URL(tenantSoftOne.baseUrl).host,
                        lastTestStatus: tenantSoftOne.lastTestStatus,
                        capabilities:
                          (tenantSoftOne.capabilities as Capabilities | null) ??
                          null,
                        detectedAt:
                          tenantSoftOne.detectedAt?.toISOString() ?? null,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SectionTitle
                  icon={DatabaseZap}
                  tone="teal"
                  extra={<StatusPill tone={wh.tone}>{wh.label}</StatusPill>}
                >
                  Αποθήκη δεδομένων Cube
                </SectionTitle>
              </CardTitle>
              <CardDescription>
                {deployment?.warehouseConnection ? (
                  <>
                    Schema{" "}
                    <code className="font-mono">{schemaName(tenant.id)}</code>{" "}
                    και ρόλος μόνο-ανάγνωσης{" "}
                    <code className="font-mono">{roleName(tenant.id)}</code> στη{" "}
                    <code className="font-mono">
                      {deployment.warehouseConnection.database}
                    </code>
                    . Με αυτόν τον ρόλο συνδέεται το Cube για τον συγκεκριμένο
                    πελάτη.
                  </>
                ) : (
                  <>Ρυθμίστε πρώτα τον Cube server (Admin → Cube server).</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WarehousePanel
                tenantId={tenant.id}
                status={tenant.warehouseStatus}
                error={tenant.warehouseError}
                provisionedAt={
                  tenant.warehouseProvisionedAt?.toISOString() ?? null
                }
                cubeConfigured={!!deployment?.warehouseConnection}
                canManage={manage}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={Plug} tone="violet">
                  Πελάτης SoftOne
                </SectionTitle>
              </CardTitle>
              <CardDescription>
                Η καρτέλα πελάτη στο SoftOne της DGsoft (πηγή στοιχείων και
                τιμολόγησης).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tenant.s1Trdr ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Κωδικός</dt>
                  <dd className="font-mono">
                    {s1Customer?.code ?? tenant.s1Code ?? "—"}
                  </dd>
                  {s1Customer && (
                    <>
                      <dt className="text-muted-foreground">Επωνυμία</dt>
                      <dd>{s1Customer.name}</dd>
                      <dt className="text-muted-foreground">Συγχρ.</dt>
                      <dd className="text-xs">
                        {s1Customer.syncedAt.toLocaleString("el-GR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {!s1Customer.isActive && (
                          <span className="ml-1 text-warning-500">
                            · ανενεργός στο SoftOne
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="text-muted-foreground">
                  Δεν είναι αντιστοιχισμένος.
                </p>
              )}
              <S1Link
                tenantId={tenant.id}
                linked={
                  tenant.s1Trdr
                    ? { trdr: tenant.s1Trdr, code: tenant.s1Code }
                    : null
                }
                canManage={manage}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <SectionTitle icon={Users} tone="amber">
                  Χρήστες
                </SectionTitle>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tenant.memberships.length === 0 ? (
                <p className="text-muted-foreground">Κανένας χρήστης ακόμα.</p>
              ) : (
                tenant.memberships.map((m) => (
                  <div key={m.id}>
                    <div className="font-medium">{m.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.user.email} ·{" "}
                      {m.role === "TENANT_ADMIN"
                        ? "Tenant admin"
                        : "Tenant user"}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="space-y-1.5">
            <CardTitle>
              <SectionTitle icon={CreditCard} tone="green">
                Πληρωμές
              </SectionTitle>
            </CardTitle>
            <CardDescription>
              Πληρωμές συνδρομής και καταχώρισή τους ως παραστατικά στο SoftOne.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <PaymentsTable
            storageKey="tenant-payments"
            canPost={canBill}
            payments={payments.map((p) => ({
              ...p,
              paidAt: p.paidAt.toISOString(),
              amount: p.amount.toString(),
            }))}
            toolbar={
              canBill ? (
                <PaymentDialog tenantId={tenant.id} linked={!!tenant.s1Trdr} />
              ) : null
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
