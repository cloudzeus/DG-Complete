import { redirect } from "next/navigation";
import { getCurrentUser, isPlatformStaff } from "@/lib/rbac";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(isPlatformStaff(user) ? "/admin" : "/dashboards");
}
