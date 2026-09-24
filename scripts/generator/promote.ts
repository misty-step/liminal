#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePuzzle } from "../../src/lib/liminal/puzzleSchema";
import { PUZZLE_FILES } from "../../src/lib/liminal/puzzles";

export function puzzleIdentifier(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export function appendPuzzleIndex(source: string, id: string): string {
  const name = puzzleIdentifier(id);
  const file = `${id}.json`;
  if (source.includes(`"${file}"`) || source.includes(`"./${file}"`)) {
    throw new Error(`Puzzle ${id} is already in the index`);
  }
  if (new RegExp(`\\b${name}\\b`).test(source)) {
    throw new Error(`Import identifier ${name} is already in the index`);
  }
  const imports = [...source.matchAll(/^import .+ from "\.\/.+\.json";$/gm)];
  if (imports.length === 0) throw new Error("Puzzle index has no JSON imports");
  const lastImport = imports[imports.length - 1];
  const importEnd = lastImport.index + lastImport[0].length;
  const withImport = `${source.slice(0, importEnd)}\nimport ${name} from "./${file}";${source.slice(importEnd)}`;
  const entries = withImport.match(/(export const PUZZLE_FILES:[^=]+ = \[)([\s\S]*?)(^\];)/m);
  if (!entries || entries.index === undefined)
    throw new Error("Puzzle index has no PUZZLE_FILES array");
  const end = entries.index + entries[1].length + entries[2].length;
  return `${withImport.slice(0, end)}  { file: "${file}", data: ${name} },\n${withImport.slice(end)}`;
}

export function bumpDeckVersion(source: string, today: string): string {
  const version = /export const DECK_VERSION = "(\d{4}-\d{2}-\d{2})\.(\d+)";/g;
  const matches = [...source.matchAll(version)];
  if (matches.length !== 1) throw new Error("Expected exactly one DECK_VERSION declaration");
  const [declaration, date, sequence] = matches[0];
  const next = date === today ? Number(sequence) + 1 : 1;
  return source.replace(declaration, `export const DECK_VERSION = "${today}.${next}";`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const force = args.includes("--force");
  const paths = args.filter((arg) => arg !== "--force");
  if (paths.length !== 1) {
    throw new Error("Usage: bun run puzzles:promote <candidate.json> [--force]");
  }
  const candidatePath = resolve(paths[0]);
  const candidate: unknown = JSON.parse(await readFile(candidatePath, "utf8"));
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`${candidatePath}: invalid candidate object`);
  }
  if ((!("accepted" in candidate) || candidate.accepted !== true) && !force) {
    throw new Error(`${candidatePath}: candidate was not accepted (use --force to override)`);
  }
  const puzzle = parsePuzzle("puzzle" in candidate ? candidate.puzzle : undefined, candidatePath);
  const puzzlePath = fileURLToPath(
    new URL(`../../src/lib/liminal/puzzles/${puzzle.id}.json`, import.meta.url),
  );
  if (PUZZLE_FILES.some(({ file }) => file === `${puzzle.id}.json`)) {
    throw new Error(`Puzzle ${puzzle.id} is already in PUZZLE_FILES`);
  }
  if (existsSync(puzzlePath)) throw new Error(`Puzzle file already exists: ${puzzlePath}`);

  const indexPath = fileURLToPath(
    new URL("../../src/lib/liminal/puzzles/index.ts", import.meta.url),
  );
  const deckPath = fileURLToPath(new URL("../../src/lib/liminal/deck.ts", import.meta.url));
  const [index, deck] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(deckPath, "utf8"),
  ]);
  const nextIndex = appendPuzzleIndex(index, puzzle.id);
  const nextDeck = bumpDeckVersion(deck, new Date().toISOString().slice(0, 10));
  await writeFile(
    puzzlePath,
    `${JSON.stringify({ ...puzzle, judgeStatus: "uncalibrated" }, null, 2)}\n`,
    {
      flag: "wx",
    },
  );
  await writeFile(indexPath, nextIndex);
  await writeFile(deckPath, nextDeck);
  console.log(
    `Promoted ${puzzle.id}. Next: bun run validate:live -- --only ${puzzle.id} --mark-calibrated`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
