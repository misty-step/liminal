import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { DECK } from "@/lib/liminal/deck";
import { runtimeEnvironment } from "@/lib/liminal/runtime";
import { cloudBindings } from "@/lib/liminal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_COLUMN_PROBES = [
  "SELECT key, state FROM judgments LIMIT 0",
  "SELECT at, puzzle_id, answer, note FROM reports LIMIT 0",
  "SELECT event_id, event_name, game, environment, occurred_at, session_id, actor_id, schema_version, props_json FROM product_events LIMIT 0",
  "SELECT date, number, puzzle_id, puzzle_json, source FROM schedule LIMIT 0",
] as const;

export async function GET() {
  const deckReady = DECK.length > 0 && DECK.every((puzzle) => puzzle.conditions.length >= 3);
  let configuredEnvironment: ReturnType<typeof runtimeEnvironment>;
  try {
    configuredEnvironment = runtimeEnvironment(process.env.LIMINAL_ENVIRONMENT);
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "health", operation: "runtime-config" } });
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "liminal",
        environment: "invalid",
        checks: {
          deck: deckReady ? "ok" : "failed",
          storage: "configuration-error",
        },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
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
      const row = await db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM d1_migrations
              WHERE name = '0001_judgments_and_reports.sql') AS coreMigration,
            (SELECT COUNT(*) FROM d1_migrations
              WHERE name = '0002_foundations.sql') AS foundationMigration,
            (SELECT COUNT(*) FROM d1_migrations
              WHERE name = '0003_schedule.sql') AS scheduleMigration,
            (SELECT COUNT(*) FROM sqlite_master
              WHERE type = 'table'
                AND name IN ('judgments', 'reports', 'product_events', 'schedule')) AS tableCount,
            (SELECT COUNT(*) FROM sqlite_master
              WHERE type = 'trigger'
                AND name IN (
                  'judgments_state_insert_guard',
                  'judgments_state_update_guard',
                  'schedule_no_update',
                  'schedule_future_only'
                )) AS triggerCount,
            (SELECT COUNT(*) FROM sqlite_master
              WHERE type = 'index'
                AND name IN (
                  'product_events_funnel',
                  'product_events_session'
                )) AS indexCount`,
        )
        .first<{
          coreMigration: number;
          foundationMigration: number;
          scheduleMigration: number;
          tableCount: number;
          triggerCount: number;
          indexCount: number;
        }>();
      if (
        row?.coreMigration !== 1 ||
        row.foundationMigration !== 1 ||
        row.scheduleMigration !== 1 ||
        row.tableCount !== 4 ||
        row.triggerCount !== 4 ||
        row.indexCount !== 2
      ) {
        throw new Error("required D1 schema is not ready");
      }
      // Compile every route-used column against D1 without mutating tables.
      // Compatible additive columns remain valid because each probe names only
      // the columns that report, judge, and event queries require.
      for (const query of REQUIRED_COLUMN_PROBES) {
        await db.prepare(query).first();
      }
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
