import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGrants, PERMISSION_DEFS, requirePermission, ROLES } from "@/lib/rbac";
import { AccessMatrix } from "./access-matrix";

export const metadata: Metadata = { title: "Διαχείριση πρόσβασης" };

export default async function AccessPage() {
  await requirePermission("platform.admins.manage");
  const grants = await getGrants();

  return (
    <>
      <PageHeader
        eyebrow="Ρυθμίσεις"
        title="Διαχείριση πρόσβασης"
        description="Ποιος ρόλος μπορεί να κάνει τι. Οι αλλαγές ισχύουν αμέσως για όλους τους χρήστες."
        icon={ShieldCheck}
        tone="blue"
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <SectionTitle icon={ShieldCheck} tone="blue">
              Ρόλοι & δικαιώματα
            </SectionTitle>
          </CardTitle>
          <CardDescription>
            Οι ρόλοι πλατφόρμας (Super admin, Admin) ισχύουν σε όλους τους tenants· οι ρόλοι tenant μόνο μέσα στον δικό τους.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccessMatrix
            roles={[...ROLES]}
            permissions={Object.entries(PERMISSION_DEFS).map(([key, d]) => ({ key, label: d.label, group: d.group }))}
            initial={grants}
          />
        </CardContent>
      </Card>
    </>
  );
}
