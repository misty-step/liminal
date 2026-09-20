import { NextResponse } from "next/server";
import { getPuzzle } from "@/lib/liminal/deck";
import { reportStore } from "@/lib/liminal/store";

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

  const report = { at: new Date().toISOString(), puzzleId, answer, note };

  try {
    const durable = await reportStore();
    if (durable) {
      // Workers runtime: append-only row in the D1 authority (readable back).
      await durable.append(report);
    } else {
      // Local development fallback (no bindings): JSONL beside the app.
      const { appendFile, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const dir = process.env.LIMINAL_REPORT_DIR ?? join(process.cwd(), "data", "reports");
      await mkdir(dir, { recursive: true });
      await appendFile(join(dir, "reports.jsonl"), `${JSON.stringify(report)}\n`, "utf8");
    }
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "storage-failed" }, { status: 503 });
  }
}
