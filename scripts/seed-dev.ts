// Development data (docs/03 §7): plans, run packs, Demo tenant with a user per tenant role, the
// sandbox target, a published workflow, a collection + method and an API key. Idempotent.
// Usage: npm run seed:dev (after db:migrate and seed:admin). Never on production.
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { grantMonthly } from "@/lib/billing";
import { encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { SERVICE_KEYS } from "@/lib/services";
import { tenantDb, withTenantTx } from "@/lib/tenant-db";

if (process.env.NODE_ENV === "production") {
  console.error("seed:dev is for development databases only.");
  process.exit(1);
}

const DEV_PASSWORD = "DevPass12345";

const PLANS = [
  { name: "Starter", price: 290, runsMonthly: 500, maxConcurrentRuns: 2, maxWorkflows: 5, artifactRetentionDays: 30, overageEnabled: false, services: ["workflows", "recorder", "api"] },
  { name: "Business", price: 1490, runsMonthly: 5000, maxConcurrentRuns: 5, maxWorkflows: 25, artifactRetentionDays: 60, overageEnabled: true, services: ["workflows", "recorder", "api", "bulk", "webhooks", "ai"] },
  { name: "Enterprise", price: 4900, runsMonthly: 25000, maxConcurrentRuns: 15, maxWorkflows: 9999, artifactRetentionDays: 180, overageEnabled: true, services: SERVICE_KEYS },
];
const PACKS = [
  { name: "1.000 εκτελέσεις", runs: 1000, priceEur: 40 },
  { name: "5.000 εκτελέσεις", runs: 5000, priceEur: 160 },
  { name: "20.000 εκτελέσεις", runs: 20000, priceEur: 560 },
];
const USERS = [
  { email: "admin@demo.local", name: "Μαρία Παππά", role: "TENANT_ADMIN" },
  { email: "designer@demo.local", name: "Νίκος Γεωργίου", role: "TENANT_DESIGNER" },
  { email: "operator@demo.local", name: "Ελένη Κωνσταντίνου", role: "TENANT_OPERATOR" },
  { email: "viewer@demo.local", name: "Γιώργος Αλεξίου", role: "TENANT_USER" },
] as const;

const DEFINITION = {
  dslVersion: 1,
  steps: [
    { id: "s1", type: "goto", label: "Πλοήγηση στη φόρμα", url: "/entries/new" },
    { id: "s2", type: "fill", label: "ΑΦΜ", locator: { strategy: "label", value: "ΑΦΜ" }, value: "{{input.afm}}" },
    { id: "s3", type: "fill", label: "Επωνυμία", locator: { strategy: "label", value: "Επωνυμία" }, value: "{{input.name}}" },
    { id: "s4", type: "fill", label: "Ποσό", locator: { strategy: "label", value: "Ποσό" }, value: "{{input.amount}}", optional: true },
    { id: "s5", type: "click", label: "Αποθήκευση", locator: { strategy: "role", role: "button", name: "Αποθήκευση" } },
    { id: "s6", type: "extract", label: "Αριθμός καταχώρισης", locator: { strategy: "testid", value: "entry-id" }, output: "entryId" },
  ],
};
const LOGIN_DEFINITION = {
  dslVersion: 1,
  login: { mode: "none", sessionCheck: { candidates: [{ kind: "testId", value: "user-menu" }] } },
  steps: [
    { id: "l1", type: "navigate", label: "Σελίδα σύνδεσης", url: "/login" },
    { id: "l2", type: "fill", label: "Χρήστης", locator: { candidates: [{ kind: "label", value: "Όνομα χρήστη" }] }, value: "{{secrets.username}}" },
    { id: "l3", type: "fill", label: "Κωδικός", locator: { candidates: [{ kind: "label", value: "Κωδικός" }] }, value: "{{secrets.password}}" },
    { id: "l4", type: "click", label: "Είσοδος", locator: { candidates: [{ kind: "role", role: "button", name: "Είσοδος" }] } },
  ],
};

const INPUT_SCHEMA = {
  type: "object",
  required: ["afm", "name"],
  properties: { afm: { type: "string", title: "ΑΦΜ", pattern: "^\\d{9}$" }, name: { type: "string", title: "Επωνυμία" }, amount: { type: "number", title: "Ποσό" } },
};

async function upsertUser(email: string, name: string) {
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name, emailVerified: true } });
  if (!(await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } }))) {
    await prisma.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword(DEV_PASSWORD) } });
  }
  return user;
}

async function main() {
  for (const [i, p] of PLANS.entries()) {
    const data = { ...p, description: `Πακέτο ${p.name}`, period: "YEARLY" as const, sortOrder: i, logRetentionDays: p.artifactRetentionDays * 3 };
    const existing = await prisma.plan.findFirst({ where: { name: p.name } });
    if (existing) await prisma.plan.update({ where: { id: existing.id }, data });
    else await prisma.plan.create({ data });
  }
  for (const [i, p] of PACKS.entries()) {
    if (!(await prisma.runCreditPack.findFirst({ where: { name: p.name } }))) await prisma.runCreditPack.create({ data: { ...p, sortOrder: i } });
  }
  const business = await prisma.plan.findFirstOrThrow({ where: { name: "Business" } });
  const tenant =
    (await prisma.tenant.findFirst({ where: { name: "Demo Α.Ε." } })) ??
    (await prisma.tenant.create({ data: { name: "Demo Α.Ε.", afm: "999999999", status: "ACTIVE", isDemo: true } }));
  await prisma.tenant.update({ where: { id: tenant.id }, data: { planId: business.id, settings: { timezone: "Europe/Athens" } } });
  await grantMonthly(tenant.id, business.runsMonthly);

  for (const u of USERS) {
    const user = await upsertUser(u.email, u.name);
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { role: u.role },
      create: { userId: user.id, tenantId: tenant.id, role: u.role },
    });
  }
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: USERS[0].email } });
  const db = tenantDb(tenant.id);

  const target =
    (await db.targetSystem.findFirst({ where: { slug: "sandbox-erp" } })) ??
    (await db.targetSystem.create({
      data: {
        name: "Sandbox ERP",
        slug: "sandbox-erp",
        baseUrl: "http://localhost:4100",
        allowedOrigins: ["localhost:4100"],
        maxConcurrency: 4,
        errorDetectors: [{ name: "Σφάλμα καταχώρισης", css: "[data-testid=entry-error]", kind: "error" }],
      } as never,
    }));

  await withTenantTx(tenant.id, async (tx) => {
    if (await tx.credential.findFirst({ where: { targetSystemId: target.id } })) return;
    const c = await tx.credential.create({ data: { tenantId: tenant.id, targetSystemId: target.id, label: "Demo χρήστης", kind: "USERNAME_PASSWORD", payloadEnc: "pending" } as never });
    await tx.credential.update({ where: { id: c.id }, data: { payloadEnc: encryptJson({ username: "demo", password: "demo1234" }, `${tenant.id}:${c.id}`) } });
  });

  // Login flow of the sandbox (docs/06 §6): the engine runs it when there is no valid session.
  const login =
    (await db.workflow.findFirst({ where: { slug: "sandbox-login" } })) ??
    (await db.workflow.create({ data: { name: "Σύνδεση Sandbox", slug: "sandbox-login", isLoginFlow: true, targetSystemId: target.id, tags: ["demo"], createdById: owner.id } as never }));
  if (!(await db.workflowVersion.findFirst({ where: { workflowId: login.id } }))) {
    const v = await db.workflowVersion.create({
      data: { workflowId: login.id, versionNo: 1, status: "PUBLISHED", definition: LOGIN_DEFINITION, inputSchema: { type: "object", properties: {} }, outputSchema: { type: "object", properties: {} }, changelog: "Αρχική έκδοση", createdById: owner.id, approvedById: owner.id, approvedAt: new Date(), publishedAt: new Date() } as never,
    });
    await db.workflow.updateMany({ where: { id: login.id }, data: { latestVersionNo: 1, publishedVersionId: v.id } });
  }
  await db.targetSystem.updateMany({ where: { id: target.id, loginWorkflowId: null }, data: { loginWorkflowId: login.id } });

  const workflow =
    (await db.workflow.findFirst({ where: { slug: "create-customer" } })) ??
    (await db.workflow.create({ data: { name: "Καταχώριση πελάτη", slug: "create-customer", targetSystemId: target.id, tags: ["demo"], createdById: owner.id } as never }));
  const version =
    (await db.workflowVersion.findFirst({ where: { workflowId: workflow.id, versionNo: 1 } })) ??
    (await db.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        versionNo: 1,
        status: "PUBLISHED",
        definition: DEFINITION,
        inputSchema: INPUT_SCHEMA,
        outputSchema: { type: "object", properties: { entryId: { type: "string" } } },
        checksum: createHash("sha256").update(JSON.stringify(DEFINITION)).digest("hex"),
        changelog: "Αρχική έκδοση",
        createdById: owner.id,
        approvedById: owner.id,
        approvedAt: new Date(),
        publishedAt: new Date(),
      } as never,
    }));

  const collection =
    (await db.methodCollection.findFirst({ where: { slug: "erp" } })) ??
    (await db.methodCollection.create({ data: { name: "ERP", slug: "erp", description: "Καταχωρίσεις στο Sandbox ERP" } as never }));
  if (!(await db.method.findFirst({ where: { collectionId: collection.id, slug: "create-customer" } }))) {
    await db.method.create({ data: { collectionId: collection.id, workflowVersionId: version.id, name: "Καταχώριση πελάτη", slug: "create-customer" } as never });
  }

  let printedKey: string | null = null;
  if (!(await db.apiKey.findFirst({ where: { name: "Dev key" } }))) {
    const key = `dgc_${randomBytes(32).toString("base64url")}`;
    await db.apiKey.create({
      data: { name: "Dev key", prefix: key.slice(0, 8), hash: createHash("sha256").update(key).digest("hex"), scopes: ["runs:write", "runs:read", "jobs:write", "jobs:read", "artifacts:read", "collections:read", "usage:read"], createdById: owner.id } as never,
    });
    printedKey = key;
  }

  console.log(`Tenant ${tenant.id} (${tenant.name}) · plan Business · users: ${USERS.map((u) => u.email).join(", ")} / ${DEV_PASSWORD}`);
  if (printedKey) console.log(`API key (shown once): ${printedKey}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
