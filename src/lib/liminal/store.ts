/**
 * Durable stores for the deployed (Cloudflare Workers) runtime.
 *
 * Judgments live in D1 and are retained first-writer-wins: the store inserts a
 * candidate state only if the key is unclaimed (`INSERT OR IGNORE`) and then
 * re-reads, so concurrent or later callers receive the retained winner instead
 * of a fresh roll. D1 serves reads from a single primary, so a verdict never
 * depends on which Worker isolate handles the request.
 *
 * Reports are append-only rows in the same database, written so a filed
 * report can be read back.
 *
 * Outside a Workers runtime (vitest, `next dev`) bindings are absent; callers
 * fall back to the legacy process-local cache and a local JSONL file.
 */

import type { ProductEvent } from "./runtime";
import { runtimeEnvironment } from "./runtime";
import type { JudgmentCache } from "./typeSafe";
import { memoryCache } from "./typeSafe";
import type { ConditionState } from "./types";

/** Minimal D1 surface used here (avoids a workers-types dependency). */
export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1StatementLike;
}

export interface CloudBindings {
  LIMINAL_DB?: D1Like;
}

const STATE_VALUES: readonly ConditionState[] = ["inside", "close", "outside"];

export class D1InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "D1InvariantError";
  }
}

function isConditionState(value: unknown): value is ConditionState {
  return typeof value === "string" && (STATE_VALUES as readonly string[]).includes(value);
}

/** Cloudflare bindings for this invocation, or null outside Workers. */
export async function cloudBindings(): Promise<CloudBindings | null> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const context = mod.getCloudflareContext() as unknown as
      | { env?: Record<string, unknown> }
      | undefined;
    return context?.env ? (context.env as CloudBindings) : null;
  } catch {
    return null;
  }
}

/**
 * D1-backed judgment cache. `set` stores the candidate only when the key is
 * unclaimed and always returns the retained winner, so conflicting concurrent
 * callers converge on one verdict and repeats never reroll.
 */
export function d1JudgeCache(db: D1Like, hot: JudgmentCache = memoryCache()): JudgmentCache {
  const selectState = async (key: string): Promise<ConditionState | undefined> => {
    const row = await db
      .prepare("SELECT state FROM judgments WHERE key = ?")
      .bind(key)
      .first<{ state: string }>();
    if (!row) return undefined;
    if (!isConditionState(row.state)) {
      throw new D1InvariantError("invalid retained judgment state");
    }
    return row.state;
  };
  return {
    async get(key) {
      const cached = await hot.get(key);
      if (cached) return cached;
      const state = await selectState(key);
      if (state) await hot.set(key, state);
      return state;
    },
    async set(key, candidate) {
      await db
        .prepare("INSERT OR IGNORE INTO judgments (key, state) VALUES (?, ?)")
        .bind(key, candidate)
        .run();
      const retained = await selectState(key);
      if (!retained) throw new D1InvariantError("judgment write was not retained");
      await hot.set(key, retained);
      return retained;
    },
  };
}

let fallbackCache: JudgmentCache | null = null;
let sharedHot: JudgmentCache | null = null;

/** Judge cache for the current runtime: D1 authority on Workers, memory elsewhere. */
export async function judgeCache(): Promise<JudgmentCache> {
  const environment = runtimeEnvironment(process.env.LIMINAL_ENVIRONMENT);
  const db = (await cloudBindings())?.LIMINAL_DB;
  if (!db) {
    if (environment === "production" || environment === "staging") {
      throw new D1InvariantError("LIMINAL_DB binding is required");
    }
    fallbackCache ??= memoryCache();
    return fallbackCache;
  }
  sharedHot ??= memoryCache();
  return d1JudgeCache(db, sharedHot);
}

/** Append-only report store. Null outside Workers (caller uses the local file). */
export async function reportStore(): Promise<{
  append(report: { at: string; puzzleId: string; answer: string; note: string }): Promise<void>;
} | null> {
  const db = (await cloudBindings())?.LIMINAL_DB;
  if (!db) return null;
  return {
    async append(report) {
      await db
        .prepare("INSERT INTO reports (at, puzzle_id, answer, note) VALUES (?, ?, ?, ?)")
        .bind(report.at, report.puzzleId, report.answer, report.note)
        .run();
    },
  };
}

export function d1ProductEventStore(db: D1Like): {
  append(event: ProductEvent): Promise<void>;
} {
  return {
    async append(event) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO product_events " +
            "(event_id, event_name, game, environment, occurred_at, session_id, actor_id, schema_version, props_json) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          event.event_id,
          event.event_name,
          event.game,
          event.environment,
          event.occurred_at,
          event.session_id,
          event.actor_id,
          event.schema_version,
          JSON.stringify(event.props),
        )
        .run();
    },
  };
}

/** Product-event store. Events are retained only when D1 is bound. */
export async function productEventStore(): Promise<{
  append(event: ProductEvent): Promise<void>;
} | null> {
  const db = (await cloudBindings())?.LIMINAL_DB;
  return db ? d1ProductEventStore(db) : null;
}
