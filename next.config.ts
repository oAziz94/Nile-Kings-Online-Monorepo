import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
  eslint: {
    // eslint.config.mjs (added in backlog 4.2) was this repo's first-ever ESLint config;
    // `next build` runs lint by default and surfaced a backlog of pre-existing violations
    // across unrelated files, hard-failing builds that succeeded before. `npm run lint`
    // still runs and still exits non-zero on real violations — only the build is decoupled
    // from that pre-existing debt (docs/redesign/04-decisions.md 2026-09-10, 4.2 verification).
    ignoreDuringBuilds: true,
  },
};

// Safe with no Sentry account configured yet: source-map upload is skipped
// (not failed) when org/project/authToken are unset. Fill in SENTRY_ORG,
// SENTRY_PROJECT, SENTRY_AUTH_TOKEN once the Sentry project exists.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
