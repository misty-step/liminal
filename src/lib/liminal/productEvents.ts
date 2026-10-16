import type { BeforeSendFn, PostHogConfig } from "posthog-js";

const storyEvents = new Set([
  "$pageview",
  "puzzle_open",
  "guess_judged",
  "guess_refused",
  "puzzle_complete",
  "report_submitted",
]);
const anonymousId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function analyticsRoute(path: string): string {
  if (/^\/s\/[^/]+\/?$/.test(path)) return "/s/:code";
  return ["/", "/changelog"].includes(path) ? path : "/other";
}

// Rebuild the envelope, not just custom props: SDK defaults and $set_once can
// otherwise carry full URLs, referrers and private share words into ingestion.
export const sanitizeAnalyticsEvent: BeforeSendFn = (event) => {
  if (!event || !storyEvents.has(event.event)) return null;
  const input = event.properties;
  if (!anonymousId.test(input.distinct_id ?? "")) return null;
  const route = analyticsRoute(window.location.pathname);
  const production = process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT === "production";
  const properties: typeof input = {
    token: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    app: "liminal",
    environment: production ? "production" : "development",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? "unknown",
    is_synthetic: !production || navigator.webdriver === true || input.$browser_type === "bot",
    distinct_id: input.distinct_id,
    $process_person_profile: false,
    $geoip_disable: true,
    // Null is replaced by the transport's IP at ingestion. A sentinel is not.
    $ip: "0.0.0.0",
    route,
    $host: "liminal.mistystep.io",
    $pathname: route,
    $current_url: `https://liminal.mistystep.io${route}`,
  };
  for (const key of ["$device_id", "$session_id", "$window_id"]) {
    if (anonymousId.test(input[key] ?? "")) properties[key] = input[key];
  }
  if (event.event === "puzzle_open" && ["today", "practice"].includes(input.mode)) {
    properties.mode = input.mode;
  }
  if (event.event === "guess_judged") {
    if (["inside", "close", "outside"].includes(input.result)) properties.result = input.result;
    if (["authored", "live"].includes(input.source)) properties.source = input.source;
  }
  if (
    event.event === "guess_refused" &&
    ["outage", "ratelimit", "calibration", "rejection"].includes(input.reason)
  ) {
    properties.reason = input.reason;
  }
  if (
    event.event === "puzzle_complete" &&
    Number.isSafeInteger(input.guesses_used) &&
    input.guesses_used >= 1 &&
    input.guesses_used <= 1000
  ) {
    properties.guesses_used = input.guesses_used;
  }
  return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties };
};

export const liminalPostHogConfig: Partial<PostHogConfig> = {
  api_host: "https://us.i.posthog.com",
  ui_host: "https://us.posthog.com",
  person_profiles: "never",
  persistence_name: "liminal-anonymous-v1",
  cross_subdomain_cookie: false,
  cookie_expiration: 30,
  capture_pageview: false,
  capture_pageleave: false,
  autocapture: false,
  rageclick: false,
  capture_dead_clicks: false,
  capture_exceptions: false,
  capture_performance: false,
  capture_heatmaps: false,
  disable_session_recording: true,
  disable_surveys: true,
  advanced_disable_flags: true,
  advanced_disable_toolbar_metrics: true,
  save_referrer: false,
  store_google: false,
  ip: false,
  respect_dnt: true,
  opt_out_useragent_filter: true,
  before_send: sanitizeAnalyticsEvent,
};

let clientPromise: Promise<typeof import("posthog-js").default> | undefined;

/** The official SDK owns identity, sessions, queues and bounded retries. */
export function emitProductEvent(eventName: string, props?: Record<string, unknown>): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (typeof window === "undefined" || !key || !storyEvents.has(eventName)) return;
  clientPromise ??= import("posthog-js").then(({ default: client }) => {
    client.init(key, liminalPostHogConfig);
    return client;
  });
  void clientPromise
    .then((client) => client.capture(eventName, props))
    .catch(() => {
      // Failed import/init/capture is not a failed game; later events may retry.
      clientPromise = undefined;
    });
}
