import "server-only";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";

// First SUPER_ADMIN on an empty production database (docs/10 §3). The image has no tsx / scripts,
// so the web creates it at start from SEED_ADMIN_*. Runs only while no SUPER_ADMIN exists —
// it never resets the password of an existing account. `npm run seed:admin` remains for dev.
export async function bootstrapAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 10) {
    console.warn("[bootstrap] SEED_ADMIN_PASSWORD: τουλάχιστον 10 χαρακτήρες — παραλείπεται");
    return;
  }
  if (await prisma.user.count({ where: { platformRole: "SUPER_ADMIN" } })) return;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";
  const user = await prisma.user.upsert({
    where: { email },
    update: { platformRole: "SUPER_ADMIN", active: true },
    create: { email, name, emailVerified: true, platformRole: "SUPER_ADMIN" },
  });
  const hash = await hashPassword(password);
  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (account) await prisma.account.update({ where: { id: account.id }, data: { password: hash } });
  else await prisma.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash } });
  console.log(`[bootstrap] SUPER_ADMIN created: ${user.email}`);
}
