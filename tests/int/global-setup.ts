import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";
import pg from "pg";

declare module "vitest" {
  export interface ProvidedContext {
    appUrl: string;
    migratorUrl: string;
  }
}

// Real Postgres for the isolation tests: TEST_DATABASE_URL_MIGRATOR / _APP if given (an EMPTY test
// database — migrations are deployed, nothing is reset), else a throwaway Testcontainers Postgres
// with the same roles as production.
export default async function setup(project: TestProject) {
  let migratorUrl = process.env.TEST_DATABASE_URL_MIGRATOR;
  let appUrl = process.env.TEST_DATABASE_URL_APP;
  let stop: (() => Promise<unknown>) | undefined;

  if (!migratorUrl || !appUrl) {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const c = await new PostgreSqlContainer("postgres:17").withUsername("postgres").withPassword("postgres").start();
    const admin = new pg.Client({ connectionString: c.getConnectionUri() });
    await admin.connect();
    await admin.query(`CREATE ROLE dgcomplete_migrator LOGIN CREATEDB PASSWORD 'dev'`);
    await admin.query(`CREATE ROLE dgcomplete_app LOGIN NOBYPASSRLS PASSWORD 'dev'`);
    await admin.query(`CREATE DATABASE "DG_COMPLETE" OWNER dgcomplete_migrator`);
    await admin.end();
    const base = `postgresql://%u:dev@${c.getHost()}:${c.getPort()}/DG_COMPLETE`;
    migratorUrl = base.replace("%u", "dgcomplete_migrator");
    appUrl = base.replace("%u", "dgcomplete_app");
    stop = () => c.stop();
  }

  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL_MIGRATOR: migratorUrl, DATABASE_URL: migratorUrl } });
  const m = new pg.Client({ connectionString: migratorUrl });
  await m.connect();
  await m.query(`GRANT USAGE ON SCHEMA public TO dgcomplete_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dgcomplete_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dgcomplete_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dgcomplete_app;`);
  await m.end();

  project.provide("appUrl", appUrl);
  project.provide("migratorUrl", migratorUrl);
  return stop;
}
