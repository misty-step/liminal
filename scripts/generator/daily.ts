#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { puzzleNumber } from "../../src/lib/liminal/daily";
import { DECK } from "../../src/lib/liminal/deck";
import { normalizeAnswer } from "../../src/lib/liminal/normalize";
import type { ScheduleEntry } from "../../src/lib/liminal/schedule";
import { judgeEnvFrom } from "../../src/lib/liminal/typeSafe";
import type { Puzzle } from "../../src/lib/liminal/types";
import { calibratePuzzle } from "./calibration";
import { critique } from "./critic";
import { type Draft, draftToPuzzle, isWellFormed } from "./draft";
import { expandConcept, proposeConcepts, repairConcepts, screenConcepts } from "./funnel";
import { Budget, BudgetExceeded, ProviderLimit } from "./openrouter";
import { reviseDraft } from "./proposer";
import { meetsPublishBar } from "./publish";
import { D1HttpScheduleStore, FileScheduleStore, publishWindow } from "./schedule-store";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    store: { type: "string", default: "file" },
    buffer: { type: "string", default: "7" },
    budget: { type: "string", default: "1" },
    "dry-run": { type: "boolean", default: false },
  },
});
const buffer = Number(values.buffer);
const cap = Number(values.budget);
if (
  !Number.isSafeInteger(buffer) ||
  buffer < 1 ||
  buffer > 30 ||
  !Number.isFinite(cap) ||
  cap <= 0 ||
  !["file", "d1"].includes(values.store)
)
  throw new Error("Usage: puzzles:daily -- --store file|d1 --buffer 7 --budget 1 [--dry-run]");
// Today is never filled: it began on the deck fallback and must stay on it.
const dates = publishWindow(new Date(), buffer);
const tomorrow = dates[0];
const store = values.store === "d1" ? new D1HttpScheduleStore() : new FileScheduleStore();
const existing = await store.list(tomorrow, dates[dates.length - 1]);
const published = await store.publishedPuzzles();
const occupied = new Set(existing.map((entry) => entry.date));
const env = judgeEnvFrom(process.env);
const apiKey = process.env.LIMINAL_GENERATOR_API_KEY;
const budget = new Budget(cap);
const started = Date.now();
const report = {
  at: new Date().toISOString(),
  store: values.store,
  dryRun: values["dry-run"],
  buffer,
  capUsd: cap,
  spentUsd: 0,
  calls: 0,
  wallMs: 0,
  dates: [] as {
    date: string;
    status: string;
    slug?: string;
    proposed: number;
    survivedBeforeRepair: number;
    repairs: number;
    survivedAfterRepair: number;
    expanded: number;
    accepted: number;
    published: number;
    failures: string[];
  }[],
};
let halted: string | null = null;
for (const date of dates) {
  const number = puzzleNumber(date);
  const row = {
    date,
    status: "already scheduled",
    proposed: 0,
    survivedBeforeRepair: 0,
    repairs: 0,
    survivedAfterRepair: 0,
    expanded: 0,
    accepted: 0,
    published: 0,
    failures: [] as string[],
    slug: undefined as string | undefined,
  };
  report.dates.push(row);
  if (occupied.has(date)) {
    console.log(`${date}: already scheduled`);
    continue;
  }
  if (!env || !apiKey || apiKey === env.apiKey) {
    row.status = "unfilled: missing or identical keys";
    row.failures.push("OPENROUTER_API_KEY and distinct LIMINAL_GENERATOR_API_KEY required");
    console.log(`${date}: ${row.status}`);
    break;
  }
  row.status = "unfilled";
  try {
    let emptyRounds = 0;
    const seenConcepts = new Set<string>();
    // A round evaluates ten independent cheap concepts before paying to draft.
    // Stop only on a publishable puzzle or the nightly spending/provider limit.
    while (!row.published) {
      budget.assertRoom();
      const avoid = [
        ...[...DECK, ...published].map(
          (p) => `${p.id} (${p.conditions.map((c) => c.text).join(" / ")})`,
        ),
        ...Array.from(seenConcepts).slice(-30),
      ];
      const concepts = await proposeConcepts({
        apiKey,
        model: "z-ai/glm-5.3",
        budget,
        count: 10,
        avoid,
        reasoning: "low",
      });
      row.proposed += concepts.length;
      if (!concepts.length) {
        emptyRounds++;
        if (emptyRounds === 3) throw new Error("provider returned no concepts in three rounds");
        continue;
      }
      emptyRounds = 0;
      const fresh = concepts.filter((concept) => {
        if (seenConcepts.has(concept.slug)) return false;
        seenConcepts.add(concept.slug);
        const labels = concept.labels.map(normalizeAnswer);
        return ![...DECK, ...published].some(
          (p) =>
            p.id === concept.slug ||
            labels.filter((label) => p.conditions.some((c) => normalizeAnswer(c.text) === label))
              .length > 1,
        );
      });
      const screened = await screenConcepts({
        env,
        apiKey,
        playerModel: "google/gemini-3-flash-preview",
        budget,
        concepts: fresh,
        keep: 3,
      });
      row.survivedBeforeRepair += screened.filter((score) => score.kept).length;
      const repairs = await repairConcepts({
        apiKey,
        model: "z-ai/glm-5.3",
        budget,
        scores: screened,
      });
      row.repairs += repairs.length;
      const repaired = repairs.length
        ? await screenConcepts({
            env,
            apiKey,
            playerModel: "google/gemini-3-flash-preview",
            budget,
            concepts: repairs,
            keep: 3,
          })
        : [];
      row.survivedAfterRepair +=
        screened.filter((score) => score.kept).length +
        repaired.filter((score) => score.kept).length;
      const survivors = [...screened, ...repaired]
        .filter((score) => score.kept)
        .sort((a, b) => b.score - a.score);
      for (const survivor of survivors) {
        budget.assertRoom();
        let draft: Draft | null;
        try {
          draft = await expandConcept({
            apiKey,
            model: "z-ai/glm-5.3",
            budget,
            concept: survivor.concept,
            reasoning: "low",
          });
        } catch (error) {
          if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
          row.failures.push(`expand ${survivor.concept.slug}: ${String(error)}`);
          continue;
        }
        if (!draft || !isWellFormed(draft)) continue;
        row.expanded++;
        let countedAccepted = false;
        for (let revision = 0; revision <= 2; revision++) {
          let puzzle: Puzzle;
          try {
            puzzle = draftToPuzzle(draft);
          } catch (error) {
            row.failures.push(`invalid ${draft.slug}: ${String(error)}`);
            break;
          }
          const critiqueReport = await critique({
            env,
            apiKey,
            playerModel: "google/gemini-3-flash-preview",
            budget,
            puzzle,
            proposed: draft.answers,
          });
          if (critiqueReport.accepted && !countedAccepted) {
            row.accepted++;
            countedAccepted = true;
          }
          puzzle = draftToPuzzle(draft, critiqueReport);
          // Do not spend a live matrix on an obviously unpublishable candidate.
          const preliminary = meetsPublishBar(critiqueReport, { puzzle, rows: [] }, published);
          const nonCalibration = preliminary.reasons.filter(
            (reason) => !reason.startsWith("calibration "),
          );
          let publishFailures = nonCalibration;
          if (!nonCalibration.length) {
            const calibration = await calibratePuzzle(puzzle, env);
            if (calibration.rows.some((result) => result.status !== "judged"))
              throw new Error("live calibration judge unavailable; stopping publication");
            const verdict = meetsPublishBar(critiqueReport, calibration, published);
            if (verdict.ok) {
              const calibrated = { ...puzzle, judgeStatus: "calibrated" as const };
              const entry: ScheduleEntry = {
                date,
                number,
                puzzle: calibrated,
                source: "generator",
                createdAt: new Date().toISOString(),
              };
              if (!values["dry-run"]) await store.insert(entry);
              published.push(calibrated);
              occupied.add(date);
              row.published = 1;
              row.slug = puzzle.id;
              row.status = values["dry-run"] ? "dry-run publishable" : "published";
              break;
            }
            publishFailures = verdict.reasons;
            row.failures.push(`${puzzle.id}: ${verdict.reasons.join("; ")}`);
          } else row.failures.push(`${puzzle.id}: ${nonCalibration.join("; ")}`);
          if (revision === 2) break;
          try {
            const revised = await reviseDraft({
              apiKey,
              model: "z-ai/glm-5.3",
              budget,
              draft,
              report: {
                ...critiqueReport,
                failures: [...new Set([...critiqueReport.failures, ...publishFailures])],
              },
              reasoning: "low",
            });
            if (!revised || !isWellFormed(revised)) break;
            draft = revised;
          } catch (error) {
            if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
            row.failures.push(`revision ${draft.slug}: ${String(error)}`);
            break;
          }
        }
        if (row.published) break;
      }
    }
  } catch (error) {
    halted = error instanceof Error ? error.message : String(error);
    row.failures.push(halted);
    console.error(`${date}: stopped: ${halted}`);
  }
  console.log(
    `${date}: ${row.status}${row.slug ? ` ${row.slug}` : ""}; concepts ${row.proposed}, screen ${row.survivedBeforeRepair} -> ${row.survivedAfterRepair} (${row.repairs} repaired), expanded ${row.expanded}, accepted ${row.accepted}, published ${row.published}, spent $${budget.spent.toFixed(3)}`,
  );
  if (halted) break;
}
report.spentUsd = budget.spent;
report.calls = budget.calls;
report.wallMs = Date.now() - started;
await mkdir(join(process.cwd(), "content/daily"), { recursive: true });
const path = join(process.cwd(), "content/daily", `run-${report.at.replace(/[:.]/g, "-")}.json`);
await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Daily report: ${path}; generator $${budget.spent.toFixed(3)} in ${(report.wallMs / 1000).toFixed(1)}s`,
);
// Tomorrow unfilled means tomorrow will be a repeat from the deck: fail visibly.
if (!occupied.has(tomorrow) && !values["dry-run"]) process.exitCode = 1;
