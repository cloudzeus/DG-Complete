import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { serviceDef } from "@/lib/services";
import { DeletePlan } from "./delete-plan";

export const metadata: Metadata = { title: "Πακέτα" };

const eur = (v: unknown) => `${Number(v).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default async function PlansPage() {
  const user = await requirePermission("tenants.read");
  const manage = can(user, "platform.plans.manage");
  const plans = await prisma.plan.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { price: "asc" }], include: { _count: { select: { tenants: true } } } });

  return (
    <>
      <PageHeader
        title="Πακέτα"
        description="Τι πουλάμε: υπηρεσίες, τιμή και περίοδος. Το πακέτο ενός πελάτη ορίζει ποια dashboards, αν έχει τον Κίμωνα, τις παραγγελίες αγορών και τα web services."
        icon={Package}
        tone="violet"
        actions={
          manage && (
            <Button asChild>
              <Link href="/admin/plans/new">
                <Plus className="size-4" /> Νέο πακέτο
              </Link>
            </Button>
          )
        }
      />
      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Δεν υπάρχουν ακόμα πακέτα. Χωρίς πακέτο, ένας πελάτης βλέπει τα dashboards και τον Κίμωνα· παραγγελίες αγορών και web services χρειάζονται πακέτο.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={p.active ? undefined : "opacity-70"}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{p.name}</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {eur(p.price)} <span className="text-sm font-normal text-muted-foreground">/ {p.period === "MONTHLY" ? "μήνα" : "έτος"}</span>
                    </div>
                  </div>
                  {p.active ? <StatusPill tone="green">Ενεργό</StatusPill> : <StatusPill tone="slate">Ανενεργό</StatusPill>}
                </div>
                {p.description && <p className="line-clamp-3 text-sm text-muted-foreground">{p.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {p.services.map((s) => (
                    <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {serviceDef(s)?.name ?? s}
                    </span>
                  ))}
                  {p.aiTokensMonthly > 0 && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                      {p.aiTokensMonthly.toLocaleString("el-GR")} AI tokens / μήνα
                    </span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
                  <span>{p._count.tenants === 0 ? "Κανένας πελάτης" : `${p._count.tenants} πελάτ${p._count.tenants === 1 ? "ης" : "ες"}`}</span>
                  {manage && (
                    <span className="flex gap-1">
                      {p._count.tenants === 0 && <DeletePlan id={p.id} name={p.name} />}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/plans/${p.id}`}>Επεξεργασία</Link>
                      </Button>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
