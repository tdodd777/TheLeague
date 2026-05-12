import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  outputFileTracingRoot: path.join(__dirname),
  pageExtensions: ["ts", "tsx", "mdx"],
  productionBrowserSourceMaps: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sleepercdn.com" },
    ],
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
