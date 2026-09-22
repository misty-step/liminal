import { normalizeAnswer } from "./normalize";
import {
  CHOICE_CONFIDENCE_FLOOR,
  CHOICE_KEYS,
  DEFAULT_MODEL,
  JUDGE_PROMPT_VERSION,
  buildQuestions,
  judgmentKey,
  stateFromChoice,
  stateFromNoul,
} from "./judgment";
import type { ChoiceKey, JudgeResult } from "./judgment";
import type { ConditionState, Puzzle } from "./types";

/**
 * Server-side semantic judging. Two providers, one contract:
 * - TypeSafe native: https://api.typesafe.ai/v1/systemone  (TYPESAFE_API_KEY)
 * - OpenRouter Decisions: https://openrouter.ai/api/alpha/decisions
 *   (OPENROUTER_API_KEY, model typesafe/jev-1.13) — proven on the Misty Step account.
 *
 * Credentials stay server-side. Requests are bounded, time-boxed, and cached by
 * judgment version so the same answer never rerolls a judgment.
 *
 * Conditions ship authored Choice levels: one descriptive rubric per condition,
 * and the chosen level maps to outside / close / inside. A Choice answer below
 * the confidence floor is uncertainty, not a judgment: it is reported as
 * "uncertain" and the caller refuses without consuming a guess.
 */

export interface JudgeEnv {
  url: string;
  apiKey: string;
  model: string;
}

export function judgeEnvFrom(env: Record<string, string | undefined>): JudgeEnv | null {
  const typesafe = env.TYPESAFE_API_KEY;
  const openrouter = env.OPENROUTER_API_KEY;
  if (typesafe) {
    return {
      url: env.JEV_DECISIONS_URL ?? "https://api.typesafe.ai/v1/systemone",
      apiKey: typesafe,
      model: env.JEV_MODEL ?? DEFAULT_MODEL,
    };
  }
  if (openrouter) {
    return {
      url: env.JEV_DECISIONS_URL ?? "https://openrouter.ai/api/alpha/decisions",
      apiKey: openrouter,
      model: env.JEV_MODEL ?? "typesafe/jev-1.13",
    };
  }
  return null;
}

/**
 * A judgment store. `set` returns the retained winner for the key: durable
 * implementations preserve the first stored state and return it instead of
 * the candidate, so concurrent judges converge on one verdict.
 */
export interface JudgmentCache {
  get(key: string): ConditionState | undefined | Promise<ConditionState | undefined>;
  set(key: string, state: ConditionState): ConditionState | Promise<ConditionState>;
}

/** Bounded in-memory cache. It is a hot layer, never a durable authority. */
export function memoryCache(limit = 5000): JudgmentCache {
  const map = new Map<string, ConditionState>();
  return {
    get(key) {
      return map.get(key);
    },
    set(key, state) {
      if (map.size >= limit) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, state);
      return state;
    },
  };
}

interface TypeSafeResponse {
  answers?: Record<
    string,
    {
      type?: string;
      noul?: number;
      choice?: string;
      confidence?: number;
    }
  >;
}

export interface JudgeOptions {
  puzzle: Puzzle;
  answer: string;
  env: JudgeEnv | null;
  cache: JudgmentCache;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function judgeAnswer(options: JudgeOptions): Promise<JudgeResult> {
  const { puzzle, env, cache } = options;
  if (!env) return { status: "unavailable", reason: "not-configured" };

  const answer = normalizeAnswer(options.answer);
  const questions = buildQuestions(puzzle);
  const states: Record<string, ConditionState> = {};
  const uncached: string[] = [];

  for (const condition of puzzle.conditions) {
    const key = judgmentKey({
      puzzleId: puzzle.id,
      conditionId: condition.id,
      answer,
      model: env.model,
    });
    const cached = await cache.get(key);
    if (cached) {
      states[condition.id] = cached;
    } else {
      uncached.push(condition.id);
    }
  }

  if (uncached.length === 0) {
    return {
      status: "judged",
      states,
      model: env.model,
      judgmentVersion: `${JUDGE_PROMPT_VERSION}:${env.model}`,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
  const fresh: Record<string, ConditionState> = {};
  const confidences: Record<string, number> = {};

  try {
    const response = await fetchImpl(env.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.model,
        // The player answer is data. It is never read as instructions.
        state: { answer },
        questions,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: "unavailable", reason: "upstream-error" };
    }

    const body = (await response.json()) as TypeSafeResponse;
    if (!body.answers) return { status: "unavailable", reason: "invalid-response" };

    // Validate every fresh judgment before caching any of them: a partial
    // response must not leave half a judgment behind.
    for (const conditionId of uncached) {
      const question = questions[conditionId];
      const value = body.answers[conditionId];
      if (!value) {
        return { status: "unavailable", reason: "invalid-response" };
      }
      if (question.type === "choice") {
        if (typeof value.choice !== "string" || !CHOICE_KEYS.includes(value.choice as ChoiceKey)) {
          return { status: "unavailable", reason: "invalid-response" };
        }
        const confidence = typeof value.confidence === "number" ? value.confidence : 0;
        if (confidence < CHOICE_CONFIDENCE_FLOOR) {
          // Honest uncertainty: this is not a near miss and not a judgment.
          return { status: "unavailable", reason: "uncertain" };
        }
        const state = stateFromChoice(value.choice);
        if (!state) {
          return { status: "unavailable", reason: "invalid-response" };
        }
        fresh[conditionId] = state;
        confidences[conditionId] = confidence;
      } else {
        if (typeof value.noul !== "number") {
          return { status: "unavailable", reason: "invalid-response" };
        }
        fresh[conditionId] = stateFromNoul(value.noul);
        confidences[conditionId] =
          typeof value.confidence === "number"
            ? value.confidence
            : Math.max(value.noul, 1 - value.noul);
      }
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "unavailable", reason: aborted ? "timeout" : "upstream-error" };
  } finally {
    clearTimeout(timer);
  }

  for (const [conditionId, state] of Object.entries(fresh)) {
    // Storage mutations and their retained-winner readbacks deliberately sit
    // outside the provider catch so the route's storage boundary owns faults.
    states[conditionId] = await cache.set(
      judgmentKey({ puzzleId: puzzle.id, conditionId, answer, model: env.model }),
      state,
    );
  }

  return {
    status: "judged",
    states,
    confidences,
    model: env.model,
    judgmentVersion: `${JUDGE_PROMPT_VERSION}:${env.model}`,
  };
}
