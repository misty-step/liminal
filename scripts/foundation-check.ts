import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures: string[] = [];

function read(path: string): string {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    failures.push(`missing ${path}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function requireText(path: string, needles: readonly string[]): string {
  const value = read(path);
  for (const needle of needles) {
    if (!value.includes(needle)) failures.push(`${path} must contain ${JSON.stringify(needle)}`);
  }
  return value;
}

function requireSquareSvg(path: string, size: number): void {
  const svg = read(path);
  const viewBox = new RegExp(`viewBox=["']0 0 ${size} ${size}["']`);
  if (!viewBox.test(svg)) failures.push(`${path} must use a ${size}x${size} viewBox`);
  if (/<text\b/i.test(svg)) failures.push(`${path} must remain shape-based, not font-dependent`);
}

const packageJson = JSON.parse(read("package.json")) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
for (const name of ["format:check", "lint", "foundation:check", "type-check", "test", "build:cf"]) {
  if (!scripts[name]) failures.push(`package.json must define ${name}`);
}
if (!packageJson.dependencies?.["@sentry/nextjs"]) {
  failures.push("package.json must pin @sentry/nextjs");
}
if (!packageJson.devDependencies?.["@biomejs/biome"]) {
  failures.push("package.json must pin @biomejs/biome");
}

requireSquareSvg("public/brand/liminal-mark-16.svg", 16);
requireSquareSvg("public/brand/liminal-mark-32.svg", 32);
requireSquareSvg("public/brand/liminal-mark.svg", 256);
requireText("public/brand/liminal-share.svg", ['viewBox="0 0 1200 630"']);
// Social cards need a raster image: most platforms do not render SVG previews.
if (!existsSync(join(root, "public/brand/liminal-share.png"))) {
  failures.push("public/brand/liminal-share.png is required for link previews");
}
requireText("src/app/layout.tsx", [
  "/brand/liminal-mark-16.svg",
  "/brand/liminal-mark-32.svg",
  "/brand/liminal-mark.svg",
  "/brand/liminal-share.png",
  "openGraph",
]);

requireText("src/app/api/health/route.ts", [
  'status: "unhealthy"',
  'storage: "not-configured"',
  '"cache-control": "no-store"',
]);
requireText("src/app/api/events/route.ts", [
  "parseProductEventPayload",
  "runtimeEnvironment",
  "productEventStore",
]);
requireText("src/lib/liminal/runtime.ts", [
  "readJsonPayload",
  "createRateLimiter",
  "actor_id: null",
  'game: "liminal"',
]);
requireText("migrations/0002_foundations.sql", [
  "CREATE TABLE IF NOT EXISTS product_events",
  "event_id TEXT PRIMARY KEY",
  "judgments_state_insert_guard",
]);

const wrangler = requireText("wrangler.jsonc", [
  '"LIMINAL_ENVIRONMENT": "staging"',
  '"LIMINAL_ENVIRONMENT": "production"',
  '"SENTRY_ENVIRONMENT": "staging"',
  '"SENTRY_ENVIRONMENT": "production"',
]);
if ((wrangler.match(/"LIMINAL_DB"/g) ?? []).length < 3) {
  failures.push("wrangler.jsonc must bind LIMINAL_DB at root, staging, and production");
}

for (const path of [
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "src/instrumentation-client.ts",
]) {
  requireText(path, [
    "sendDefaultPii: false",
    "environment:",
    "release:",
    "tracesSampleRate:",
    "scrubSentryEvent",
  ]);
}
requireText("next.config.ts", [
  'from "@sentry/nextjs/config"',
  "withSentryConfig",
  "deleteSourcemapsAfterUpload: true",
  "SENTRY_RELEASE",
]);
requireText("src/instrumentation.ts", [
  "captureRequestError",
  "sentry.server.config",
  "sentry.edge.config",
]);
requireText("src/lib/liminal/monitoring.ts", [
  "user: undefined",
  "request,",
  "breadcrumbs,",
  "extra: undefined",
]);

const manifest = JSON.parse(read("ops/production-foundations.json")) as {
  classification?: string;
  health?: { path?: string };
  productEvents?: { path?: string; playerTextAllowed?: boolean };
  sentry?: { projectSlug?: string; admittedEnvironment?: string; sendDefaultPii?: boolean };
};
if (manifest.classification !== "browser-app")
  failures.push("ops manifest class must be browser-app");
if (manifest.health?.path !== "/api/health") failures.push("ops manifest must register health");
if (manifest.productEvents?.path !== "/api/events" || manifest.productEvents.playerTextAllowed) {
  failures.push("ops manifest must register privacy-safe product events");
}
if (
  manifest.sentry?.projectSlug !== "liminal" ||
  manifest.sentry.admittedEnvironment !== "production" ||
  manifest.sentry.sendDefaultPii !== false
) {
  failures.push("ops manifest must register production-only, privacy-safe Sentry triage");
}

requireText(".github/workflows/ci.yml", [
  "bun install --frozen-lockfile",
  "bun run format:check",
  "bun run lint",
  "bun run foundation:check",
  "bun run type-check",
  "bun run test",
  "bun run build:cf",
]);
requireText("DESIGN.md", ["16 px", "32 px", "256 px"]);

if (failures.length > 0) {
  for (const failure of failures) console.error(`foundation-check: ${failure}`);
  console.error(`foundation-check: failed (${failures.length})`);
  process.exit(1);
}

console.log("foundation-check: passed (brand, health, telemetry, storage, Sentry, CI)");
