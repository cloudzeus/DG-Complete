import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantDb, withPlatformTx, withTenantTx } from "@/lib/tenant-db";

// docs/02 §1.1 — application scoping (tenantDb) and database RLS (withTenantTx), fail-closed.

let a: string;
let b: string;
let runA: string;

beforeAll(async () => {
  a = (await prisma.tenant.create({ data: { name: "Tenant A" } })).id;
  b = (await prisma.tenant.create({ data: { name: "Tenant B" } })).id;
  for (const t of [a, b]) {
    const target = await tenantDb(t).targetSystem.create({
      data: { name: `Sandbox ${t}`, slug: "sandbox", baseUrl: "http://localhost:4100", allowedOrigins: ["localhost:4100"] } as never,
    });
    const wf = await tenantDb(t).workflow.create({ data: { name: "WF", slug: "wf", targetSystemId: target.id, createdById: "seed" } as never });
    const v = await tenantDb(t).workflowVersion.create({
      data: { workflowId: wf.id, versionNo: 1, definition: {}, inputSchema: {}, outputSchema: {}, createdById: "seed" } as never,
    });
    const col = await tenantDb(t).methodCollection.create({ data: { name: "C", slug: `c-${t}` } as never });
    const method = await tenantDb(t).method.create({
      data: { collectionId: col.id, workflowVersionId: v.id, slug: "m", name: "M" } as never,
    });
    const run = await withTenantTx(t, (tx) =>
      tx.run.create({ data: { tenantId: t, methodId: method.id, workflowVersionId: v.id, inputEnc: "x", inputPreview: {}, trigger: "API" } as never }),
    );
    if (t === a) runA = run.id;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tenantDb (application level)", () => {
  it("only sees its own rows", async () => {
    const rows = await tenantDb(a).targetSystem.findMany();
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.tenantId === a)).toBe(true);
  });
  it("cannot read or update another tenant's row by id", async () => {
    const other = (await tenantDb(b).workflow.findFirstOrThrow()).id;
    expect(await tenantDb(a).workflow.findUnique({ where: { id: other } })).toBeNull();
    const r = await tenantDb(a).workflow.updateMany({ where: { id: other }, data: { name: "hacked" } });
    expect(r.count).toBe(0);
  });
});

describe("RLS (database level)", () => {
  it("returns 0 rows from run without app.tenant_id (fail-closed)", async () => {
    expect(await prisma.run.count()).toBe(0);
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM "run"`);
    await c.end();
    expect(rows[0].n).toBe(0);
  });
  it("withTenantTx sees only the tenant's runs", async () => {
    const runs = await withTenantTx(a, (tx) => tx.run.findMany());
    expect(runs.map((r) => r.id)).toEqual([runA]);
    expect(await withTenantTx(b, (tx) => tx.run.findUnique({ where: { id: runA } }))).toBeNull();
  });
  it("refuses to insert a row for another tenant", async () => {
    const methodId = (await tenantDb(b).method.findFirstOrThrow()).id;
    const versionId = (await tenantDb(b).workflowVersion.findFirstOrThrow()).id;
    await expect(
      withTenantTx(a, (tx) => tx.run.create({ data: { tenantId: b, methodId, workflowVersionId: versionId, inputEnc: "x", inputPreview: {}, trigger: "API" } as never })),
    ).rejects.toThrow();
  });
  it("platform transactions see every tenant", async () => {
    expect(await withPlatformTx((tx) => tx.run.count())).toBe(2);
  });
});

describe("published workflow versions", () => {
  it("cannot change their definition", async () => {
    const v = await tenantDb(a).workflowVersion.findFirstOrThrow();
    await tenantDb(a).workflowVersion.update({ where: { id: v.id }, data: { status: "PUBLISHED" } });
    await expect(tenantDb(a).workflowVersion.update({ where: { id: v.id }, data: { definition: { steps: [] } } })).rejects.toThrow(/immutable/);
  });
});

describe("run_log partitions", () => {
  it("creates the partition of a month on demand", async () => {
    const c = new pg.Client({ connectionString: process.env.TEST_MIGRATOR_URL });
    await c.connect();
    const { rows } = await c.query(`SELECT app_ensure_run_log_partition('2027-03-15') AS name`);
    const again = await c.query(`SELECT app_ensure_run_log_partition('2027-03-01') AS name`);
    await c.end();
    expect(rows[0].name).toBe("run_log_2027_03");
    expect(again.rows[0].name).toBe("run_log_2027_03");
  });
});
