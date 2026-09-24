import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { judgeEnabledFor } from "@/lib/liminal/judgment";
import { normalizeAnswer } from "@/lib/liminal/normalize";
import {
  clientKey,
  createRateLimiter,
  parseJudgePayload,
  readJsonPayload,
} from "@/lib/liminal/runtime";
import { puzzleById } from "@/lib/liminal/scheduleSource";
import { judgeCache } from "@/lib/liminal/store";
import { judgeAnswer, judgeEnvFrom } from "@/lib/liminal/typeSafe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bounded per-IP rate limit: 20 judgments per minute.
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function POST(request: Request) {
  if (limiter.isLimited(clientKey(request), Date.now())) {
    return NextResponse.json({ status: "unavailable", reason: "rate-limited" }, { status: 429 });
  }

  const body = await readJsonPayload(request, 2048);
  if (!body.ok) {
    return NextResponse.json(
      { status: "unavailable", reason: body.reason },
      { status: body.reason === "payload-too-large" ? 413 : 400 },
    );
  }

  const parsed = parseJudgePayload(body.value);
  if (!parsed.ok) {
    return NextResponse.json({ status: "unavailable", reason: "bad-request" }, { status: 400 });
  }
  const { puzzleId, answer } = parsed.value;
  let puzzle: Awaited<ReturnType<typeof puzzleById>>;
  try {
    puzzle = await puzzleById(puzzleId);
  } catch (error) {
    // Schedule unreadable: an outage, never "unknown puzzle". No guess is spent.
    Sentry.captureException(error, { tags: { route: "judge", operation: "schedule" } });
    return NextResponse.json(
      { status: "unavailable", reason: "schedule-unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!puzzle) {
    return NextResponse.json({ status: "unavailable", reason: "bad-request" }, { status: 400 });
  }

  const env = judgeEnvFrom(process.env);
  if (!judgeEnabledFor(puzzle, process.env)) {
    // Calibration gate: the live judge is not yet trustworthy for this
    // puzzle's conditions (see evidence/calibration-findings.md). Refuse
    // honestly; the client does not consume a guess.
    return NextResponse.json(
      { status: "unavailable", reason: "uncalibrated" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  let result: Awaited<ReturnType<typeof judgeAnswer>>;
  try {
    const cache = await judgeCache();
    result = await judgeAnswer({
      puzzle,
      answer,
      env,
      // Durable on Workers (D1 first-writer-wins); process-local elsewhere.
      cache,
      timeoutMs: 8000,
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "judge", operation: "storage" } });
    return NextResponse.json(
      { status: "unavailable", reason: "store-not-configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (result.status === "judged") {
    return NextResponse.json(
      { status: "judged", states: result.states, judgmentVersion: result.judgmentVersion },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // Honest outage: the client must not consume a guess.
  return NextResponse.json(
    { status: "unavailable", reason: result.reason, normalized: normalizeAnswer(answer) },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
