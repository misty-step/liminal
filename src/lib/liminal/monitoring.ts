import type { Event } from "@sentry/nextjs";

function stripQuery(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

/** Keep operational shape while removing player text and joinable identity. */
export function scrubSentryEvent<T extends Event>(event: T): T {
  const request = event.request?.url ? { url: stripQuery(event.request.url) } : undefined;
  const breadcrumbs = event.breadcrumbs?.map(
    ({ data: _data, message: _message, ...breadcrumb }) => breadcrumb,
  );

  return {
    ...event,
    user: undefined,
    request,
    breadcrumbs,
    extra: undefined,
  };
}
