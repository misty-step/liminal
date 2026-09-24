import type { ConditionId, ConditionState, GuessRecord, TargetKey } from "./types";

/**
 * The game: four regions to fill. The center needs all three circles; each
 * pair region needs two circles and falls outside the third. A guess fills a
 * region when it lands there cleanly (no condition on the line) and the
 * region is still empty. Everything else stays on the board as information.
 */

export const CONDITION_IDS: readonly ConditionId[] = ["c1", "c2", "c3"];

/** Display and share order: the three pairs, then the center. */
export const TARGETS: readonly TargetKey[] = ["c3", "c2", "c1", "center"];

export type Landing =
  | { kind: "target"; key: TargetKey }
  /** On at least one circle's line: close, so it fills nothing. */
  | { kind: "line" }
  /** Inside exactly one circle. */
  | { kind: "single" }
  | { kind: "outside" };

const STATES: readonly ConditionState[] = ["inside", "close", "outside"];

/** Validate per-condition states from outside data (the judge API, saved progress). */
export function parseStates(value: unknown): Record<ConditionId, ConditionState> | null {
  if (!value || typeof value !== "object") return null;
  const read = (id: ConditionId) => STATES.find((state) => state === Reflect.get(value, id));
  const c1 = read("c1");
  const c2 = read("c2");
  const c3 = read("c3");
  return c1 && c2 && c3 ? { c1, c2, c3 } : null;
}

export function landingOf(states: Record<ConditionId, ConditionState>): Landing {
  if (CONDITION_IDS.some((id) => states[id] === "close")) return { kind: "line" };
  const outside = CONDITION_IDS.filter((id) => states[id] === "outside");
  if (outside.length === 0) return { kind: "target", key: "center" };
  if (outside.length === 1) return { kind: "target", key: outside[0] };
  return outside.length === 2 ? { kind: "single" } : { kind: "outside" };
}

export interface BoardState {
  /** Target -> index of the guess that filled it. */
  fills: Partial<Record<TargetKey, number>>;
  filledCount: number;
  /** All four regions filled: the only way a board ends. */
  complete: boolean;
}

export function boardState(guesses: readonly Pick<GuessRecord, "states">[]): BoardState {
  const fills: Partial<Record<TargetKey, number>> = {};
  guesses.forEach((guess, index) => {
    const landing = landingOf(guess.states);
    if (landing.kind === "target" && fills[landing.key] === undefined) fills[landing.key] = index;
  });
  const filledCount = Object.keys(fills).length;
  return { fills, filledCount, complete: filledCount === TARGETS.length };
}

/** Clock text: m:ss, or h:mm:ss past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
