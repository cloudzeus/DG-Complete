import { redirect } from "next/navigation";
import { dashboardTenants } from "@/lib/dashboards";
import { requireUser } from "@/lib/rbac";

// Entry point: the first tenant the user can view (demo first for platform staff).
export default async function DashboardsHome() {
  const user = await requireUser();
  const tenants = await dashboardTenants(user);
  if (!tenants.length) redirect("/portal");
  redirect(`/dashboards/${tenants[0].id}/pnl`);
}
