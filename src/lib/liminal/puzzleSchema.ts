import type {
  ChoiceLevels,
  Condition,
  ConditionId,
  Puzzle,
  PuzzleMode,
  RegionAnswers,
} from "./types";

/**
 * Validate a puzzle from data (deck JSON files, generator output). Throws with
 * the source and field so a bad file fails loudly at load or in tests.
 */
export function parsePuzzle(value: unknown, source: string): Puzzle {
  const fail = (field: string): never => {
    throw new Error(`${source}: invalid puzzle field "${field}"`);
  };
  const record = (v: unknown, field: string): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail(field);
    return Object.fromEntries(Object.entries(v));
  };
  const text = (v: unknown, field: string): string =>
    typeof v === "string" && v.trim().length > 0 ? v : fail(field);
  const words = (v: unknown, field: string): string[] =>
    Array.isArray(v) && v.every((w) => typeof w === "string" && w.trim()) ? v : fail(field);

  const root = record(value, "root");
  const id = text(root.id, "id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail("id");
  const mode: PuzzleMode =
    root.mode === "literal" ? "literal" : root.mode === "wordplay" ? "wordplay" : fail("mode");
  const judgeStatus =
    root.judgeStatus === "calibrated" || root.judgeStatus === "uncalibrated"
      ? root.judgeStatus
      : fail("judgeStatus");

  const ids: ConditionId[] = ["c1", "c2", "c3"];
  const conditionList = root.conditions;
  if (!Array.isArray(conditionList) || conditionList.length !== 3) return fail("conditions");
  const conditions = ids.map((expected, index): Condition => {
    const c = record(conditionList[index], `conditions[${index}]`);
    if (c.id !== expected) fail(`conditions[${index}].id`);
    const levelsRecord = record(c.levels, `conditions[${index}].levels`);
    const levels: ChoiceLevels = {
      yes: text(levelsRecord.yes, `conditions[${index}].levels.yes`),
      partly: text(levelsRecord.partly, `conditions[${index}].levels.partly`),
      no: text(levelsRecord.no, `conditions[${index}].levels.no`),
    };
    const condition: Condition = {
      id: expected,
      text: text(c.text, `conditions[${index}].text`),
      judge: text(c.judge, `conditions[${index}].judge`),
      levels,
    };
    if (c.detail !== undefined) condition.detail = text(c.detail, `conditions[${index}].detail`);
    return condition;
  });

  const judgments = record(root.judgments, "judgments");
  const region = (v: unknown, field: string): RegionAnswers => {
    const r = record(v, field);
    return {
      answers: words(r.answers, `${field}.answers`),
      heldOut: words(r.heldOut, `${field}.heldOut`),
    };
  };
  const pairs = record(judgments.pairs, "judgments.pairs");
  return {
    id,
    mode,
    judgeStatus,
    conditions: [conditions[0], conditions[1], conditions[2]],
    judgments: {
      version: text(judgments.version, "judgments.version"),
      center: region(judgments.center, "judgments.center"),
      pairs: {
        c1: region(pairs.c1, "judgments.pairs.c1"),
        c2: region(pairs.c2, "judgments.pairs.c2"),
        c3: region(pairs.c3, "judgments.pairs.c3"),
      },
    },
  };
}
