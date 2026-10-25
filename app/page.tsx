import { redirect } from "next/navigation";
import { getCurrentUser, isPlatformStaff } from "@/lib/rbac";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isPlatformStaff(user)) redirect("/admin");
  // Tenant users land in their (first) organisation; several → the portal to choose.
  redirect(user.memberships.length === 1 ? `/t/${user.memberships[0].tenantId}` : "/portal");
}
