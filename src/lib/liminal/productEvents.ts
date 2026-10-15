import { randomId } from "./id";
import type { ProductEventName } from "./runtime";

type EventProps = Record<string, string | number | boolean>;

function sessionId(): string {
  const key = "liminal.event-session.v1";
  const retained = window.sessionStorage.getItem(key);
  if (retained) return retained;
  const created = `session_${randomId().replaceAll("-", "")}`;
  window.sessionStorage.setItem(key, created);
  return created;
}

/** Best-effort analytics must never interrupt mounting or playing the puzzle. */
export function emitProductEvent(eventName: ProductEventName, props: EventProps): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      eventId: randomId(),
      eventName,
      sessionId: sessionId(),
      props,
    });
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Storage, entropy, serialization, and synchronous transport failures are optional telemetry.
  }
}
