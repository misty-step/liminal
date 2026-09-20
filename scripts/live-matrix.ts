#!/usr/bin/env bun
/**
 * Live deck matrix — required calibration evidence.
 *
 * Fixture tests do not establish live-model calibration. This script sends
 * every published puzzle's verified answers and tested near misses through the
 * live Jev judge and records the per-condition verdict matrix.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... bun run scripts/live-matrix.ts
 *   TYPESAFE_API_KEY=... bun run scripts/live-matrix.ts
 *
 * Exit code 0 only when every row matches its authored expectation.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DECK } from "../src/lib/liminal/deck";
import { judgeAnswer, judgeEnvFrom, memoryCache } from "../src/lib/liminal/typeSafe";
import { normalizeAnswer } from "../src/lib/liminal/normalize";

const env = judgeEnvFrom(process.env);
if (!env) {
  console.error(
    "No judge credentials. Set OPENROUTER_API_KEY or TYPESAFE_API_KEY. The matrix is REQUIRED before release.",
  );
  process.exit(2);
}

interface Row {
  puzzleId: string;
  kind: "answer" | "near-miss";
  answer: string;
  expected: Record<string, string>;
  actual: Record<string, string> | null;
  status: string;
  ok: boolean;
}

const cache = memoryCache();
const rows: Row[] = [];

for (const puzzle of DECK) {
  const cases: { kind: Row["kind"]; answer: string; expected: Record<string, string> }[] = [];
  for (const answer of puzzle.judgments.answers) {
    cases.push({
      kind: "answer",
      answer,
      expected: Object.fromEntries(puzzle.conditions.map((c) => [c.id, "inside"])),
    });
  }
  for (const nearMiss of puzzle.judgments.nearMisses) {
    cases.push({
      kind: "near-miss",
      answer: nearMiss.answer,
      expected: Object.fromEntries(
        puzzle.conditions.map((c) => [c.id, c.id === nearMiss.fails ? "close" : "inside"]),
      ),
    });
  }

  for (const testCase of cases) {
    const result = await judgeAnswer({
      puzzle,
      answer: testCase.answer,
      env,
      cache,
      timeoutMs: 8000,
    });
    const actual = result.status === "judged" ? result.states : null;
    const ok =
      actual !== null &&
      puzzle.conditions.every((c) => actual[c.id] === testCase.expected[c.id]);
    rows.push({
      puzzleId: puzzle.id,
      kind: testCase.kind,
      answer: testCase.answer,
      expected: testCase.expected,
      actual,
      status: result.status,
      ok,
    });
    const mark = ok ? "ok " : "MISS";
    console.log(
      `${mark} ${puzzle.id} ${testCase.kind} "${testCase.answer}" -> ${JSON.stringify(actual)} (expected ${JSON.stringify(testCase.expected)})`,
    );
  }
}

const failures = rows.filter((row) => !row.ok);
const summary = {
  at: new Date().toISOString(),
  model: env.model,
  url: env.url,
  rows: rows.length,
  failures: failures.length,
  detail: rows,
};

const dir = join(process.cwd(), "evidence");
await mkdir(dir, { recursive: true });
const file = join(dir, `live-matrix-${summary.at.replace(/[:.]/g, "-")}.json`);
await writeFile(file, JSON.stringify(summary, null, 2), "utf8");

console.log(`\n${rows.length - failures.length}/${rows.length} rows match. Evidence: ${file}`);
if (failures.length > 0) {
  console.error("Mismatched rows (fix the deck or recalibrate before release):");
  for (const row of failures) {
    console.error(`  ${row.puzzleId} "${row.answer}" actual=${JSON.stringify(row.actual)}`);
  }
  process.exit(1);
}
console.log("Live matrix clean. Note: normalized answers only; no player data leaves this script.");
void normalizeAnswer;
