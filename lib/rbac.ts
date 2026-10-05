import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PlatformRole, TenantRole } from "@/lib/generated/prisma/enums";

// ───────────── Permissions ─────────────
// Platform roles act on every tenant; tenant roles only inside their own tenant.
// The matrix is editable (Ρυθμίσεις → Πρόσβαση) and stored in role_permission; these are the defaults.

export const ROLES = ["SUPER_ADMIN", "ADMIN", "TENANT_ADMIN", "TENANT_USER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSION_DEFS = {
  "platform.admins.manage": { label: "Διαχείριση διαχειριστών & ρόλων πλατφόρμας", group: "Πλατφόρμα" },
  "platform.plans.manage": { label: "Πακέτα & τιμές", group: "Πλατφόρμα" },
  "platform.settings.manage": { label: "Ρυθμίσεις, διασυνδέσεις & συγχρονισμοί", group: "Πλατφόρμα" },
  "tenants.read": { label: "Προβολή tenants, χρηστών, πληρωμών", group: "Tenants" },
  "tenants.manage": { label: "Δημιουργία & διαχείριση tenants", group: "Tenants" },
  "connections.warehouse.manage": { label: "Βάσεις Cube", group: "Δεδομένα" },
  "connections.tenant.manage": { label: "Πηγές δεδομένων πελατών", group: "Δεδομένα" },
  "tenant.users.manage": { label: "Χρήστες του tenant", group: "Εντός tenant" },
  "tenant.billing.manage": { label: "Πληρωμές & συνδρομή", group: "Εντός tenant" },
  "tenant.apikeys.manage": { label: "API keys (webservices)", group: "Εντός tenant" },
  "tenant.dashboards.edit": { label: "Επεξεργασία dashboards", group: "Εντός tenant" },
  "tenant.dashboards.view": { label: "Προβολή dashboards", group: "Εντός tenant" },
} as const;

export type Permission = keyof typeof PERMISSION_DEFS;
export const ALL_PERMISSIONS = Object.keys(PERMISSION_DEFS) as Permission[];

export const DEFAULT_GRANTS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: [
    "tenants.read",
    "tenants.manage",
    "connections.tenant.manage",
    "tenant.users.manage",
    "tenant.billing.manage",
    "tenant.apikeys.manage",
    "tenant.dashboards.edit",
    "tenant.dashboards.view",
  ],
  TENANT_ADMIN: ["tenant.users.manage", "tenant.billing.manage", "tenant.apikeys.manage", "tenant.dashboards.edit", "tenant.dashboards.view"],
  TENANT_USER: ["tenant.dashboards.view"],
};

export type Grants = Record<Role, Permission[]>;

/** Effective role → permissions (DB, or defaults when never edited). SUPER_ADMIN always has everything. */
export const getGrants = cache(async (): Promise<Grants> => {
  const rows = await prisma.rolePermission.findMany();
  const grants = Object.fromEntries(ROLES.map((r) => [r, [] as Permission[]])) as Grants;
  if (rows.length === 0) {
    for (const r of ROLES) grants[r] = [...DEFAULT_GRANTS[r]];
  } else {
    for (const row of rows) {
      if ((ROLES as readonly string[]).includes(row.role) && row.permission in PERMISSION_DEFS) {
        grants[row.role as Role].push(row.permission as Permission);
      }
    }
  }
  grants.SUPER_ADMIN = [...ALL_PERMISSIONS];
  return grants;
});

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  memberships: { tenantId: string; tenantName: string; role: TenantRole }[];
  grants: Grants;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      platformRole: true,
      active: true,
      memberships: { select: { tenantId: true, role: true, tenant: { select: { name: true } } } },
    },
  });
  if (!user || !user.active) return null;
  const grants = await getGrants();
  return {
    grants,
    id: user.id,
    name: user.name,
    email: user.email,
    platformRole: user.platformRole,
    memberships: user.memberships.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      role: m.role,
    })),
  };
});

export function isPlatformStaff(user: CurrentUser) {
  return user.platformRole === "SUPER_ADMIN" || user.platformRole === "ADMIN";
}

/** Does `user` hold `permission`, optionally inside `tenantId`? */
export function can(user: CurrentUser, permission: Permission, tenantId?: string): boolean {
  if (user.platformRole !== "USER" && user.grants[user.platformRole].includes(permission)) return true;
  if (!tenantId) return false;
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  return !!membership && user.grants[membership.role].includes(permission);
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission, tenantId?: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission, tenantId)) forbidden();
  return user;
}
