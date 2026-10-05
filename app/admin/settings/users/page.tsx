import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { can, requirePermission } from "@/lib/rbac";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Χρήστες" };

export default async function UsersPage() {
  const user = await requirePermission("tenants.read");
  const [users, tenants] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ platformRole: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        active: true,
        createdAt: true,
        memberships: { select: { tenantId: true, role: true, tenant: { select: { name: true } } } },
      },
    }),
    prisma.tenant.findMany({ where: { status: { not: "CANCELED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Χρήστες" description="Λογαριασμοί, ρόλοι και πρόσβαση σε tenants." icon={Users} tone="amber" />
      <Card>
        <CardContent>
          <UsersTable
            currentUserId={user.id}
            canCreate={can(user, "tenants.manage")}
            canManagePlatformRoles={can(user, "platform.admins.manage")}
            tenants={tenants}
            data={users.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              platformRole: u.platformRole,
              active: u.active,
              createdAt: u.createdAt.toISOString(),
              memberships: u.memberships.map((m) => ({ tenantId: m.tenantId, tenantName: m.tenant.name, role: m.role })),
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
