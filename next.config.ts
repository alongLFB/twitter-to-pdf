import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
      },
      {
        protocol: "https",
        hostname: "abs.twimg.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/s/:id",
        destination: "/",
      },
      {
        source: "/a/:id",
        destination: "/",
      },
    ];
  },
};

export default nextConfig;
