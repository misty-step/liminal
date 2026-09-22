#!/usr/bin/env bun
/**
 * Live deck matrix — required calibration evidence.
 *
 * Fixture tests do not establish live-model calibration. This script sends
 * every published puzzle's verified answers, tested near misses, and held-out
 * valid answers (deliberately NOT in the authored allowlist) through the live
 * Jev judge and records the per-condition verdict matrix with confidences.
 *
 * Expectations:
 * - verified answer: every condition inside.
 * - held-out valid answer: every condition inside (proves open-answer play).
 * - near miss: the authored failing condition is close or outside; the rest inside.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... bun run scripts/live-matrix.ts
 *   TYPESAFE_API_KEY=... bun run scripts/live-matrix.ts
 *
 * Exit code 0 only when every row matches its expectation. Failed matrices are
 * kept as evidence; never delete them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DECK, DECK_VERSION } from "../src/lib/liminal/deck";
import { judgeAnswer, judgeEnvFrom, memoryCache } from "../src/lib/liminal/typeSafe";
import { JUDGE_PROMPT_VERSION } from "../src/lib/liminal/judgment";
import { normalizeAnswer } from "../src/lib/liminal/normalize";

const env = judgeEnvFrom(process.env);
if (!env) {
  console.error(
    "No judge credentials. Set OPENROUTER_API_KEY or TYPESAFE_API_KEY. The matrix is REQUIRED before release.",
  );
  process.exit(2);
}

type Kind = "answer" | "near-miss" | "held-out";

interface Row {
  puzzleId: string;
  judgmentVersion: string;
  kind: Kind;
  answer: string;
  expected: Record<string, string>;
  actual: Record<string, string> | null;
  confidences: Record<string, number> | null;
  status: string;
  attempts: number;
  elapsedMs: number;
  ok: boolean;
}

function allInside(puzzle: (typeof DECK)[number]): Record<string, string> {
  return Object.fromEntries(puzzle.conditions.map((c) => [c.id, "inside"]));
}

const cache = memoryCache();
const rows: Row[] = [];

for (const puzzle of DECK) {
  const cases: { kind: Kind; answer: string; expected: Record<string, string> }[] = [];

  for (const answer of puzzle.judgments.answers) {
    cases.push({ kind: "answer", answer, expected: allInside(puzzle) });
  }
  for (const nearMiss of puzzle.judgments.nearMisses) {
    cases.push({
      kind: "near-miss",
      answer: nearMiss.answer,
      // The failed condition must simply not be inside; close or outside both
      // count as honest per-condition discrimination.
      expected: Object.fromEntries(
        puzzle.conditions.map((c) => [
          c.id,
          c.id === nearMiss.fails ? "outside-or-close" : "inside",
        ]),
      ),
    });
  }
  for (const answer of puzzle.judgments.heldOut ?? []) {
    cases.push({ kind: "held-out", answer, expected: allInside(puzzle) });
  }

  for (const testCase of cases) {
    const startedAt = Date.now();
    let attempts = 0;
    let result: Awaited<ReturnType<typeof judgeAnswer>>;
    // Transport failures (timeout, upstream error, malformed payload) are
    // retried with backoff. Honest uncertainty is a real outcome and is
    // never re-rolled into a confident one.
    for (;;) {
      result = await judgeAnswer({
        puzzle,
        answer: testCase.answer,
        env,
        cache,
        timeoutMs: 15000,
      });
      attempts += 1;
      if (result.status === "judged") break;
      if (result.reason === "uncertain" || result.reason === "not-configured") break;
      if (attempts >= 3) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempts));
    }
    const actual = result.status === "judged" ? result.states : null;
    const confidences = result.status === "judged" ? (result.confidences ?? {}) : null;
    const ok =
      actual !== null &&
      puzzle.conditions.every((c) => {
        const want = testCase.expected[c.id];
        if (want === "inside") return actual[c.id] === "inside";
        return actual[c.id] === "close" || actual[c.id] === "outside";
      });
    rows.push({
      puzzleId: puzzle.id,
      judgmentVersion: puzzle.judgments.version,
      kind: testCase.kind,
      answer: testCase.answer,
      expected: testCase.expected,
      actual,
      confidences,
      status: result.status === "judged" ? "judged" : `unavailable:${result.reason}`,
      attempts,
      elapsedMs: Date.now() - startedAt,
      ok,
    });
    const mark = ok ? "ok " : "MISS";
    console.log(
      `${mark} ${puzzle.id} ${testCase.kind} "${testCase.answer}" -> ${JSON.stringify(actual)} conf=${JSON.stringify(confidences)} (expected ${JSON.stringify(testCase.expected)})`,
    );
  }
}

const failures = rows.filter((row) => !row.ok);
const byKind = (kind: Kind) => rows.filter((row) => row.kind === kind).length;
const summary = {
  at: new Date().toISOString(),
  deckVersion: DECK_VERSION,
  promptVersion: JUDGE_PROMPT_VERSION,
  model: env.model,
  url: env.url,
  rows: rows.length,
  answers: byKind("answer"),
  nearMisses: byKind("near-miss"),
  heldOut: byKind("held-out"),
  failures: failures.length,
  detail: rows,
};

const dir = join(process.cwd(), "evidence");
await mkdir(dir, { recursive: true });
const file = join(dir, `live-matrix-${summary.at.replace(/[:.]/g, "-")}.json`);
await writeFile(file, JSON.stringify(summary, null, 2), "utf8");

console.log(
  `\n${rows.length - failures.length}/${rows.length} rows match (${summary.answers} answers, ${summary.nearMisses} near misses, ${summary.heldOut} held-out). Evidence: ${file}`,
);
if (failures.length > 0) {
  console.error("Mismatched rows (fix the deck or recalibrate before release):");
  for (const row of failures) {
    console.error(
      `  ${row.puzzleId} ${row.kind} "${row.answer}" actual=${JSON.stringify(row.actual)} conf=${JSON.stringify(row.confidences)} status=${row.status} attempts=${row.attempts} elapsedMs=${row.elapsedMs}`,
    );
  }
  process.exit(1);
}
console.log("Live matrix clean. Note: normalized answers only; no player data leaves this script.");
void normalizeAnswer;
