import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  // Tenant isolation (docs/02 §1.1): tenant pages, the public API and the pure engine/DSL never use
  // the raw Prisma client — only tenantDb() / withTenantTx() from lib/tenant-db.
  {
    files: ["app/t/**", "app/api/v1/**", "lib/engine/**", "lib/dsl/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "@/lib/prisma", message: "Χρησιμοποιήστε tenantDb() / withTenantTx() από @/lib/tenant-db." }] }],
    },
  },
  {
    files: ["lib/engine/**", "lib/dsl/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "server-only", message: "lib/dsl και lib/engine τρέχουν και εκτός Next (worker, extension)." }, { name: "@/lib/prisma", message: "Όχι Prisma στο lib/dsl / lib/engine." }] }],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / separate projects:
    "lib/generated/**",
    "extension/**",
  ]),
]);

export default eslintConfig;
