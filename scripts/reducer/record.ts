/** Capture real UI attempts; persist only the reducer boundary, not timing or telemetry. */
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { evaluateGuess } from "../../src/lib/liminal/evaluator";
import type { GuessEvent } from "../../src/lib/liminal/guessReducer";
import { reduceGuess } from "../../src/lib/liminal/guessReducer";
import { parsePuzzle } from "../../src/lib/liminal/puzzleSchema";
import { boardState } from "../../src/lib/liminal/regions";
import { emptyProgress, parseProgress, storageKey } from "../../src/lib/liminal/storage";

const base = process.env.BASE;
const out = process.env.OUT;
if (!base || !out) throw new Error("BASE (Worker URL) and OUT (scratch directory) are required");
if (!["127.0.0.1", "localhost", "liminal.mistystep.io"].includes(new URL(base).hostname))
  throw new Error("Capture requires a local Worker or production read-only target");
const response = await fetch(`${base}/api/today`);
const payload: unknown = await response.json();
if (!response.ok || !payload || typeof payload !== "object") throw new Error("No daily puzzle");
const puzzle = parsePuzzle(Reflect.get(payload, "puzzle"), "daily capture");
const date: unknown = Reflect.get(payload, "date");
const number: unknown = Reflect.get(payload, "number");
assert.equal(typeof date, "string");
assert.equal(typeof number, "number");
const health: unknown = await (await fetch(`${base}/api/health`)).json();
const revision = health && typeof health === "object" ? Reflect.get(health, "revision") : null;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (
      new URL(request.url()).origin !== new URL(base).origin ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      await route.abort();
    } else await route.continue();
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator("#guess").waitFor();
  let state = emptyProgress(puzzle.id, 0);
  const initial = state;
  const events: GuessEvent[] = [];
  const observed: { answer: string; status: string; guesses: number; filled: number }[] = [];
  const words = [
    puzzle.conditions[0].text,
    puzzle.judgments.center.answers[0],
    puzzle.judgments.center.answers[0],
    puzzle.judgments.center.answers[1],
    ...Object.values(puzzle.judgments.pairs).map((region) => region.answers[0]),
  ];
  for (const answer of words) {
    const feedback = evaluateGuess(
      puzzle,
      answer,
      state.guesses.map((guess) => guess.answer),
    );
    assert.ok(
      !feedback.needsJudgment,
      "Capture uses authored answers and deterministic refusals only",
    );
    await page.locator("#guess").fill(answer);
    await page.locator('.guess button[type="submit"]').click();
    await page.locator('main#game[aria-busy="false"]').waitFor();
    if (!feedback.rejected) {
      await page.waitForFunction(
        ({ key, count }) =>
          JSON.parse(localStorage.getItem(key) ?? "null")?.guesses.length === count,
        { key: storageKey(puzzle.id), count: state.guesses.length + 1 },
      );
    } else {
      await page.locator("p.status.refused").waitFor();
    }
    const saved = parseProgress(
      await page.evaluate((key) => localStorage.getItem(key), storageKey(puzzle.id)),
      puzzle.id,
    );
    const record = !feedback.rejected ? saved?.guesses.at(-1) : undefined;
    const event: GuessEvent = {
      kind: "feedback-received",
      answer,
      at: record?.at ?? Date.now(),
      feedback: record
        ? {
            states: record.states,
            source: record.source,
            judgmentVersion: puzzle.judgments.version,
          }
        : feedback,
    };
    state = reduceGuess(state, event);
    assert.deepEqual(state.guesses, saved?.guesses ?? []);
    events.push(event);
    observed.push({
      answer,
      status: (await page.locator("p.status").allTextContents()).join(" "),
      guesses: state.guesses.length,
      filled: boardState(state.guesses).filledCount,
    });
  }
  assert.equal(boardState(state.guesses).complete, true);
  await page.getByText(`Filled in ${state.guesses.length} guesses`, { exact: true }).waitFor();
  mkdirSync(out, { recursive: true });
  await page.screenshot({ path: `${out}/recorded-game.png`, fullPage: true });
  const recording = {
    date,
    number,
    puzzleId: puzzle.id,
    labels: puzzle.conditions.map((c) => c.text),
    revision,
    capturedAt: new Date().toISOString(),
    provenance:
      "Read-only browser capture of a production-mode Worker; real browser form submissions. Accepted feedback is read from saved records; refusal feedback is reconstructed with the production evaluator and checked against unchanged saved guesses. Clock folding is outside this replay.",
    initial,
    events,
    observed,
  };
  writeFileSync(
    `${out}/recording.ts`,
    `// Recorded by scripts/reducer/record.ts; authored puzzle answers only.\nimport type { GuessEvent } from "../../src/lib/liminal/guessReducer";\nimport type { PuzzleProgress } from "../../src/lib/liminal/types";\n\nexport const recording = ${JSON.stringify(recording, null, 2)} satisfies {\n date: unknown; number: unknown; puzzleId: string; labels: string[]; revision: unknown; capturedAt: string; provenance: string; initial: PuzzleProgress; events: GuessEvent[]; observed: {answer: string; status: string; guesses: number; filled: number}[];\n};\n`,
  );
  console.log(
    `PASS recorded ${events.length} UI attempts, ${state.guesses.length} guesses, four filled regions`,
  );
} finally {
  await browser.close();
}
