"use server";

import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { can, requireUser, type CurrentUser } from "@/lib/rbac";

const ROLES = ["SUPER_ADMIN", "ADMIN", "USER"] as const;
const TENANT_ROLES = ["TENANT_ADMIN", "TENANT_USER"] as const;

const baseSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Δώστε ονοματεπώνυμο").max(120),
  email: z.email("Μη έγκυρο email").transform((e) => e.toLowerCase()),
  password: z.string().max(200),
  platformRole: z.enum(ROLES),
  active: z.boolean(),
  tenantId: z.string().optional(),
  tenantRole: z.enum(TENANT_ROLES).optional(),
});

type Field = keyof z.input<typeof baseSchema>;
export type UserFormState = { ok?: boolean; message?: string; errors?: Partial<Record<Field, string>> };

const fail = (errors: UserFormState["errors"]): UserFormState => ({ errors });

/** Platform roles are granted by super admins only; admins manage tenant users. */
function canAssignRole(actor: CurrentUser, role: (typeof ROLES)[number]) {
  return role === "USER" ? can(actor, "tenants.manage") : can(actor, "platform.admins.manage");
}

async function wouldRemoveLastSuperAdmin(userId: string, nextRole: string, nextActive: boolean) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true, active: true } });
  if (target?.platformRole !== "SUPER_ADMIN" || (nextRole === "SUPER_ADMIN" && nextActive)) return false;
  const others = await prisma.user.count({ where: { platformRole: "SUPER_ADMIN", active: true, id: { not: userId } } });
  return others === 0;
}

function refresh() {
  revalidatePath("/admin/settings/users");
  revalidatePath("/admin/tenants", "layout");
}

export async function saveUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const actor = await requireUser();
  const parsed = baseSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") ?? "",
    platformRole: formData.get("platformRole") || "USER",
    active: formData.get("active") === "on",
    tenantId: formData.get("tenantId") || undefined,
    tenantRole: formData.get("tenantRole") || undefined,
  });
  if (!parsed.success) {
    const errors: UserFormState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as Field] ??= i.message;
    return fail(errors);
  }
  const input = parsed.data;
  if (input.password && input.password.length < 10) return fail({ password: "Τουλάχιστον 10 χαρακτήρες" });
  if (!canAssignRole(actor, input.platformRole)) return { message: "Δεν έχετε δικαίωμα να ορίσετε αυτόν τον ρόλο." };
  if (input.tenantId && !can(actor, "tenant.users.manage", input.tenantId)) {
    return { message: "Δεν έχετε δικαίωμα για αυτόν τον tenant." };
  }

  if (!input.id) {
    if (!input.password) return fail({ password: "Δώστε αρχικό κωδικό" });
    if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      return fail({ email: "Υπάρχει ήδη χρήστης με αυτό το email" });
    }
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        emailVerified: true,
        platformRole: input.platformRole,
        active: input.active,
        accounts: { create: { providerId: "credential", accountId: input.email, password: await hashPassword(input.password) } },
        ...(input.tenantId
          ? { memberships: { create: { tenantId: input.tenantId, role: input.tenantRole ?? "TENANT_USER" } } }
          : {}),
      },
    });
    // Better Auth expects accountId = user id for credential accounts.
    await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { accountId: user.id } });
    await audit({
      actorId: actor.id,
      action: "user.create",
      entity: "User",
      entityId: user.id,
      tenantId: input.tenantId ?? null,
      meta: { email: input.email, platformRole: input.platformRole },
    });
    refresh();
    return { ok: true, message: "Ο χρήστης δημιουργήθηκε." };
  }

  const existing = await prisma.user.findUnique({ where: { id: input.id } });
  if (!existing) return { message: "Ο χρήστης δεν βρέθηκε." };
  if (!canAssignRole(actor, existing.platformRole)) return { message: "Δεν έχετε δικαίωμα να επεξεργαστείτε αυτόν τον χρήστη." };
  if (existing.id === actor.id && (!input.active || input.platformRole !== existing.platformRole)) {
    return { message: "Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο ή να απενεργοποιήσετε τον εαυτό σας." };
  }
  if (await wouldRemoveLastSuperAdmin(existing.id, input.platformRole, input.active)) {
    return { message: "Πρέπει να υπάρχει τουλάχιστον ένας ενεργός super admin." };
  }
  if (input.email !== existing.email && (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }))) {
    return fail({ email: "Υπάρχει ήδη χρήστης με αυτό το email" });
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: { name: input.name, email: input.email, platformRole: input.platformRole, active: input.active },
  });
  if (input.password) {
    await prisma.account.updateMany({
      where: { userId: existing.id, providerId: "credential" },
      data: { password: await hashPassword(input.password) },
    });
  }
  // Deactivation or password change ends the user's open sessions.
  if (!input.active || input.password) await prisma.session.deleteMany({ where: { userId: existing.id } });
  await audit({
    actorId: actor.id,
    action: "user.update",
    entity: "User",
    entityId: existing.id,
    meta: { platformRole: input.platformRole, active: input.active, passwordChanged: !!input.password },
  });
  refresh();
  return { ok: true, message: "Οι αλλαγές αποθηκεύτηκαν." };
}

export async function setUserActive(userId: string, active: boolean): Promise<{ ok: boolean; message: string }> {
  const actor = await requireUser();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, message: "Ο χρήστης δεν βρέθηκε." };
  if (!canAssignRole(actor, target.platformRole)) return { ok: false, message: "Δεν έχετε δικαίωμα." };
  if (target.id === actor.id) return { ok: false, message: "Δεν μπορείτε να απενεργοποιήσετε τον εαυτό σας." };
  if (await wouldRemoveLastSuperAdmin(target.id, target.platformRole, active)) {
    return { ok: false, message: "Πρέπει να υπάρχει τουλάχιστον ένας ενεργός super admin." };
  }
  await prisma.user.update({ where: { id: userId }, data: { active } });
  if (!active) await prisma.session.deleteMany({ where: { userId } });
  await audit({ actorId: actor.id, action: active ? "user.activate" : "user.deactivate", entity: "User", entityId: userId });
  refresh();
  return { ok: true, message: active ? "Ο χρήστης ενεργοποιήθηκε." : "Ο χρήστης απενεργοποιήθηκε." };
}

export async function addMembership(userId: string, tenantId: string, role: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireUser();
  if (!can(actor, "tenant.users.manage", tenantId)) return { ok: false, message: "Δεν έχετε δικαίωμα για αυτόν τον tenant." };
  const parsedRole = z.enum(TENANT_ROLES).safeParse(role);
  if (!parsedRole.success) return { ok: false, message: "Μη έγκυρος ρόλος." };
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: { role: parsedRole.data },
    create: { userId, tenantId, role: parsedRole.data },
  });
  await audit({ actorId: actor.id, action: "membership.set", entity: "User", entityId: userId, tenantId, meta: { role } });
  refresh();
  return { ok: true, message: "Η πρόσβαση ενημερώθηκε." };
}

export async function removeMembership(userId: string, tenantId: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireUser();
  if (!can(actor, "tenant.users.manage", tenantId)) return { ok: false, message: "Δεν έχετε δικαίωμα για αυτόν τον tenant." };
  await prisma.membership.deleteMany({ where: { userId, tenantId } });
  await audit({ actorId: actor.id, action: "membership.remove", entity: "User", entityId: userId, tenantId });
  refresh();
  return { ok: true, message: "Η πρόσβαση αφαιρέθηκε." };
}
