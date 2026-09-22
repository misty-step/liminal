import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import {
  clientKey,
  createRateLimiter,
  createProductEvent,
  parseProductEventPayload,
  readJsonPayload,
  runtimeEnvironment,
} from "@/lib/liminal/runtime";
import { productEventStore } from "@/lib/liminal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function POST(request: Request) {
  if (limiter.isLimited(clientKey(request), Date.now())) {
    return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });
  }

  const body = await readJsonPayload(request, 4096);
  if (!body.ok) {
    return NextResponse.json(
      { ok: false, reason: body.reason },
      { status: body.reason === "payload-too-large" ? 413 : 400 },
    );
  }

  const parsed = parseProductEventPayload(body.value);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 });
  }
  let environment: ReturnType<typeof runtimeEnvironment>;
  try {
    environment = runtimeEnvironment(process.env.LIMINAL_ENVIRONMENT);
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "events", operation: "runtime-config" } });
    return NextResponse.json(
      { ok: false, reason: "environment-not-configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!environment) {
    return NextResponse.json({ ok: false, reason: "environment-not-configured" }, { status: 503 });
  }
  const store = await productEventStore();
  if (!store) {
    return NextResponse.json({ ok: false, reason: "store-not-configured" }, { status: 503 });
  }

  try {
    await store.append(
      createProductEvent(parsed.value, {
        environment,
        occurredAt: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      { ok: true },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "events", operation: "append" } });
    return NextResponse.json({ ok: false, reason: "storage-failed" }, { status: 503 });
  }
}
