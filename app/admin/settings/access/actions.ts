"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ALL_PERMISSIONS, DEFAULT_GRANTS, ROLES, requirePermission, type Permission, type Role } from "@/lib/rbac";

const EDITABLE: Role[] = ["ADMIN", "TENANT_ADMIN", "TENANT_USER"];

/** Replaces the whole matrix. SUPER_ADMIN rows are always written (all permissions) so it can never lock itself out. */
export async function saveGrants(matrix: Record<string, string[]>): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("platform.admins.manage");
  const rows: { role: string; permission: string }[] = ALL_PERMISSIONS.map((p) => ({ role: "SUPER_ADMIN", permission: p }));
  for (const role of EDITABLE) {
    for (const p of matrix[role] ?? []) {
      if ((ALL_PERMISSIONS as string[]).includes(p)) rows.push({ role, permission: p });
    }
  }
  await prisma.$transaction([prisma.rolePermission.deleteMany(), prisma.rolePermission.createMany({ data: rows })]);
  await audit({ actorId: user.id, action: "rbac.update", entity: "RolePermission", meta: matrix });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Τα δικαιώματα αποθηκεύτηκαν." };
}

export async function resetGrants(): Promise<{ ok: boolean; message: string; grants: Record<Role, Permission[]> }> {
  const user = await requirePermission("platform.admins.manage");
  await prisma.rolePermission.deleteMany();
  await audit({ actorId: user.id, action: "rbac.reset", entity: "RolePermission" });
  revalidatePath("/admin", "layout");
  const grants = Object.fromEntries(ROLES.map((r) => [r, [...DEFAULT_GRANTS[r]]])) as Record<Role, Permission[]>;
  return { ok: true, message: "Έγινε επαναφορά στις προεπιλογές.", grants };
}
