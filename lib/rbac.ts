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

export const ROLES = ["SUPER_ADMIN", "ADMIN", "TENANT_ADMIN", "TENANT_DESIGNER", "TENANT_OPERATOR", "TENANT_USER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSION_DEFS = {
  "platform.admins.manage": { label: "Διαχείριση διαχειριστών & ρόλων πλατφόρμας", group: "Πλατφόρμα" },
  "platform.plans.manage": { label: "Πακέτα & τιμές", group: "Πλατφόρμα" },
  "platform.settings.manage": { label: "Ρυθμίσεις, διασυνδέσεις & συγχρονισμοί", group: "Πλατφόρμα" },
  "tenants.read": { label: "Προβολή tenants, χρηστών, πληρωμών", group: "Tenants" },
  "tenants.manage": { label: "Δημιουργία & διαχείριση tenants", group: "Tenants" },
  "connections.tenant.manage": { label: "Πηγές δεδομένων πελατών", group: "Δεδομένα" },
  "tenant.dashboards.view": { label: "Πρόσβαση στην περιοχή πελάτη", group: "Εντός tenant" },
  // DG Complete (docs/02 §3)
  "tenant.users.manage": { label: "Μέλη & ρόλοι", group: "Εντός tenant" },
  "tenant.billing.manage": { label: "Πακέτο & αγορές εκτελέσεων", group: "Εντός tenant" },
  "tenant.apikeys.manage": { label: "Κλειδιά API", group: "Εντός tenant" },
  "tenant.webhooks.manage": { label: "Webhooks", group: "Εντός tenant" },
  "tenant.settings.manage": { label: "Ρυθμίσεις οργανισμού", group: "Εντός tenant" },
  "tenant.targets.manage": { label: "Συστήματα‑στόχοι", group: "Σχεδιασμός" },
  "tenant.credentials.manage": { label: "Διαπιστευτήρια", group: "Σχεδιασμός" },
  "tenant.credentials.reveal": { label: "Εμφάνιση διαπιστευτηρίων", group: "Σχεδιασμός" },
  "tenant.recordings.create": { label: "Καταγραφές", group: "Σχεδιασμός" },
  "tenant.workflows.edit": { label: "Επεξεργασία ροών", group: "Σχεδιασμός" },
  "tenant.workflows.submit": { label: "Υποβολή ροών για έγκριση", group: "Σχεδιασμός" },
  "tenant.workflows.approve": { label: "Έγκριση & δημοσίευση ροών", group: "Σχεδιασμός" },
  "tenant.methods.manage": { label: "Συλλογές & μέθοδοι", group: "Εκτέλεση" },
  "tenant.runs.execute": { label: "Εκτελέσεις (UI, Excel)", group: "Εκτέλεση" },
  "tenant.runs.retry": { label: "Επανάληψη / ακύρωση εκτελέσεων", group: "Εκτέλεση" },
  "tenant.runs.view": { label: "Προβολή εκτελέσεων", group: "Εκτέλεση" },
  "tenant.artifacts.view": { label: "Προβολή στιγμιοτύπων", group: "Εκτέλεση" },
  "tenant.audit.view": { label: "Αρχείο ενεργειών", group: "Εντός tenant" },
} as const;

export type Permission = keyof typeof PERMISSION_DEFS;
export const ALL_PERMISSIONS = Object.keys(PERMISSION_DEFS) as Permission[];

const VIEW: Permission[] = ["tenant.dashboards.view", "tenant.runs.view", "tenant.artifacts.view"];
const OPERATE: Permission[] = [...VIEW, "tenant.runs.execute", "tenant.runs.retry"];
const DESIGN: Permission[] = [
  ...OPERATE,
  "tenant.targets.manage",
  "tenant.credentials.manage",
  "tenant.recordings.create",
  "tenant.workflows.edit",
  "tenant.workflows.submit",
  "tenant.methods.manage",
];
const TENANT_ADMIN: Permission[] = [
  ...DESIGN,
  "tenant.users.manage",
  "tenant.billing.manage",
  "tenant.apikeys.manage",
  "tenant.webhooks.manage",
  "tenant.settings.manage",
  "tenant.credentials.reveal",
  "tenant.workflows.approve",
  "tenant.audit.view",
];

export const DEFAULT_GRANTS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ["tenants.read", "tenants.manage", "connections.tenant.manage", ...TENANT_ADMIN],
  TENANT_ADMIN,
  TENANT_DESIGNER: DESIGN,
  TENANT_OPERATOR: OPERATE,
  TENANT_USER: VIEW,
};

export type Grants = Record<Role, Permission[]>;

/** Effective role → permissions (DB, or defaults when never edited). SUPER_ADMIN always has everything. */
export const getGrants = cache(async (): Promise<Grants> => {
  const rows = await prisma.rolePermission.findMany();
  const grants = Object.fromEntries(ROLES.map((r) => [r, [] as Permission[]])) as Grants;
  for (const row of rows) {
    if ((ROLES as readonly string[]).includes(row.role) && row.permission in PERMISSION_DEFS) {
      grants[row.role as Role].push(row.permission as Permission);
    }
  }
  // A role never edited in the matrix (e.g. a role added later) keeps its defaults.
  const edited = new Set(rows.map((r) => r.role));
  for (const r of ROLES) if (!edited.has(r)) grants[r] = [...DEFAULT_GRANTS[r]];
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
