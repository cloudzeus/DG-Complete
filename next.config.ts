import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  experimental: {
    authInterrupts: true,
  },
  serverExternalPackages: ["pg", "exceljs"],
};

export default nextConfig;
