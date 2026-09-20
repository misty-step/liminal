#!/usr/bin/env bun
/** Print the puzzle validation matrix as markdown (deck ground truth + test coverage). */
import { DECK } from "../src/lib/liminal/deck";
import { evaluateGuess } from "../src/lib/liminal/evaluator";
import { normalizeAnswer } from "../src/lib/liminal/normalize";

const lines: string[] = [
  "# Puzzle validation matrix",
  "",
  "Generated from `src/lib/liminal/deck.ts` — the same data the executable tests assert.",
  "A verified answer yields Inside on every condition. A near miss yields Close on",
  "exactly the listed condition and Inside elsewhere. Both are enforced by",
  "`__tests__/deck.test.ts` (51-test suite).",
  "",
];

for (const puzzle of DECK) {
  lines.push(`## ${puzzle.title} (${puzzle.id}, ${puzzle.mode})`, "");
  lines.push("| answer | kind | " + puzzle.conditions.map((c) => c.id).join(" | ") + " |");
  lines.push("| --- | --- | " + puzzle.conditions.map(() => "---").join(" | ") + " |");
  for (const answer of puzzle.judgments.answers) {
    const feedback = evaluateGuess(puzzle, answer);
    lines.push(
      `| ${answer} | verified answer | ` +
        puzzle.conditions
          .map((c) => feedback.states[c.id])
          .join(" | ") +
        " |",
    );
  }
  for (const nearMiss of puzzle.judgments.nearMisses) {
    const feedback = evaluateGuess(puzzle, nearMiss.answer);
    lines.push(
      `| ${nearMiss.answer} | near miss (fails ${nearMiss.fails}) | ` +
        puzzle.conditions
          .map((c) => feedback.states[c.id])
          .join(" | ") +
        " |",
    );
  }
  lines.push("");
  lines.push(`Conditions: ${puzzle.conditions.map((c) => `${c.id} = ${c.text}`).join("; ")}`);
  lines.push("");
  const echo = normalizeAnswer(puzzle.conditions[0].text);
  const echoCheck = evaluateGuess(puzzle, puzzle.conditions[0].text);
  lines.push(`Clue-echo rejection sample: "${echo}" -> ${echoCheck.rejected ?? "not rejected"}`);
  lines.push("");
}

console.log(lines.join("\n"));