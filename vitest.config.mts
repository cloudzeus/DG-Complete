import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests: pure modules, no database. "server-only" maps to its empty stub (as with the react-server condition).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname), "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js") } },
  test: { include: ["tests/unit/**/*.test.ts", "lib/**/*.test.ts"], environment: "node" },
});
