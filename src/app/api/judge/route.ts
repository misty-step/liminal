import { NextResponse } from "next/server";
import { getPuzzle } from "@/lib/liminal/deck";
import { normalizeAnswer } from "@/lib/liminal/normalize";
import { judgeAnswer, judgeEnvFrom, memoryCache } from "@/lib/liminal/typeSafe";
import { MAX_ANSWER_LENGTH } from "@/lib/liminal/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = memoryCache();

// Bounded per-IP rate limit: 20 judgments per minute.
const WINDOW_MS = 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip, Date.now())) {
    return NextResponse.json({ status: "unavailable", reason: "rate-limited" }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > 2048) {
    return NextResponse.json({ status: "unavailable", reason: "payload-too-large" }, { status: 413 });
  }

  let body: { puzzleId?: unknown; answer?: unknown };
  try {
    body = JSON.parse(raw) as { puzzleId?: unknown; answer?: unknown };
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "bad-request" }, { status: 400 });
  }

  const puzzleId = typeof body.puzzleId === "string" ? body.puzzleId : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  const puzzle = getPuzzle(puzzleId);
  if (!puzzle || !answer.trim() || answer.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json({ status: "unavailable", reason: "bad-request" }, { status: 400 });
  }

  const env = judgeEnvFrom(process.env);
  const result = await judgeAnswer({
    puzzle,
    answer,
    env,
    cache,
    timeoutMs: 4000,
  });

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
