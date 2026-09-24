import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { dateKeyUTC, puzzleNumber } from "@/lib/liminal/daily";
import { puzzleForNumber } from "@/lib/liminal/scheduleSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A past or current puzzle by number. Future numbers are refused so scheduled
 * puzzles never leak before their day.
 */
export async function GET(_request: Request, context: { params: Promise<{ number: string }> }) {
  const { number: raw } = await context.params;
  const number = Number(raw);
  if (!/^\d{1,6}$/.test(raw) || number < 1 || number > puzzleNumber(dateKeyUTC())) {
    return NextResponse.json({ status: "not-found" }, { status: 404 });
  }
  try {
    return NextResponse.json(await puzzleForNumber(number), {
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "puzzle" } });
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
