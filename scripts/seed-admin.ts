// Creates (or promotes) the first SUPER_ADMIN.
// Usage: SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… SEED_ADMIN_NAME="…" npm run seed:admin
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../lib/generated/prisma/client";

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";

if (!email || !password || password.length < 10) {
  console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 10 chars).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const hash = await hashPassword(password!);
  const user = await prisma.user.upsert({
    where: { email: email! },
    update: { platformRole: "SUPER_ADMIN", active: true },
    create: { email: email!, name, emailVerified: true, platformRole: "SUPER_ADMIN" },
  });
  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: hash } });
  } else {
    await prisma.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
    });
  }
  console.log(`SUPER_ADMIN ready: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
