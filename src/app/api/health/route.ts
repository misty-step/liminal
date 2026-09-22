import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { DECK } from "@/lib/liminal/deck";
import { runtimeEnvironment } from "@/lib/liminal/runtime";
import { cloudBindings } from "@/lib/liminal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deckReady = DECK.length > 0 && DECK.every((puzzle) => puzzle.conditions.length >= 3);
  const configuredEnvironment = runtimeEnvironment(process.env.LIMINAL_ENVIRONMENT);
  const environment = configuredEnvironment ?? "development";
  if (!deckReady) {
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "liminal",
        environment,
        checks: { deck: "failed", storage: "unknown" },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const db = (await cloudBindings())?.LIMINAL_DB;
  if (!db && (configuredEnvironment === "production" || configuredEnvironment === "staging")) {
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "liminal",
        environment,
        checks: { deck: "ok", storage: "not-configured" },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (db) {
    try {
      const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      if (row?.ok !== 1) throw new Error("store probe failed");
    } catch (error) {
      Sentry.captureException(error, { tags: { route: "health", operation: "storage-probe" } });
      return NextResponse.json(
        {
          status: "unhealthy",
          service: "liminal",
          environment,
          checks: { deck: "ok", storage: "failed" },
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  }

  return NextResponse.json(
    {
      status: "ok",
      service: "liminal",
      environment,
      checks: { deck: "ok", storage: db ? "ok" : "not-configured" },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
