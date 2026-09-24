import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { dateKeyUTC } from "@/lib/liminal/daily";
import { puzzleForDate } from "@/lib/liminal/scheduleSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's puzzle (UTC): the published schedule, else the bundled rotation. */
export async function GET() {
  try {
    return NextResponse.json(await puzzleForDate(dateKeyUTC()), {
      headers: { "cache-control": "public, max-age=60" },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "today" } });
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
