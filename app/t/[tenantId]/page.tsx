import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenant } from "@/lib/tenant";

export const metadata: Metadata = { title: "Επισκόπηση" };

export default async function TenantHome({ params }: PageProps<"/t/[tenantId]">) {
  const { tenantId } = await params;
  const { tenant, access } = await requireTenant(tenantId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tenant.name}</CardTitle>
        <CardDescription>
          {access.planName ? `Πακέτο ${access.planName}` : "Χωρίς πακέτο"} · Η περιοχή πελάτη του DG Complete ετοιμάζεται.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
