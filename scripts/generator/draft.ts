import { normalizeAnswer } from "../../src/lib/liminal/normalize";
import { parsePuzzle } from "../../src/lib/liminal/puzzleSchema";
import { TARGETS } from "../../src/lib/liminal/regions";
import type { Puzzle, RegionAnswers, TargetKey } from "../../src/lib/liminal/types";
import type { CriticReport } from "./critic";

/** The proposer's output shape (see DRAFT_SCHEMA in proposer.ts). */
export interface Draft {
  slug: string;
  mode: "literal" | "wordplay";
  theme: string;
  conditions: {
    label: string;
    detail: string;
    judge: string;
    yes: string;
    partly: string;
    no: string;
  }[];
  answers: Record<TargetKey, string[]>;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Build a Puzzle from a draft. With a critic report, only answers Jev
 * confirmed survive: the first ones become authored answers, the rest held-out
 * (the live matrix later proves the judge still places them).
 */
export function draftToPuzzle(draft: Draft, report?: CriticReport): Puzzle {
  const version = `${new Date().toISOString().slice(0, 10)}.1`;
  const region = (target: TargetKey): RegionAnswers => {
    const words = report
      ? (report.regions.find((r) => r.target === target)?.confirmed ?? [])
      : [...new Set(draft.answers[target].map(normalizeAnswer).filter(Boolean))];
    const keep = target === "center" ? 5 : 4;
    return { answers: words.slice(0, keep), heldOut: words.slice(keep, keep + 2) };
  };
  const ids = ["c1", "c2", "c3"] as const;
  return parsePuzzle(
    {
      id: slugify(draft.slug) || "draft",
      mode: draft.mode,
      judgeStatus: "uncalibrated",
      conditions: ids.map((id, index) => {
        const c = draft.conditions[index];
        return {
          id,
          text: c?.label,
          ...(c?.detail?.trim() ? { detail: c.detail.trim() } : {}),
          judge: c?.judge,
          levels: { yes: c?.yes, partly: c?.partly, no: c?.no },
        };
      }),
      judgments: {
        version,
        center: region("center"),
        pairs: { c1: region("c1"), c2: region("c2"), c3: region("c3") },
      },
    },
    `draft:${draft.slug}`,
  );
}

/** A draft is usable only with exactly three complete conditions. */
export function isWellFormed(draft: Draft): boolean {
  return (
    draft.conditions.length === 3 &&
    draft.conditions.every(
      (c) => c.label.trim() && c.judge.includes("`answer`") && c.yes && c.partly && c.no,
    ) &&
    TARGETS.every((t) => draft.answers[t]?.length > 0)
  );
}
