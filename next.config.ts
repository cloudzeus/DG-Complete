import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    authInterrupts: true,
  },
  serverExternalPackages: ["pg", "mysql2", "mssql"],
};

export default nextConfig;
