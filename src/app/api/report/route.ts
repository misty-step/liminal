import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getPuzzle } from "@/lib/liminal/deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const LIMIT = 5;
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
    return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > 2048) {
    return NextResponse.json({ ok: false, reason: "payload-too-large" }, { status: 413 });
  }

  let body: { puzzleId?: unknown; answer?: unknown; note?: unknown };
  try {
    body = JSON.parse(raw) as { puzzleId?: unknown; answer?: unknown; note?: unknown };
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }

  const puzzleId = typeof body.puzzleId === "string" ? body.puzzleId.slice(0, 64) : "";
  const answer = typeof body.answer === "string" ? body.answer.slice(0, 120) : "";
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : "";
  if (!getPuzzle(puzzleId) || !answer.trim()) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }

  const line = JSON.stringify({
    at: new Date().toISOString(),
    puzzleId,
    answer,
    note,
  });

  try {
    // Local slice storage. Production swaps this for a durable store (KV or
    // Convex); failures must be reported honestly to the player.
    const dir = process.env.LIMINAL_REPORT_DIR ?? join(process.cwd(), "data", "reports");
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "reports.jsonl"), `${line}\n`, "utf8");
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "storage-failed" }, { status: 503 });
  }
}
