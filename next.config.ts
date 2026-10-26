import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    authInterrupts: true,
  },
  // The embedded worker loads Playwright at runtime; file tracing misses its data files.
  outputFileTracingIncludes: { "/*": ["./node_modules/playwright-core/**/*", "./node_modules/playwright/**/*"] },
  serverExternalPackages: ["pg", "exceljs", "pg-boss", "playwright", "playwright-core"],
};

export default nextConfig;
