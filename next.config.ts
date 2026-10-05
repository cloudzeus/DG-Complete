import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    authInterrupts: true,
  },
  serverExternalPackages: ["pg", "mysql2", "mssql"],
  // The Cube data model is read at runtime by /api/internal/cube/model.
  outputFileTracingIncludes: {
    "/api/internal/cube/model": ["./cube/model/**/*"],
  },
};

export default nextConfig;
