import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RLS_MODELS, scopeArgs, TENANT_MODELS } from "@/lib/tenant-db";

describe("scopeArgs", () => {
  it("adds tenantId to where of reads, updates and deletes", () => {
    for (const op of ["findMany", "findFirst", "findUnique", "count", "update", "updateMany", "delete", "deleteMany"]) {
      expect(scopeArgs(op, { where: { id: "x" } }, "t1").where).toEqual({ id: "x", tenantId: "t1" });
    }
  });
  it("overrides a tenantId given by the caller", () => {
    expect(scopeArgs("findMany", { where: { tenantId: "other" } }, "t1").where).toEqual({ tenantId: "t1" });
  });
  it("adds tenantId to created data (single and many)", () => {
    expect(scopeArgs("create", { data: { name: "a" } }, "t1").data).toEqual({ name: "a", tenantId: "t1" });
    expect(scopeArgs("createMany", { data: [{ name: "a" }, { name: "b" }] }, "t1").data).toEqual([
      { name: "a", tenantId: "t1" },
      { name: "b", tenantId: "t1" },
    ]);
  });
  it("scopes upsert where and create", () => {
    const a = scopeArgs("upsert", { where: { id: "x" }, create: { name: "a" }, update: {} }, "t1");
    expect(a.where).toEqual({ id: "x", tenantId: "t1" });
    expect(a.create).toEqual({ name: "a", tenantId: "t1" });
  });
  it("refuses to move a row to another tenant", () => {
    expect(() => scopeArgs("update", { where: { id: "x" }, data: { tenantId: "t2" } }, "t1")).toThrow();
  });
});

describe("TENANT_MODELS", () => {
  it("lists exactly the models with a non-null tenantId in prisma/schema.prisma", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+tenantId\s+String\s/m.test(body))
      .map(([, name]) => name)
      .sort();
    expect([...TENANT_MODELS].sort()).toEqual(models);
    for (const m of RLS_MODELS) expect(TENANT_MODELS.has(m)).toBe(true);
  });
});
