// Development data: a plan with every service and a demo tenant. Safe to run repeatedly.
// Usage: npm run seed:dev (after db:migrate and seed:admin)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SERVICE_KEYS } from "../lib/services";

if (process.env.NODE_ENV === "production") {
  console.error("seed:dev is for development databases only.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const plan =
    (await prisma.plan.findFirst({ where: { name: "Dev — όλες οι υπηρεσίες" } })) ??
    (await prisma.plan.create({
      data: { name: "Dev — όλες οι υπηρεσίες", description: "Πακέτο ανάπτυξης", services: SERVICE_KEYS, period: "YEARLY", price: 0 },
    }));
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Demo Α.Ε." } })) ??
    (await prisma.tenant.create({ data: { name: "Demo Α.Ε.", afm: "999999999", status: "ACTIVE", isDemo: true, planId: plan.id } }));
  console.log(`Plan ${plan.id} · tenant ${tenant.id} (${tenant.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
