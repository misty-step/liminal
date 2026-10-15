import { readFileSync } from "node:fs";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

if (
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production" ||
  process.env.SENTRY_ENVIRONMENT === "production"
) {
  const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE;
  if (
    !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    !release ||
    release !== process.env.SENTRY_RELEASE ||
    release.length !== 40 ||
    /[^a-f0-9]/i.test(release)
  ) {
    throw new Error(
      "Production builds require NEXT_PUBLIC_SENTRY_DSN and matching NEXT_PUBLIC_SENTRY_RELEASE and SENTRY_RELEASE values set to the same 40-hex commit SHA.",
    );
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    LIMINAL_CHANGELOG: readFileSync("CHANGELOG.md", "utf8"),
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT ?? "liminal",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: process.env.SENTRY_RELEASE,
  },
});
