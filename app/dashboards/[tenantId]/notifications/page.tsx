import type { Metadata } from "next";
import { Bell, Sparkles } from "lucide-react";
import { requireDashboardTenant } from "@/lib/dashboards";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { SendNow, WeeklyToggle } from "./weekly-toggle";

export const metadata: Metadata = { title: "Ειδοποιήσεις" };

export default async function NotificationsPage({ params }: PageProps<"/dashboards/[tenantId]/notifications">) {
  const { tenantId } = await params;
  const { user, access } = await requireDashboardTenant(tenantId, "notifications");
  const manage = can(user, "tenant.users.manage", tenantId);
  const kimon = access.services.has("kimon");
  const members = await prisma.membership.findMany({
    where: manage ? { tenantId } : { tenantId, userId: user.id },
    select: { userId: true, role: true, weeklyReport: true, user: { select: { name: true, email: true, active: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const me = members.find((m) => m.userId === user.id);

  return (
    <>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Bell className="size-5 text-dg-red-500" /> Ειδοποιήσεις
        </h1>
        <p className="text-xs text-muted-foreground">Τι στέλνει το DGsmart BI με email και σε ποιους.</p>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-violet-600" /> Εβδομαδιαία αναφορά του Κίμωνα
            </h2>
            <p className="text-sm text-muted-foreground">
              Κάθε Δευτέρα πρωί: πώς πήγε η εβδομάδα, τι θέλει προσοχή (ληξιπρόθεσμα, εξαντλημένα είδη, πτώση κέρδους) και 2–3 συγκεκριμένες
              ενέργειες για την εβδομάδα — γραμμένα από τον Κίμωνα με τα δεδομένα της εταιρείας σας. Καταναλώνει λίγα AI tokens.
            </p>
          </div>
          {kimon && <SendNow tenantId={tenantId} />}
        </div>
        {!kimon ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Η αναφορά απαιτεί τον Κίμωνα στο πακέτο σας.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {(manage ? members : me ? [me] : []).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {m.user.name}
                    {m.userId === user.id && <span className="ml-1 text-xs text-muted-foreground">(εσείς)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.user.email}
                    {!m.user.active && " · ανενεργός"}
                  </span>
                </span>
                <WeeklyToggle tenantId={tenantId} userId={m.userId} on={m.weeklyReport} label={`Εβδομαδιαία αναφορά για ${m.user.name}`} />
              </li>
            ))}
          </ul>
        )}
        {manage && <p className="text-xs text-muted-foreground">Ως διαχειριστής της εταιρείας ορίζετε ποιοι χρήστες τη λαμβάνουν.</p>}
      </section>
    </>
  );
}
