import path from "node:path";
import type { NextConfig } from "next";

const graphApi = (process.env.GRAPH_API_URL || "https://api.trees.cloud").replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/v2/cube/chat", destination: "/api/gone" },
        { source: "/api/v2/cube/chat/:path*", destination: "/api/gone" },
        { source: "/api/v2/cube/benchmarks", destination: "/api/gone" },
        { source: "/api/v2/cube/benchmarks/:path*", destination: "/api/gone" },
      ],
      afterFiles: [
        { source: "/api/v2/graphql", destination: `${graphApi}/api/v2/graphql` },
        { source: "/api/v2/cube", destination: `${graphApi}/api/v2/cube` },
        { source: "/api/v2/cube/:path*", destination: `${graphApi}/api/v2/cube/:path*` },
      ],
    };
  },
};

export default nextConfig;
