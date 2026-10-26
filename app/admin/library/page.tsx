import { redirect } from "next/navigation";
import { libraryTenant } from "@/lib/library";
import { requireUser } from "@/lib/rbac";
import { forbidden } from "next/navigation";

// Platform library (docs/27): a tenant of the platform where the super admin builds shareable
// systems and flows with the same tools as the customers.
export default async function LibraryPage() {
  const user = await requireUser();
  if (user.platformRole !== "SUPER_ADMIN") forbidden();
  const lib = await libraryTenant();
  redirect(`/t/${lib.id}/targets`);
}
