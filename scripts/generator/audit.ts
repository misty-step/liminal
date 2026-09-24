#!/usr/bin/env bun
/**
 * Audit published puzzles with the critic: do all four regions have answers
 * Jev confirms, and do the guesses an ordinary player tries actually land?
 *
 *   pass-env run -e OPENROUTER_API_KEY=workstation/LIMINAL_OPENROUTER_API_KEY \
 *     -e LIMINAL_GENERATOR_API_KEY=<a separate generation key> -- \
 *     bun run puzzles:audit [--only id,id] [--budget 1]
 *
 * Writes evidence/puzzle-audit-<timestamp>.json and exits 1 if any puzzle fails.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DECK } from "../../src/lib/liminal/deck";
import { TARGETS } from "../../src/lib/liminal/regions";
import { judgeEnvFrom } from "../../src/lib/liminal/typeSafe";
import type { TargetKey } from "../../src/lib/liminal/types";
import { critique, regionPrompt } from "./critic";
import { Budget } from "./openrouter";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    only: { type: "string" },
    budget: { type: "string", default: "1" },
    player: { type: "string", default: "google/gemini-3-flash-preview" },
  },
});

const judgeEnv = judgeEnvFrom(process.env);
const openRouterKey = process.env.LIMINAL_GENERATOR_API_KEY;
if (!judgeEnv || !openRouterKey) {
  console.error("Set the judge key and LIMINAL_GENERATOR_API_KEY (player model).");
  process.exit(2);
}
if (openRouterKey === judgeEnv.apiKey) {
  console.error("LIMINAL_GENERATOR_API_KEY must differ from the judge key.");
  process.exit(2);
}
const env = judgeEnv;
const apiKey = openRouterKey;
const only = values.only?.split(",").filter(Boolean);
const unknown = only?.filter((id) => !DECK.some((p) => p.id === id)) ?? [];
if (unknown.length) {
  console.error(`Unknown puzzle id: ${unknown.join(", ")}`);
  process.exit(2);
}
const budget = new Budget(Number(values.budget));
const puzzles = DECK.filter((p) => !only || only.includes(p.id));

const reports = [];
for (const puzzle of puzzles) {
  const proposed: Record<TargetKey, string[]> = { center: [], c1: [], c2: [], c3: [] };
  for (const t of TARGETS) {
    const region = t === "center" ? puzzle.judgments.center : puzzle.judgments.pairs[t];
    proposed[t] = [...region.answers, ...region.heldOut];
  }
  const report = await critique({
    env,
    apiKey,
    playerModel: values.player,
    budget,
    puzzle,
    proposed,
  });
  reports.push(report);
  console.log(
    `\n${report.accepted ? "PASS" : "FAIL"} ${puzzle.id}  taste ${report.taste.probability.toFixed(2)}`,
  );
  for (const r of report.regions) {
    const misses = r.naturalMisses.map((m) => m.word).join(", ");
    console.log(
      `  ${regionPrompt(puzzle, r.target)}\n    confirmed ${r.confirmed.length}  findable ${r.naturalHits.length}/${r.naturalHits.length + r.naturalMisses.length}  hits: ${r.naturalHits.join(", ") || "-"}  misses: ${misses || "-"}`,
    );
  }
  for (const f of report.failures) console.log(`  ! ${f}`);
}

const at = new Date().toISOString();
const dir = join(process.cwd(), "evidence");
await mkdir(dir, { recursive: true });
const file = join(dir, `puzzle-audit-${at.replace(/[:.]/g, "-")}.json`);
await writeFile(
  file,
  `${JSON.stringify({ at, playerModel: values.player, spentUsd: budget.spent, reports }, null, 2)}\n`,
);
console.log(
  `\n${reports.filter((r) => r.accepted).length}/${reports.length} puzzles pass. Spent $${budget.spent.toFixed(4)}. Evidence: ${file}`,
);
process.exit(reports.every((r) => r.accepted) ? 0 : 1);
