// Quiet list: the current mechanic with the chrome removed. Conditions on
// top, five guess rows below; each row carries one mark per condition.

import { GUESS_LIMIT, splitCondition } from "./engine.js";

const WORD = { inside: "inside", close: "on the line", outside: "outside" };

export function createList(root, puzzle, { onWord }) {
  root.classList.add("quiet");
  root.innerHTML = "";

  const conditions = document.createElement("ol");
  conditions.className = "quiet-conditions";
  puzzle.conditions.forEach((condition, i) => {
    const { label, detail } = splitCondition(condition.text);
    const li = document.createElement("li");
    li.className = `c-${i + 1}`;
    li.innerHTML =
      '<span class="key" aria-hidden="true"></span><span class="text"><span class="label-main"></span></span>';
    li.querySelector(".label-main").textContent = label;
    if (detail) {
      const small = document.createElement("span");
      small.className = "label-detail";
      small.textContent = detail;
      li.querySelector(".text").append(small);
    }
    conditions.append(li);
  });

  const rows = document.createElement("ol");
  rows.className = "quiet-rows";
  root.append(conditions, rows);

  function update({ words, solved }) {
    rows.innerHTML = "";
    for (let i = 0; i < GUESS_LIMIT; i += 1) {
      const word = words[i];
      const li = document.createElement("li");
      if (!word) {
        li.className = "row empty";
        li.innerHTML = '<span class="row-word"></span>';
        rows.append(li);
        continue;
      }
      li.className = `row${solved && i === words.length - 1 ? " won" : ""}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row-word";
      button.textContent = word.answer;
      button.addEventListener("click", () => onWord(i, button));
      const marks = document.createElement("span");
      marks.className = "marks";
      puzzle.conditions.forEach((condition, k) => {
        const state = word.states[condition.id];
        const mark = document.createElement("span");
        mark.className = `mark c-${k + 1} ${state}`;
        mark.setAttribute("role", "img");
        mark.setAttribute("aria-label", `${splitCondition(condition.text).label}: ${WORD[state]}`);
        marks.append(mark);
      });
      li.append(button, marks);
      rows.append(li);
    }
  }

  return { update };
}
