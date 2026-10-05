import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { TenantsTable } from "./tenants-table";

export const metadata: Metadata = { title: "Tenants" };

export default async function TenantsPage() {
  const user = await requirePermission("tenants.read");
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true, connections: true } } },
  });
  const manage = can(user, "tenants.manage");

  return (
    <>
      <PageHeader title="Tenants" description="Οι επιχειρήσεις που έχουν πρόσβαση στην πλατφόρμα." icon={Building2} tone="blue" />
      <Card>
        <CardContent>
          <TenantsTable
            canManage={manage}
            data={tenants.map((t) => ({
              id: t.id,
              name: t.name,
              email: t.email,
              afm: t.afm,
              s1Code: t.s1Code,
              status: t.status,
              isDemo: t.isDemo,
              warehouseStatus: t.warehouseStatus,
              users: t._count.memberships,
              connections: t._count.connections,
              createdAt: t.createdAt.toISOString(),
            }))}
            toolbar={
              manage ? (
                <Button size="sm" asChild>
                  <Link href="/admin/customers?filter=unlinked">
                    <Plus />
                    Νέος από SoftOne
                  </Link>
                </Button>
              ) : null
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
