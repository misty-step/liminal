#!/usr/bin/env bun
/**
 * Review sheet for generated candidates: one section per puzzle with the
 * circles, what Jev confirmed per region, the ordinary guesses that landed and
 * missed, and the critic's verdict. Label each puzzle by editing the
 * `verdict:` line (publish / fix / reject) and a short note; those labels are
 * the ground truth for tuning the critic's thresholds.
 *
 *   bun run puzzles:review [--dir content/candidates]
 *
 * Writes content/review-<timestamp>.md (gitignored with the candidates).
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parsePuzzle } from "../../src/lib/liminal/puzzleSchema";
import { TARGETS } from "../../src/lib/liminal/regions";
import { regionPrompt } from "./critic";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { dir: { type: "string", default: "content/candidates" } },
});

const dir = join(process.cwd(), values.dir);
const files = (await readdir(dir)).filter(
  (f) =>
    f.endsWith(".json") &&
    !f.startsWith("run-") &&
    !f.startsWith("drafts-") &&
    !f.startsWith("screen-"),
);
const sections: string[] = [];
let accepted = 0;

for (const file of files.sort()) {
  const raw: unknown = JSON.parse(await readFile(join(dir, file), "utf8"));
  if (!raw || typeof raw !== "object") continue;
  const puzzle = parsePuzzle(Reflect.get(raw, "puzzle"), file);
  const report = Reflect.get(raw, "report");
  const ok = Reflect.get(raw, "accepted") === true;
  if (ok) accepted += 1;
  const regions = report && typeof report === "object" ? Reflect.get(report, "regions") : null;
  const failures = report && typeof report === "object" ? Reflect.get(report, "failures") : null;
  const taste = report && typeof report === "object" ? Reflect.get(report, "taste") : null;
  const lines = [
    `## ${puzzle.id} — critic: ${ok ? "ACCEPT" : "reject"}, taste ${Number(taste && typeof taste === "object" ? Reflect.get(taste, "probability") : 0).toFixed(2)}`,
    "",
    `Circles: ${puzzle.conditions.map((c) => (c.detail ? `**${c.text}** (${c.detail})` : `**${c.text}**`)).join(" · ")}`,
    `Theme: ${String(Reflect.get(raw, "theme") ?? "")}`,
    "",
  ];
  for (const target of TARGETS) {
    const region = Array.isArray(regions)
      ? regions.find((r) => r && typeof r === "object" && Reflect.get(r, "target") === target)
      : null;
    const list = (key: string) => {
      const v = region ? Reflect.get(region, key) : null;
      if (!Array.isArray(v)) return "-";
      return (
        v
          .map((x) => (typeof x === "string" ? x : String(Reflect.get(x ?? {}, "word"))))
          .join(", ") || "-"
      );
    };
    lines.push(
      `- **${regionPrompt(puzzle, target)}**`,
      `  - confirmed: ${list("confirmed")}`,
      `  - ordinary guesses landed: ${list("naturalHits")} · missed: ${list("naturalMisses")}`,
    );
  }
  if (Array.isArray(failures) && failures.length) {
    lines.push("", `Critic failures: ${failures.join("; ")}`);
  }
  lines.push("", "verdict: ", "note: ", "");
  sections.push(lines.join("\n"));
}

const at = new Date().toISOString();
const out = join(process.cwd(), "content", `review-${at.replace(/[:.]/g, "-")}.md`);
await writeFile(
  out,
  `# Candidate review, ${at}\n\n${files.length} candidates, ${accepted} accepted by the critic. Fill in each verdict (publish / fix / reject).\n\n${sections.join("\n")}`,
);
console.log(`${files.length} candidates (${accepted} accepted). Review sheet: ${out}`);
