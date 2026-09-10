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
  async redirects() {
    return [
      // Trade-log pagination used to be query-based. Under `force-static` Next
      // resolved searchParams to `{}` at build time, so every old ?page=N link
      // silently served page 1. Those URLs are indexed and bookmarked, so send
      // them to the path-based page they meant. Handled at the routing layer,
      // which keeps both trade routes static.
      //
      // No loop: the source only matches the exact path /transactions/trades,
      // and every destination is under /transactions/trades/page/, a distinct
      // path with its own static page (page 1 included). The rule can't rematch
      // its own output regardless of whether Next carries ?page= through.
      {
        source: "/transactions/trades",
        has: [{ type: "query", key: "page", value: "(?<p>\\d+)" }],
        destination: "/transactions/trades/page/:p",
        permanent: true,
      },
    ];
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
