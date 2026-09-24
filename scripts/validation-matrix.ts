#!/usr/bin/env bun
/** Print the puzzle validation matrix as markdown (deck ground truth + test coverage). */
import { DECK } from "../src/lib/liminal/deck";
import { evaluateGuess } from "../src/lib/liminal/evaluator";
import { landingOf, TARGETS } from "../src/lib/liminal/regions";

const REGION_NAME = { center: "center", c1: "outside c1", c2: "outside c2", c3: "outside c3" };

const lines: string[] = [
  "# Puzzle validation matrix",
  "",
  "Generated from `src/lib/liminal/deck.ts` — the same data the executable tests assert.",
  "A center answer yields Inside on every condition. A pair answer yields Outside on",
  "exactly the condition its region excludes and Inside elsewhere, so it fills that",
  "region. Both are enforced by `__tests__/deck.test.ts`.",
  "",
];

for (const puzzle of DECK) {
  const { conditions } = puzzle;
  lines.push(`## ${puzzle.id} (${puzzle.mode})`, "");
  lines.push(`Circles: ${conditions.map((c) => `${c.id} = ${c.text}`).join("; ")}`, "");
  lines.push(`| answer | region | ${conditions.map((c) => c.id).join(" | ")} | lands in |`);
  lines.push(`| --- | --- | ${conditions.map(() => "---").join(" | ")} | --- |`);
  for (const target of TARGETS) {
    const region = target === "center" ? puzzle.judgments.center : puzzle.judgments.pairs[target];
    for (const answer of region.answers) {
      const { states } = evaluateGuess(puzzle, answer);
      const landing = landingOf(states);
      lines.push(
        `| ${answer} | ${REGION_NAME[target]} | ${conditions.map((c) => states[c.id]).join(" | ")} | ${landing.kind === "target" ? REGION_NAME[landing.key] : landing.kind} |`,
      );
    }
  }
  const echoCheck = evaluateGuess(puzzle, conditions[0].text);
  lines.push(
    "",
    `Label-echo refusal sample: "${conditions[0].text}" -> ${echoCheck.rejected ?? "not refused"}`,
    "",
  );
}

console.log(lines.join("\n"));
