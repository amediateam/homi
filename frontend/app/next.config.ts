import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Off by the developer's decision (KI-23): when on, `next dev` writes an AGENTS.md block that
    // asks coding agents to report feedback to the Next.js team.
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Served through nginx as https://app.homi.loc in development (ADR-0008); Next rejects
  // cross-origin dev requests (HMR, RSC payloads) unless the host is listed here.
  allowedDevOrigins: ["app.homi.loc"],
  images: {
    // CDN hosts per environment — explicit, no wildcard (master prompt §12.5).
    remotePatterns: [
      { protocol: "https", hostname: "cdn.homi.loc" },
      { protocol: "https", hostname: "cdn.staging.homi.uz" },
      { protocol: "https", hostname: "cdn.homi.uz" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
