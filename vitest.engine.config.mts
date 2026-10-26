import path from "node:path";
import { defineConfig } from "vitest/config";

// Engine tests: real Chromium against the sandbox (docs/12). No database.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname), "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js") } },
  test: { include: ["tests/engine/**/*.test.ts"], environment: "node", testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
