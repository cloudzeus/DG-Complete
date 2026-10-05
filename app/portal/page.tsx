import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "Τα dashboards μου" };

// Tenant portal — dashboards arrive in Phase 6.
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
              <CardDescription>Τα dashboards θα εμφανιστούν εδώ σύντομα.</CardDescription>
            </CardHeader>
          </Card>
        ))
      )}
    </main>
  );
}
