import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import {
  clientKey,
  createRateLimiter,
  parseReportPayload,
  readJsonPayload,
  runtimeEnvironment,
} from "@/lib/liminal/runtime";
import { puzzleById } from "@/lib/liminal/scheduleSource";
import { reportStore } from "@/lib/liminal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

export async function POST(request: Request) {
  if (limiter.isLimited(clientKey(request), Date.now())) {
    return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });
  }

  const body = await readJsonPayload(request, 2048);
  if (!body.ok) {
    return NextResponse.json(
      { ok: false, reason: body.reason },
      { status: body.reason === "payload-too-large" ? 413 : 400 },
    );
  }

  const parsed = parseReportPayload(body.value);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const { puzzleId, answer, note } = parsed.value;
  let known: boolean;
  try {
    known = Boolean(await puzzleById(puzzleId));
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "report", operation: "schedule" } });
    return NextResponse.json(
      { ok: false, reason: "schedule-unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!known) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }

  const report = { at: new Date().toISOString(), puzzleId, answer, note };

  let environment: ReturnType<typeof runtimeEnvironment>;
  try {
    environment = runtimeEnvironment(process.env.LIMINAL_ENVIRONMENT);
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "report", operation: "runtime-config" } });
    return NextResponse.json(
      { ok: false, reason: "environment-not-configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const durable = await reportStore();
    if (durable) {
      // Workers runtime: append-only row in the D1 authority (readable back).
      await durable.append(report);
    } else {
      if (environment === "production" || environment === "staging") {
        return NextResponse.json({ ok: false, reason: "store-not-configured" }, { status: 503 });
      }
      // Local development fallback (no bindings): JSONL beside the app.
      const { appendFile, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const dir = process.env.LIMINAL_REPORT_DIR ?? join(process.cwd(), "data", "reports");
      await mkdir(dir, { recursive: true });
      await appendFile(join(dir, "reports.jsonl"), `${JSON.stringify(report)}\n`, "utf8");
    }
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "report", operation: "append" } });
    return NextResponse.json({ ok: false, reason: "storage-failed" }, { status: 503 });
  }
}
