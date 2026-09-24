#!/usr/bin/env bun
/**
 * Puzzle generator. A cheap model proposes many bare concepts; Jev screens
 * them (region existence, then whether ordinary guesses land); only survivors
 * are expanded into full drafts, critiqued (existence, findability,
 * robustness, taste, board fit), and revised against the critic's report. Only puzzles that pass every check are marked
 * accepted. Nothing enters the deck here: accepted candidates go through
 * `bun run puzzles:promote` and then the live matrix.
 *
 *   pass-env run -e OPENROUTER_API_KEY=workstation/LIMINAL_OPENROUTER_API_KEY \
 *     -e LIMINAL_GENERATOR_API_KEY=<a separate generation key> -- \
 *     bun run puzzles:generate [--concepts 20] [--keep 6] [--rounds 2] [--budget 2] [--hint "..."]
 *
 * The proposer and player models bill LIMINAL_GENERATOR_API_KEY, never the
 * judge key: generation must not be able to drain the key the live game
 * judges with. Jev critique calls use the judge key; they cost fractions of a cent.
 *
 * Writes content/candidates/<id>.json per draft (accepted or not, with its
 * report) and content/candidates/run-<timestamp>.json summarizing the run.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DECK } from "../../src/lib/liminal/deck";
import { judgeEnvFrom } from "../../src/lib/liminal/typeSafe";
import { type CriticReport, critique } from "./critic";
import { type Draft, draftToPuzzle, isWellFormed, slugify } from "./draft";
import { expandConcept, proposeConcepts, repairConcepts, screenConcepts } from "./funnel";
import { Budget, BudgetExceeded, ProviderLimit } from "./openrouter";
import { reviseDraft } from "./proposer";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    concepts: { type: "string", default: "20" },
    keep: { type: "string", default: "6" },
    rounds: { type: "string", default: "2" },
    budget: { type: "string", default: "2" },
    hint: { type: "string" },
    proposer: { type: "string", default: "z-ai/glm-5.3" },
    reasoning: { type: "string", default: "low" },
    player: { type: "string", default: "google/gemini-3-flash-preview" },
    out: { type: "string", default: "content/candidates" },
  },
});

const judgeEnv = judgeEnvFrom(process.env);
const openRouterKey = process.env.LIMINAL_GENERATOR_API_KEY;
if (!judgeEnv || !openRouterKey) {
  console.error(
    "Set the judge key (OPENROUTER_API_KEY or TYPESAFE_API_KEY) and LIMINAL_GENERATOR_API_KEY.",
  );
  process.exit(2);
}
if (openRouterKey === judgeEnv.apiKey) {
  console.error("LIMINAL_GENERATOR_API_KEY must differ from the judge key.");
  process.exit(2);
}
const env = judgeEnv;
const apiKey = openRouterKey;
const budget = new Budget(Number(values.budget));
const REASONING = ["none", "low", "medium", "high"] as const;
const reasoning = REASONING.find((r) => r === values.reasoning);
if (!reasoning) {
  console.error(`--reasoning must be one of ${REASONING.join(", ")}`);
  process.exit(2);
}
const rounds = Number(values.rounds);
const outDir = join(process.cwd(), values.out);
await mkdir(outDir, { recursive: true });

// Avoid the deck and every earlier candidate, so batches do not repeat themselves.
const earlier: string[] = [];
for (const file of await readdir(outDir)) {
  if (
    !file.endsWith(".json") ||
    file.startsWith("run-") ||
    file.startsWith("drafts-") ||
    file.startsWith("screen-")
  )
    continue;
  const raw: unknown = JSON.parse(await readFile(join(outDir, file), "utf8"));
  const puzzle = raw && typeof raw === "object" ? Reflect.get(raw, "puzzle") : null;
  const conditions =
    puzzle && typeof puzzle === "object" ? Reflect.get(puzzle, "conditions") : null;
  if (Array.isArray(conditions)) {
    earlier.push(
      `${file.replace(/\.json$/, "")} (${conditions.map((c) => String(Reflect.get(c ?? {}, "text"))).join(" / ")})`,
    );
  }
}
const avoid = [
  ...DECK.map((p) => `${p.id} (${p.conditions.map((c) => c.text).join(" / ")})`),
  ...earlier,
];
const summary: {
  slug: string;
  accepted: boolean;
  rounds: number;
  failures: string[];
  taste: number;
}[] = [];
const yieldCounts = {
  proposed: 0,
  survivedBeforeRepair: 0,
  repaired: 0,
  survivedAfterRepair: 0,
  expanded: 0,
};

async function evaluate(draft: Draft): Promise<CriticReport> {
  const puzzle = draftToPuzzle(draft);
  return critique({
    env,
    apiKey,
    playerModel: values.player,
    budget,
    puzzle,
    proposed: draft.answers,
  });
}

try {
  const concepts = await proposeConcepts({
    apiKey,
    model: values.proposer,
    budget,
    count: Number(values.concepts),
    avoid,
    hint: values.hint,
    reasoning,
  });
  yieldCounts.proposed = concepts.length;
  console.log(`Proposed ${concepts.length} concepts. Spent $${budget.spent.toFixed(3)}.`);
  const screened = await screenConcepts({
    env,
    apiKey,
    playerModel: values.player,
    budget,
    concepts,
    keep: Number(values.keep),
  });
  yieldCounts.survivedBeforeRepair = screened.filter((score) => score.kept).length;
  const repairs = await repairConcepts({
    apiKey,
    model: values.proposer,
    budget,
    scores: screened,
  });
  yieldCounts.repaired = repairs.length;
  const repairedScores = repairs.length
    ? await screenConcepts({
        env,
        apiKey,
        playerModel: values.player,
        budget,
        concepts: repairs,
        keep: Number(values.keep),
      })
    : [];
  screened.push(...repairedScores);
  yieldCounts.survivedAfterRepair = screened.filter((score) => score.kept).length;
  for (const s of screened) {
    console.log(
      `  ${s.kept ? "keep" : "drop"} ${s.concept.slug} [${s.concept.labels.join(" / ")}] find ${s.findability.map((f) => f.toFixed(2)).join(" ") || "-"}: ${s.reason}`,
    );
  }
  const expanded = await Promise.all(
    screened
      .filter((s) => s.kept)
      .map((s) =>
        expandConcept({
          apiKey,
          model: values.proposer,
          budget,
          concept: s.concept,
          reasoning,
        }).catch((error: unknown) => {
          if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
          console.error(
            `expand ${s.concept.slug} failed: ${error instanceof Error ? error.message : error}`,
          );
          return null;
        }),
      ),
  );
  const drafts = expanded.filter((d): d is Draft => d !== null && isWellFormed(d));
  yieldCounts.expanded = drafts.length;
  await writeFile(
    join(outDir, `screen-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    `${JSON.stringify(screened, null, 2)}\n`,
  );
  console.log(`Expanded ${drafts.length} drafts. Spent $${budget.spent.toFixed(3)}.`);
  // Keep paid-for drafts even if evaluation fails later.
  await writeFile(
    join(outDir, `drafts-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    `${JSON.stringify(drafts, null, 2)}\n`,
  );

  for (let draft of drafts) {
    const slug = slugify(draft.slug);
    if (DECK.some((p) => p.id === slug)) continue;
    let report: CriticReport;
    try {
      report = await evaluate(draft);
    } catch (error) {
      if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
      console.error(`${slug}: skipped, ${error instanceof Error ? error.message : error}`);
      continue;
    }
    let round = 0;
    console.log(`\n${slug} round 0: ${report.accepted ? "PASS" : report.failures.join("; ")}`);
    // Keep the last evaluated draft even if a revision call stops the run.
    let stop: unknown = null;
    try {
      while (!report.accepted && round < rounds) {
        round += 1;
        const revised = await reviseDraft({
          apiKey,
          model: values.proposer,
          budget,
          draft,
          report,
          reasoning,
        });
        if (!revised || !isWellFormed(revised)) break;
        draft = revised;
        report = await evaluate(draft);
        console.log(
          `${slug} round ${round}: ${report.accepted ? "PASS" : report.failures.join("; ")}`,
        );
      }
    } catch (error) {
      // A provider limit or budget stops the run after saving this draft; any
      // other failure (a malformed reply) just ends revisions for this draft.
      if (error instanceof BudgetExceeded || error instanceof ProviderLimit) stop = error;
      else
        console.error(
          `${slug}: revision failed, ${error instanceof Error ? error.message : error}`,
        );
    }
    const puzzle = draftToPuzzle(draft, report);
    await writeFile(
      join(outDir, `${puzzle.id}.json`),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), accepted: report.accepted, theme: draft.theme, puzzle, report }, null, 2)}\n`,
    );
    summary.push({
      slug: puzzle.id,
      accepted: report.accepted,
      rounds: round,
      failures: report.failures,
      taste: Number(report.taste.probability.toFixed(2)),
    });
    if (stop) throw stop;
  }
} catch (error) {
  if (!(error instanceof BudgetExceeded || error instanceof ProviderLimit)) throw error;
  console.error(`\nStopped: ${error.message}`);
}

const at = new Date().toISOString();
await writeFile(
  join(outDir, `run-${at.replace(/[:.]/g, "-")}.json`),
  `${JSON.stringify({ at, proposer: values.proposer, reasoning, player: values.player, spentUsd: budget.spent, calls: budget.calls, yield: yieldCounts, summary }, null, 2)}\n`,
);
const accepted = summary.filter((s) => s.accepted);
console.log(
  `\n${accepted.length}/${summary.length} accepted: ${accepted.map((s) => s.slug).join(", ") || "none"}. Spent $${budget.spent.toFixed(3)} (proposer + player; judge calls are billed separately and are tiny).`,
);
