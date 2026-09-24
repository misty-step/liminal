import { describe, expect, it } from "vitest";
import {
  appendPuzzleIndex,
  bumpDeckVersion,
  puzzleIdentifier,
} from "../../../../scripts/generator/promote";
import { parsePuzzle } from "../puzzleSchema";
import { PUZZLE_FILES } from "../puzzles";

const base = parsePuzzle(PUZZLE_FILES[0].data, "puzzles/bath-vessel.json");
const source = "candidate/example.json";

function rejectsField(value: unknown, field: string): void {
  expect(() => parsePuzzle(value, source)).toThrow(`${source}: invalid puzzle field "${field}"`);
}

describe("parsePuzzle", () => {
  it("accepts every puzzle in the published rotation", () => {
    for (const { file, data } of PUZZLE_FILES) {
      expect(parsePuzzle(data, `puzzles/${file}`).id).toBe(file.replace(/\.json$/, ""));
    }
  });

  it("requires exactly three conditions", () => {
    rejectsField({ ...base, conditions: base.conditions.slice(0, 2) }, "conditions");
  });

  it("requires condition ids in diagram order", () => {
    const conditions = base.conditions.map((condition, index) =>
      index === 1 ? { ...condition, id: "c3" } : condition,
    );
    rejectsField({ ...base, conditions }, "conditions[1].id");
  });

  it("rejects an id that is not a slug", () => {
    rejectsField({ ...base, id: "Not A Slug" }, "id");
  });

  it("requires each condition's levels", () => {
    const conditions = [{ ...base.conditions[0], levels: undefined }, ...base.conditions.slice(1)];
    rejectsField({ ...base, conditions }, "conditions[0].levels");
  });

  it("rejects empty answer entries", () => {
    const judgments = {
      ...base.judgments,
      center: { ...base.judgments.center, answers: ["valid", ""] },
    };
    rejectsField({ ...base, judgments }, "judgments.center.answers");
  });

  it("rejects an unknown judge status", () => {
    rejectsField({ ...base, judgeStatus: "ready" }, "judgeStatus");
  });
});

describe("puzzle promotion transforms", () => {
  it("converts a hyphenated puzzle id to an import identifier", () => {
    expect(puzzleIdentifier("kitchen-steam-glass")).toBe("kitchenSteamGlass");
  });

  it("appends imports and entries without reordering the daily rotation", () => {
    const index = [
      'import first from "./first.json";',
      'import second from "./second.json";',
      "",
      "export const PUZZLE_FILES: readonly { file: string; data: unknown }[] = [",
      '  { file: "first.json", data: first },',
      '  { file: "second.json", data: second },',
      "];",
      "",
    ].join("\n");
    const next = appendPuzzleIndex(index, "kitchen-steam-glass");
    expect(next).toContain(
      'import second from "./second.json";\nimport kitchenSteamGlass from "./kitchen-steam-glass.json";',
    );
    expect(next).toContain(
      '  { file: "first.json", data: first },\n  { file: "second.json", data: second },\n  { file: "kitchen-steam-glass.json", data: kitchenSteamGlass },\n];',
    );
  });

  it("increments a same-day deck version", () => {
    expect(bumpDeckVersion('export const DECK_VERSION = "2026-09-23.4";\n', "2026-09-23")).toBe(
      'export const DECK_VERSION = "2026-09-23.5";\n',
    );
  });

  it("starts at one on a new UTC date", () => {
    expect(bumpDeckVersion('export const DECK_VERSION = "2026-09-22.9";\n', "2026-09-23")).toBe(
      'export const DECK_VERSION = "2026-09-23.1";\n',
    );
  });
});
