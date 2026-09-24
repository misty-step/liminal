/**
 * The concept funnel: Jev steers before anything expensive is written.
 *
 * 1. A cheap model proposes many bare concepts: three circle labels each,
 *    no rubrics, no answer lists. Short output, fast, nearly free.
 * 2. Jev gauges every region's existence from its description. Concepts with
 *    an empty region are dropped (fractions of a cent).
 * 3. The player model names ordinary guesses per region; Jev places them with
 *    a plain rubric built from the label. Concepts whose regions ordinary
 *    guesses cannot find are dropped.
 * 4. Only survivors are expanded into full drafts (judge rubrics and answers)
 *    and go through the full critique and revision loop.
 */
import { normalizeAnswer } from "../../src/lib/liminal/normalize";
import { parsePuzzle } from "../../src/lib/liminal/puzzleSchema";
import { TARGETS } from "../../src/lib/liminal/regions";
import type { JudgeEnv } from "../../src/lib/liminal/typeSafe";
import type { Puzzle } from "../../src/lib/liminal/types";
import { gaugeRegions, landsIn, naturalGuesses, placeWords, THRESHOLDS } from "./critic";
import type { Draft } from "./draft";
import { slugify } from "./draft";
import {
  type Budget,
  BudgetExceeded,
  type ChatOptions,
  chatJson,
  ProviderLimit,
} from "./openrouter";
import { AUTHORING_GUIDE, DRAFT_SCHEMA, parseDrafts } from "./proposer";

export interface Concept {
  slug: string;
  mode: "literal" | "wordplay";
  theme: string;
  labels: [string, string, string];
  details: [string, string, string];
}

export interface ConceptScore {
  concept: Concept;
  existence: number[];
  findability: number[];
  /** Ordinary player attempts and Jev's actual landing, retained for repair feedback. */
  guesses?: { target: string; hits: string[]; misses: { word: string; landing: string }[] }[];
  /** The weakest region decides: min over regions of findability. */
  score: number;
  kept: boolean;
  reason: string;
}

const SUBJECTS = [
  "household objects",
  "food and cooking",
  "animals and nature",
  "the human body and clothing",
  "places and buildings",
  "sports and games",
  "jobs and tools",
  "vehicles and travel",
  "music, art, and entertainment",
  "weather, seasons, and the outdoors",
];

const CONCEPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "mode", "theme", "labels", "details"],
        properties: {
          slug: { type: "string" },
          mode: { type: "string", enum: ["literal", "wordplay"] },
          theme: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          details: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function parseConcepts(value: unknown): Concept[] {
  const list = value && typeof value === "object" ? Reflect.get(value, "concepts") : null;
  if (!Array.isArray(list)) return [];
  const out: Concept[] = [];
  for (const item of list) {
    const labels = Reflect.get(item ?? {}, "labels");
    const details = Reflect.get(item ?? {}, "details");
    const slug = Reflect.get(item ?? {}, "slug");
    if (!Array.isArray(labels) || labels.length !== 3 || typeof slug !== "string") continue;
    if (!labels.every((l) => typeof l === "string" && l.trim())) continue;
    const detailList = Array.isArray(details) ? details : [];
    const detail = (i: number) =>
      typeof detailList[i] === "string" ? String(detailList[i]).trim() : "";
    out.push({
      slug: slugify(slug) || slugify(labels.join(" ")),
      mode: Reflect.get(item, "mode") === "wordplay" ? "wordplay" : "literal",
      theme: String(Reflect.get(item, "theme") ?? ""),
      labels: [labels[0].trim(), labels[1].trim(), labels[2].trim()],
      details: [detail(0), detail(1), detail(2)],
    });
  }
  return out;
}

/** One call, many concepts: labels only, so the reply stays short. */
export async function proposeConcepts(options: {
  apiKey: string;
  model: string;
  budget: Budget;
  count: number;
  avoid: readonly string[];
  reasoning?: ChatOptions["reasoning"];
  hint?: string;
}): Promise<Concept[]> {
  const perCall = 10;
  const calls = Math.ceil(options.count / perCall);
  const offset = Math.floor(Math.random() * SUBJECTS.length);
  const results = await Promise.all(
    Array.from({ length: calls }, (_, i) =>
      chatJson({
        apiKey: options.apiKey,
        model: options.model,
        budget: options.budget,
        reasoning: options.reasoning,
        maxTokens: 4000,
        schemaName: "puzzle_concepts",
        schema: CONCEPT_SCHEMA,
        temperature: 1,
        system: AUTHORING_GUIDE,
        user: [
          `Propose ${perCall} distinct puzzle CONCEPTS. For each, give only: a kebab-case slug, mode, a one-sentence theme, three circle labels (at most 24 characters each), and three clarifiers (at most 40 characters each, or empty strings). No rubrics, no answers.`,
          `Spread them across these subject areas: ${SUBJECTS.slice(offset + i * 3)
            .concat(SUBJECTS)
            .slice(0, 4)
            .join(", ")}.`,
          "Favor concepts where an ordinary adult could name several things for every region within a minute.",
          options.hint ? `Direction from the editor: ${options.hint}` : "",
          options.avoid.length ? `Do not repeat these: ${options.avoid.join("; ")}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      })
        .then(parseConcepts)
        .catch((error: unknown) => {
          if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
          console.error(`concept call failed: ${error instanceof Error ? error.message : error}`);
          return [];
        }),
    ),
  );
  const seen = new Set<string>();
  return results.flat().filter((c) => !seen.has(c.slug) && Boolean(seen.add(c.slug)));
}

/** A screening puzzle: plain rubrics built from the labels, enough for Jev to place words. */
export function conceptPuzzle(concept: Concept): Puzzle {
  const empty = { answers: [], heldOut: [] };
  return parsePuzzle(
    {
      id: concept.slug || "concept",
      mode: concept.mode,
      judgeStatus: "uncalibrated",
      conditions: (["c1", "c2", "c3"] as const).map((id, i) => {
        const label = concept.labels[i];
        const detail = concept.details[i];
        return {
          id,
          text: label,
          ...(detail ? { detail } : {}),
          judge: `Consider \`answer\`. Is this true of it: "${label}"${detail ? ` (${detail})` : ""}?`,
          levels: {
            yes: "Clearly true of it.",
            partly: "True only sometimes, in part, or in a stretched sense.",
            no: "Not true of it.",
          },
        };
      }),
      judgments: { version: "concept", center: empty, pairs: { c1: empty, c2: empty, c3: empty } },
    },
    `concept:${concept.slug}`,
  );
}

/** Screen concepts with Jev: existence first (free), then findability. */
export async function screenConcepts(options: {
  env: JudgeEnv;
  apiKey: string;
  playerModel: string;
  budget: Budget;
  concepts: readonly Concept[];
  keep: number;
}): Promise<ConceptScore[]> {
  const scores: ConceptScore[] = [];
  for (const concept of options.concepts) {
    let puzzle: Puzzle;
    try {
      puzzle = conceptPuzzle(concept);
    } catch {
      continue;
    }
    const tooLong =
      concept.labels.some((l) => l.length > THRESHOLDS.maxLabelChars) ||
      concept.details.some((d) => d.length > THRESHOLDS.maxDetailChars);
    const gauges = await gaugeRegions(options.env, puzzle);
    const existence = TARGETS.map((t) => gauges[t]);
    if (tooLong || existence.some((g) => g < THRESHOLDS.minExistenceGauge)) {
      scores.push({
        concept,
        existence,
        findability: [],
        score: 0,
        kept: false,
        reason: tooLong ? "label too long" : "a region has nothing real in it",
      });
      continue;
    }
    const natural = await naturalGuesses({
      apiKey: options.apiKey,
      model: options.playerModel,
      budget: options.budget,
      puzzle,
    });
    const placed = await placeWords(
      options.env,
      puzzle,
      TARGETS.flatMap((t) => natural[t]),
    );
    const guesses = TARGETS.map((target) => {
      const hits: string[] = [];
      const misses: { word: string; landing: string }[] = [];
      for (const word of natural[target]) {
        const placement = placed.get(normalizeAnswer(word));
        if (landsIn(placement, target)) hits.push(word);
        else
          misses.push({
            word,
            landing: placement ? JSON.stringify(placement) : "judge unavailable",
          });
      }
      return { target, hits, misses };
    });
    const findability = guesses.map(
      (region) => region.hits.length / (region.hits.length + region.misses.length) || 0,
    );
    scores.push({
      concept,
      existence,
      findability,
      guesses,
      score: Math.min(...findability),
      kept: false,
      reason: "",
    });
  }
  const ranked = scores
    .filter((s) => s.findability.length && s.score >= THRESHOLDS.minFindability)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.keep);
  for (const s of scores) {
    s.kept = ranked.includes(s);
    if (!s.reason)
      s.reason = s.kept
        ? "kept"
        : s.score < THRESHOLDS.minFindability
          ? "ordinary guesses miss a region"
          : "ranked below the cut";
  }
  return scores;
}

/**
 * Only findability-only failures with a salvageable weakest region are repaired.
 * One batched model call repairs several concepts; the entire original placement
 * record is shown so a changed label fixes the boundary, not just its word list.
 */
export async function repairConcepts(options: {
  apiKey: string;
  model: string;
  budget: Budget;
  scores: readonly ConceptScore[];
}): Promise<Concept[]> {
  const eligible = options.scores.filter(
    (score) =>
      !score.kept && score.reason === "ordinary guesses miss a region" && score.score >= 0.125,
  );
  const repaired: Concept[] = [];
  for (let i = 0; i < eligible.length; i += 6) {
    const batch = eligible.slice(i, i + 6);
    let response: unknown;
    try {
      response = await chatJson({
        apiKey: options.apiKey,
        model: options.model,
        budget: options.budget,
        reasoning: "low",
        maxTokens: 12_000,
        schemaName: "puzzle_concept_repairs",
        schema: CONCEPT_SCHEMA,
        temperature: 0.5,
        system: AUTHORING_GUIDE,
        user: [
          `Return exactly ${batch.length} repaired concepts in the same order. Change usually ONE circle label/clarifier per concept to make ordinary first guesses land in every region. Preserve each concept's theme; do not substitute obscure words. Give each a fresh slug.`,
          JSON.stringify(
            batch.map((score) => ({
              concept: score.concept,
              existence: score.existence,
              findability: score.findability,
              guesses: score.guesses,
            })),
          ),
        ].join("\n"),
      });
    } catch (error) {
      if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
      console.error(`concept repair failed: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    for (const [index, concept] of parseConcepts(response).slice(0, batch.length).entries()) {
      if (
        concept.labels.some((label) => label.length > THRESHOLDS.maxLabelChars) ||
        concept.details.some((detail) => detail.length > THRESHOLDS.maxDetailChars)
      )
        continue;
      if (concept.slug === batch[index].concept.slug) concept.slug = `${concept.slug}-repair`;
      repaired.push(concept);
    }
  }
  return repaired;
}
/** Expand a surviving concept into a full draft: judge rubrics and answer lists. */
export async function expandConcept(options: {
  apiKey: string;
  model: string;
  budget: Budget;
  concept: Concept;
  reasoning?: ChatOptions["reasoning"];
}): Promise<Draft | null> {
  const { concept } = options;
  const result = await chatJson({
    apiKey: options.apiKey,
    model: options.model,
    budget: options.budget,
    reasoning: options.reasoning,
    schemaName: "puzzle_drafts",
    schema: DRAFT_SCHEMA,
    temperature: 0.6,
    system: AUTHORING_GUIDE,
    user: [
      "Turn this screened concept into ONE full draft, returned as the single item of `drafts`.",
      "Keep the three labels and clarifiers exactly. Write each condition's judge question and yes/partly/no levels so the judge answers confidently, and list at least 10 answers per region, most common first.",
      JSON.stringify(concept),
    ].join("\n"),
  });
  return parseDrafts(result)[0] ?? null;
}
