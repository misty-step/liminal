import type { ConditionId, ConditionState } from "./types";

export interface ClockState {
  ready: boolean;
  complete: boolean;
  pending: boolean;
  howtoOpen: boolean;
  visible: boolean;
}

/** The score clock counts thinking time only. */
export function clockRunning(state: ClockState): boolean {
  return state.ready && !state.complete && !state.pending && !state.howtoOpen && state.visible;
}

export interface JudgmentResponse {
  ok: boolean;
  status: unknown;
  states: Record<ConditionId, ConditionState> | null;
}

type SpendingResponse = JudgmentResponse & {
  status: "judged";
  states: Record<ConditionId, ConditionState>;
};

/**
 * Only a complete judgment spends a guess. Valid states may include `close`,
 * so a torn judgment still spends; unavailable responses remain free.
 */
export function responseSpendsGuess(response: JudgmentResponse): response is SpendingResponse {
  return response.ok && response.status === "judged" && response.states !== null;
}

export interface KeyboardViewport {
  narrow: boolean;
  coarsePointer: boolean;
}

/** Whether focusing the composer should switch to the keyboard-open layout. */
export function keyboardOpenForViewport(viewport: KeyboardViewport): boolean {
  return viewport.narrow && viewport.coarsePointer;
}
