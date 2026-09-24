/**
 * The proposer's guide, draft schema, and revision step. Concepts come from
 * the funnel (funnel.ts); the proposer only expands survivors and revises them
 * against the critic's report. It proposes; Jev decides.
 */
import type { CriticReport } from "./critic";
import { regionPrompt } from "./critic";
import { type Draft, draftToPuzzle } from "./draft";
import type { Budget } from "./openrouter";
import { type ChatOptions, chatJson } from "./openrouter";

export const AUTHORING_GUIDE = `You design puzzles for Liminal, a daily word game.

THE GAME: three labeled circles overlap. Players fill four regions by naming real things:
- center: inside all three circles
- c1 region: inside circles 2 and 3 but NOT circle 1
- c2 region: inside circles 1 and 3 but NOT circle 2
- c3 region: inside circles 1 and 2 but NOT circle 3
An AI judge decides, per circle, whether a word is inside, borderline, or outside. A word fills a region only if every circle is a clean yes or clean no.

WHAT MAKES A GOOD PUZZLE:
- The circles pull against each other, so the center is a small satisfying overlap, not the obvious default.
- Every region has MANY answers an ordinary adult would think of within a minute. A region whose only answers are obscure or technical is a failure.
- At least one region needs a lateral leap that makes players smile (a walnut has a shell and you eat it but it doesn't live in water; a kite has a tail and flies but isn't alive).
- Short, crisp labels: at most 24 characters. The optional clarifier (detail) is at most 40 characters, or empty. The judge rubric carries the precise rules; the board does not.
- Answers must be things people would accept without a technicality: no brand names, fictional characters, or stretch readings of a condition.
- Everyday vocabulary. A family-friendly subject.

WHAT BREAKS THE JUDGE (learned from calibration, obey strictly):
- Conditions must be clear properties with confident yes AND confident no answers. Avoid vague degrees ("big", "old"), taste, or anything people argue about.
- Avoid conditions that ask whether an idiom or phrase exists ("you can make it"); the judge is unreliable on idioms. Wordplay is fine when framed as a property of the thing ("has a part called a head").
- Avoid bare words with many senses as intended answers (test, stand, note); prefer specific nouns.
- Judge questions refer to the word as \`answer\` in backticks, are self-contained, and contain no examples.
- Each condition gets three rubric levels: yes (clearly satisfies), partly (borderline), no (clearly does not).`;

export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["drafts"],
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "mode", "theme", "conditions", "answers"],
        properties: {
          slug: { type: "string", description: "kebab-case, 2 to 4 words, e.g. shell-water-eat" },
          mode: { type: "string", enum: ["literal", "wordplay"] },
          theme: {
            type: "string",
            description: "one sentence: why these circles pull against each other",
          },
          conditions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "detail", "judge", "yes", "partly", "no"],
              properties: {
                label: { type: "string" },
                detail: { type: "string", description: "optional clarifier line, or empty string" },
                judge: { type: "string" },
                yes: { type: "string" },
                partly: { type: "string" },
                no: { type: "string" },
              },
            },
          },
          answers: {
            type: "object",
            additionalProperties: false,
            required: ["center", "c1", "c2", "c3"],
            properties: {
              center: { type: "array", items: { type: "string" } },
              c1: { type: "array", items: { type: "string" } },
              c2: { type: "array", items: { type: "string" } },
              c3: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

export function parseDrafts(value: unknown): Draft[] {
  const drafts = value && typeof value === "object" ? Reflect.get(value, "drafts") : null;
  return Array.isArray(drafts) ? drafts : [];
}

/** Feedback the proposer can act on: what Jev rejected, what ordinary guesses missed. */
export function feedbackFor(draft: Draft, report: CriticReport): string {
  const puzzle = draftToPuzzle(draft);
  const lines = [`Critic verdict for "${draft.slug}": ${report.failures.join("; ") || "passes"}.`];
  for (const r of report.regions) {
    const where = (states: Record<string, string>) =>
      Object.entries(states)
        .map(([id, s]) => `${id}:${s}`)
        .join(" ");
    lines.push(
      `Region ${r.target} (${regionPrompt(puzzle, r.target)}): judge's existence gauge ${r.existence.toFixed(2)}; confirmed ${r.confirmed.join(", ") || "none"}.`,
      `  Rejected by the judge: ${r.rejected.map((x) => `${x.word} [${where(x.states)}]`).join(", ") || "none"}.`,
      `  Ordinary guesses that landed: ${r.naturalHits.join(", ") || "none"}; missed: ${r.naturalMisses.map((m) => `${m.word} [${where(m.states)}]`).join(", ") || "none"}.`,
    );
  }
  return lines.join("\n");
}

export async function reviseDraft(options: {
  apiKey: string;
  model: string;
  budget: Budget;
  draft: Draft;
  report: CriticReport;
  reasoning?: ChatOptions["reasoning"];
}): Promise<Draft | null> {
  const result = await chatJson({
    reasoning: options.reasoning,
    apiKey: options.apiKey,
    model: options.model,
    budget: options.budget,
    schemaName: "puzzle_drafts",
    schema: DRAFT_SCHEMA,
    temperature: 0.7,
    system: AUTHORING_GUIDE,
    user: [
      "Revise this puzzle so it passes the critic. You may reword conditions, sharpen rubric levels, swap one circle, and replace answers.",
      "If a region's existence gauge is low, nothing real fits it: change a condition. If the gauge is high but your answers were rejected, keep the conditions and supply better answers. If ordinary guesses miss, the condition boundary is wrong for how people think: change the condition, don't just add obscure answers.",
      "Return exactly one draft in `drafts`. Keep the slug unless you swap a circle.",
      `Current draft:\n${JSON.stringify(options.draft)}`,
      feedbackFor(options.draft, options.report),
    ].join("\n\n"),
  });
  return parseDrafts(result)[0] ?? null;
}
