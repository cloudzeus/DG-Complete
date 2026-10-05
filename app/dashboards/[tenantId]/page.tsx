import { redirect } from "next/navigation";

export default async function TenantDashboards({ params }: PageProps<"/dashboards/[tenantId]">) {
  const { tenantId } = await params;
  redirect(`/dashboards/${tenantId}/pnl`);
}
