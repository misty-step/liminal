import { GUESS_REASONS, guessTransition, reduceGuess } from "../../src/lib/liminal/guessReducer";
import { boardState, TARGETS } from "../../src/lib/liminal/regions";
import type { PuzzleProgress } from "../../src/lib/liminal/types";
import { recording } from "./recording";

function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value;
}
const slider = (() => {
  const input = element("step");
  if (!(input instanceof HTMLInputElement)) throw new Error("Missing replay slider");
  return input;
})();
const states: PuzzleProgress[] = [recording.initial];
for (const event of recording.events) states.push(reduceGuess(states[states.length - 1], event));
let position = 0;
slider.max = String(recording.events.length);
element("provenance").textContent =
  `Recorded daily #${recording.number} · ${recording.date} · ${recording.puzzleId}. ${recording.events.length} attempts, ${states.at(-1)?.guesses.length} spent guesses.`;
element("scope").textContent =
  `${recording.provenance} Captured ${recording.capturedAt}; served revision ${recording.revision}.`;
recording.observed.forEach((row, i) => {
  const tr = document.createElement("tr");
  for (const value of [i + 1, row.answer, row.guesses, row.filled]) {
    const td = document.createElement("td");
    td.textContent = String(value);
    tr.append(td);
  }
  element("attempts").append(tr);
});
function render() {
  const after = states[position];
  const before = states[Math.max(0, position - 1)];
  const event = recording.events[position - 1];
  const board = boardState(after.guesses);
  const previousBoard = boardState(before.guesses);
  const transition = event ? guessTransition(before, event) : null;
  element("position").textContent = `${position} / ${recording.events.length}`;
  slider.setAttribute("aria-valuetext", `Step ${position} of ${recording.events.length}`);
  slider.value = String(position);
  for (const [id, disabled] of [
    ["previous", position === 0],
    ["next", position === recording.events.length],
  ] satisfies [string, boolean][]) {
    const button = element(id);
    if (button instanceof HTMLButtonElement) button.disabled = disabled;
  }
  element("event").textContent = event ? `“${event.answer}”` : "Empty board";
  element("reason").textContent = transition
    ? GUESS_REASONS[transition]
    : "No event has been applied. Step forward to submit the first recorded attempt.";
  element("decision").textContent = transition ?? "Ready";
  element("decision").className = transition ? "current" : "";
  element("effect").textContent =
    after === before ? "Progress unchanged" : board.complete ? "Board complete" : "Guess saved";
  element("delta").textContent =
    `Guesses: ${before.guesses.length} → ${after.guesses.length} · Filled: ${previousBoard.filledCount} → ${board.filledCount}`;
  element("observation").textContent = position
    ? `Observed UI: ${recording.observed[position - 1].status || "Completion panel"}`
    : "";
  element("score").textContent =
    `${board.complete ? "Complete" : "Board"} · ${board.filledCount}/4 regions · ${after.guesses.length} guesses`;
  element("regions").replaceChildren();
  for (const key of TARGETS) {
    const region = document.createElement("div");
    const index = board.fills[key];
    region.className = `region${index === undefined ? "" : " filled"}`;
    const label = document.createElement("strong");
    label.textContent =
      key === "center" ? "All three" : `Outside “${recording.labels[Number(key.slice(1)) - 1]}”`;
    region.append(label, index === undefined ? "Empty" : after.guesses[index].answer);
    element("regions").append(region);
  }
  element("before").textContent = JSON.stringify(before, null, 2);
  element("payload").textContent = event ? JSON.stringify(event, null, 2) : "No event";
  element("after").textContent = JSON.stringify(after, null, 2);
}
function go(value: number) {
  position = Math.max(0, Math.min(recording.events.length, value));
  render();
}
element("previous").addEventListener("click", () => go(position - 1));
element("next").addEventListener("click", () => go(position + 1));
element("reset").addEventListener("click", () => go(0));
element("finish").addEventListener("click", () => go(recording.events.length));
slider.addEventListener("input", () => go(Number(slider.value)));
render();
