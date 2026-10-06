"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { sendWelcomeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { can, requireUser, type CurrentUser } from "@/lib/rbac";

// The users of one tenant (the people who see its dashboards), managed from the tenant's page.
// A person may belong to several tenants: their name / email / password / active flag are shared,
// so changing those — or deleting the account — needs rights over every tenant they belong to.

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Δώστε ονοματεπώνυμο").max(120),
  email: z.email("Μη έγκυρο email").transform((e) => e.toLowerCase().trim()),
  password: z.string().max(200),
  role: z.enum(["TENANT_ADMIN", "TENANT_USER"]),
  active: z.boolean(),
});
type Field = keyof z.input<typeof schema>;
export type TenantUserState = { ok?: boolean; message?: string; errors?: Partial<Record<Field, string>> };
type Result = { ok: boolean; message: string };

const refresh = (tenantId: string) => {
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/settings/users");
};

async function manager(tenantId: string): Promise<CurrentUser> {
  const actor = await requireUser();
  if (!can(actor, "tenant.users.manage", tenantId)) throw new Error("Δεν έχετε δικαίωμα για τους χρήστες αυτού του πελάτη.");
  return actor;
}

/** May the actor change the account itself (shared across its tenants)? Platform staff accounts: never here. */
async function canManageAccount(actor: CurrentUser, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true, memberships: { select: { tenantId: true } } } });
  if (!target || target.platformRole !== "USER") return false;
  return can(actor, "tenants.manage") || target.memberships.every((m) => can(actor, "tenant.users.manage", m.tenantId));
}

export async function saveTenantUser(tenantId: string, _prev: TenantUserState, formData: FormData): Promise<TenantUserState> {
  let actor: CurrentUser;
  try {
    actor = await manager(tenantId);
  } catch (err) {
    return { message: (err as Error).message };
  }
  const parsed = schema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") ?? "",
    role: formData.get("role") || "TENANT_USER",
    active: formData.get("active") === "on",
  });
  const welcome = formData.get("sendWelcome") === "on";
  if (!parsed.success) {
    const errors: TenantUserState["errors"] = {};
    for (const i of parsed.error.issues) errors[i.path[0] as Field] ??= i.message;
    return { errors };
  }
  const input = parsed.data;
  if (input.password && input.password.length < 10) return { errors: { password: "Τουλάχιστον 10 χαρακτήρες" } };

  // ── New user — or an existing account (same email) added to this tenant.
  if (!input.id) {
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, name: true, platformRole: true } });
    if (existing) {
      if (existing.platformRole !== "USER") {
        return { errors: { email: "Είναι λογαριασμός της DGsoft — βλέπει ήδη όλους τους πελάτες." } };
      }
      await prisma.membership.upsert({
        where: { userId_tenantId: { userId: existing.id, tenantId } },
        update: { role: input.role },
        create: { userId: existing.id, tenantId, role: input.role },
      });
      await audit({ actorId: actor.id, action: "membership.set", entity: "User", entityId: existing.id, tenantId, meta: { role: input.role } });
      refresh(tenantId);
      return {
        ok: true,
        message: `Ο λογαριασμός ${input.email} υπήρχε ήδη (${existing.name}) και προστέθηκε στον πελάτη· ο κωδικός του δεν άλλαξε.`,
      };
    }
    if (!input.password && !welcome) return { errors: { password: "Δώστε αρχικό κωδικό ή στείλτε email πρόσβασης" } };
    // With the welcome email the user sets the password himself; the account gets an unknown one.
    const password = input.password || randomBytes(24).toString("base64url");
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        emailVerified: true,
        platformRole: "USER",
        active: input.active,
        accounts: { create: { providerId: "credential", accountId: input.email, password: await hashPassword(password) } },
        memberships: { create: { tenantId, role: input.role } },
      },
    });
    // Better Auth expects accountId = user id for credential accounts.
    await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { accountId: user.id } });
    await audit({ actorId: actor.id, action: "user.create", entity: "User", entityId: user.id, tenantId, meta: { email: input.email, role: input.role } });
    refresh(tenantId);
    if (welcome) {
      const r = await sendWelcomeEmail(user.id, tenantId);
      return r.ok
        ? { ok: true, message: `Ο χρήστης δημιουργήθηκε και του στάλθηκε email για να ορίσει κωδικό (${input.email}).` }
        : { ok: true, message: `Ο χρήστης δημιουργήθηκε, αλλά το email δεν στάλθηκε: ${r.error}` };
    }
    return { ok: true, message: "Ο χρήστης δημιουργήθηκε· συνδέεται με το email και τον κωδικό που ορίσατε." };
  }

  // ── Edit: the role in this tenant always; the shared account fields only with rights over all of its tenants.
  const target = await prisma.user.findUnique({ where: { id: input.id }, select: { id: true, email: true, name: true, active: true } });
  const membership = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: input.id, tenantId } } });
  if (!target || !membership) return { message: "Ο χρήστης δεν ανήκει σε αυτόν τον πελάτη." };
  if (target.id === actor.id) return { message: "Τον δικό σας λογαριασμό τον αλλάζετε από το προφίλ σας." };

  const accountChanged = input.name !== target.name || input.email !== target.email || input.active !== target.active || !!input.password;
  if (accountChanged && !(await canManageAccount(actor, target.id))) {
    return { message: "Ο χρήστης ανήκει και σε άλλους πελάτες — μόνο ο ρόλος του εδώ μπορεί να αλλάξει από αυτή τη σελίδα." };
  }
  if (input.email !== target.email && (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }))) {
    return { errors: { email: "Υπάρχει ήδη χρήστης με αυτό το email" } };
  }

  await prisma.$transaction([
    prisma.membership.update({ where: { id: membership.id }, data: { role: input.role } }),
    ...(accountChanged
      ? [prisma.user.update({ where: { id: target.id }, data: { name: input.name, email: input.email, active: input.active } })]
      : []),
  ]);
  if (input.password) {
    await prisma.account.updateMany({ where: { userId: target.id, providerId: "credential" }, data: { password: await hashPassword(input.password) } });
  }
  // Deactivation or a new password ends the open sessions.
  if (!input.active || input.password) await prisma.session.deleteMany({ where: { userId: target.id } });
  await audit({
    actorId: actor.id,
    action: "user.update",
    entity: "User",
    entityId: target.id,
    tenantId,
    meta: { role: input.role, active: input.active, emailChanged: input.email !== target.email, passwordChanged: !!input.password },
  });
  refresh(tenantId);
  return { ok: true, message: "Οι αλλαγές αποθηκεύτηκαν." };
}

/** Takes the user's access to this tenant away; the account stays (it may belong to other tenants). */
export async function removeTenantUser(tenantId: string, userId: string): Promise<Result> {
  try {
    const actor = await manager(tenantId);
    if (userId === actor.id) return { ok: false, message: "Δεν μπορείτε να αφαιρέσετε τον εαυτό σας." };
    await prisma.membership.deleteMany({ where: { userId, tenantId } });
    await prisma.kimonChat.deleteMany({ where: { userId, tenantId } });
    await audit({ actorId: actor.id, action: "membership.remove", entity: "User", entityId: userId, tenantId });
    refresh(tenantId);
    return { ok: true, message: "Ο χρήστης δεν έχει πλέον πρόσβαση σε αυτόν τον πελάτη." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Deletes the account for good — only a customer account that belongs to no other tenant the actor can't manage. */
export async function deleteTenantUser(tenantId: string, userId: string): Promise<Result> {
  try {
    const actor = await manager(tenantId);
    if (userId === actor.id) return { ok: false, message: "Δεν μπορείτε να διαγράψετε τον εαυτό σας." };
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, memberships: { select: { tenantId: true } } } });
    if (!target || !target.memberships.some((m) => m.tenantId === tenantId)) return { ok: false, message: "Ο χρήστης δεν ανήκει σε αυτόν τον πελάτη." };
    if (!(await canManageAccount(actor, userId))) {
      return { ok: false, message: "Ο χρήστης ανήκει και σε άλλους πελάτες — αφαιρέστε τον μόνο από αυτόν." };
    }
    await prisma.user.delete({ where: { id: userId } });
    await audit({ actorId: actor.id, action: "user.delete", entity: "User", entityId: userId, tenantId, meta: { email: target.email } });
    refresh(tenantId);
    return { ok: true, message: "Ο λογαριασμός διαγράφηκε οριστικά." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** (Re)sends the access email: a link to set a new password, valid 7 days. */
export async function sendAccessEmail(tenantId: string, userId: string): Promise<Result> {
  try {
    const actor = await manager(tenantId);
    if (!(await prisma.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } } }))) {
      return { ok: false, message: "Ο χρήστης δεν ανήκει σε αυτόν τον πελάτη." };
    }
    const r = await sendWelcomeEmail(userId, tenantId);
    await audit({ actorId: actor.id, action: "user.access_email", entity: "User", entityId: userId, tenantId, meta: { ok: r.ok } });
    return r.ok ? { ok: true, message: "Στάλθηκε email με σύνδεσμο για κωδικό." } : { ok: false, message: r.error ?? "Το email δεν στάλθηκε." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
