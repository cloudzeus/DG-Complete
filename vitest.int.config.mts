import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests on a real Postgres: Testcontainers, or TEST_DATABASE_URL_MIGRATOR/_APP when set
// (e.g. a local dev database). tests/int/global-setup.ts migrates it and creates the roles.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname), "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js") } },
  test: {
    include: ["tests/int/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/int/global-setup.ts"],
    setupFiles: ["tests/int/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
