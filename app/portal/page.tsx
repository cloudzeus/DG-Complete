import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requireUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "Οι επιχειρήσεις μου" };

// Tenant portal — the user's businesses and their areas.
export default async function PortalHome() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-10">
      <h1 className="text-2xl font-semibold">Γεια σας, {user.name.split(" ")[0]}</h1>
      {user.memberships.length === 0 ? (
        <p className="text-muted-foreground">Ο λογαριασμός σας δεν έχει συνδεθεί ακόμα με κάποια επιχείρηση.</p>
      ) : (
        user.memberships.map((m) => (
          <Card key={m.tenantId}>
            <CardHeader>
              <CardTitle>{m.tenantName}</CardTitle>
              <CardDescription>
                {can(user, "tenant.dashboards.view", m.tenantId) ? (
                  <Link href={`/t/${m.tenantId}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                    <LayoutGrid className="size-4" /> Άνοιγμα
                  </Link>
                ) : (
                  "Δεν έχετε δικαίωμα πρόσβασης."
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        ))
      )}
    </main>
  );
}
