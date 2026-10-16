import type { Event } from "@sentry/nextjs";

function stripQuery(value: string): string {
  // The share code contains the player's words, not an opaque identifier.
  value = value.replace(/\/s\/[^/?#\s"'<>]+/g, "/s/[redacted]");
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

function scrubUrlValues(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/(?:https?:\/\/|\/s\/)[^\s"'<>]+/g, stripQuery);
  }
  if (Array.isArray(value)) return value.map(scrubUrlValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, scrubUrlValues(entry)]),
    );
  }
  return value;
}

/** Keep operational shape while removing player text and joinable identity. */
export function scrubSentryEvent<T extends Event>(event: T): T {
  const request = event.request?.url ? { url: stripQuery(event.request.url) } : undefined;
  const breadcrumbs = event.breadcrumbs?.map(
    ({ data: _data, message: _message, ...breadcrumb }) => breadcrumb,
  );

  // Sentry's JSON metadata includes URLs in transactions, span data, tags,
  // contexts and exception text, not just the top-level request URL.
  return scrubUrlValues({
    ...event,
    user: undefined,
    request,
    breadcrumbs,
    extra: undefined,
  }) as T;
}
