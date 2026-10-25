import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CreditCard,
  LayoutGrid,
  Sparkles,
  Plug,
  Users,
} from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { PaymentsTable } from "@/components/admin/payments-table";
import { PaymentDialog } from "@/app/admin/payments/payment-dialog";
import { S1Link } from "./s1-link";
import { StatusSelect } from "./status-select";
import { DemoToggle } from "./demo-toggle";
import { TenantUsers } from "./tenant-users";
import { SubscriptionForm } from "./subscription-form";
import { TenantAiTokens } from "@/app/admin/ai-tokens/tenant-panel";

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

export default async function TenantPage({
  params,
}: PageProps<"/admin/tenants/[id]">) {
  const user = await requirePermission("tenants.read");
  const { id } = await params;
  const [tenant, payments] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                active: true,
                platformRole: true,
                _count: { select: { memberships: true } },
                sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
              },
            },
          },
        },
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
  const plans = await prisma.plan.findMany({ orderBy: [{ active: "desc" }, { price: "asc" }] });
  const manage = can(user, "tenants.manage");

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
            <Button size="sm" asChild>
              <Link href={`/t/${tenant.id}`}>
                <LayoutGrid />
                Περιοχή πελάτη
              </Link>
            </Button>
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
          {user.platformRole === "SUPER_ADMIN" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <SectionTitle icon={Sparkles} tone="violet">
                    AI tokens
                  </SectionTitle>
                </CardTitle>
                <CardDescription>Το υπόλοιπο για τις λειτουργίες AI, η κατανάλωση και οι κινήσεις.</CardDescription>
              </CardHeader>
              <CardContent>
                <TenantAiTokens tenantId={tenant.id} />
              </CardContent>
            </Card>
          )}
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
            <CardContent>
              <TenantUsers
                tenantId={tenant.id}
                currentUserId={user.id}
                canManage={can(user, "tenant.users.manage", tenant.id)}
                users={tenant.memberships
                  .filter((m) => m.user.platformRole === "USER")
                  .map((m) => ({
                    id: m.user.id,
                    name: m.user.name,
                    email: m.user.email,
                    role: m.role,
                    active: m.user.active,
                    otherTenants: m.user._count.memberships - 1,
                    lastLogin: m.user.sessions[0]?.createdAt.toISOString() ?? null,
                  }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={CalendarClock} tone="amber">
              Συνδρομή
            </SectionTitle>
          </CardTitle>
          <CardDescription>
            Περίοδος, ποσό και λήξη. Κάθε καταχωρημένη πληρωμή την παρατείνει κατά μία περίοδο· οι υπενθυμίσεις ανανέωσης και πληρωμής
            στέλνονται αυτόματα (Ρυθμίσεις → Email).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubscriptionForm
            tenantId={tenant.id}
            canManage={canBill}
            today={new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date())}
            plans={plans.map((p) => ({ id: p.id, name: p.name, period: p.period, price: p.price.toString(), services: p.services, active: p.active }))}
            values={{
              planId: tenant.planId ?? "",
              period: tenant.subscriptionPeriod ?? "",
              amount: tenant.subscriptionAmount ? tenant.subscriptionAmount.toString() : "",
              endsAt: tenant.subscriptionEndsAt
                ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(tenant.subscriptionEndsAt)
                : "",
              email: tenant.email ?? "",
            }}
          />
        </CardContent>
      </Card>

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
