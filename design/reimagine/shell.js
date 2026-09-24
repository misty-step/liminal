// The shell every finalist shares: header, one field, five dots, the end
// panel, the how-to, and the word detail with its report path.

import { createBoard } from "./board.js";
import {
  GUESS_LIMIT,
  findsOf,
  judgeGuess,
  loadGame,
  loadGuesses,
  loadStopped,
  nextPuzzleId,
  otherAnswers,
  refusalCopy,
  resetIfAsked,
  saveGuesses,
  saveStopped,
  shareText,
  splitCondition,
  stageTrail,
  untilTomorrow,
} from "./engine.js";
import { createList } from "./list.js";

const HELP = {
  quiet: [
    "Name a thing that fits all three.",
    "Each guess gets a mark per line: filled is inside, half is almost, empty is outside.",
    "Five guesses. Many right answers.",
  ],
  venn: [
    "Name a thing that fits inside all three circles.",
    "Every guess lands where it belongs. A word on a line is almost in.",
    "Five guesses. Many right answers.",
  ],
  narrowing: [
    "Name a thing that fits inside every circle.",
    "Circles arrive one at a time. Land inside all of them to bring the next.",
    "A word on a line is almost in. Five guesses. Many right answers.",
  ],
  reach: [
    "Name a thing that fits inside every circle.",
    "Circles arrive one at a time. Land inside all of them to bring the next.",
    "In the center? Keep going for a way in we didn’t expect, or stop. Five guesses in all.",
  ],
};

const STATE_WORD = { inside: "Inside", close: "On the line", outside: "Outside" };

function template(dateLabel, isToday) {
  return `
  <header class="top">
    <h1 class="wordmark"><a href="/">Liminal</a></h1>
    <span class="date">${isToday ? dateLabel : "Another puzzle"}</span>
    <button type="button" class="help-button" aria-label="How to play">?</button>
  </header>
  <main class="play">
    <div id="view"></div>
    <p class="status" aria-live="polite"></p>
    <form class="guess" autocomplete="off">
      <label class="visually-hidden" for="guess-input">Your guess</label>
      <input id="guess-input" maxlength="120" spellcheck="false" placeholder="Name a thing" />
      <button type="submit">Place</button>
    </form>
    <div class="dots" role="img"></div>
    <p class="stop-row" hidden><button type="button" class="stop link">Stop here</button></p>
    <section class="end" aria-live="polite" hidden>
      <h2 class="end-title"></h2>
      <p class="end-sub" hidden></p>
      <div class="trail" aria-hidden="true"></div>
      <p class="end-ways"><span class="end-ways-label"></span> <span class="end-ways-list"></span></p>
      <div class="end-actions">
        <button type="button" class="share">Share</button>
        <a class="another">Play another</a>
      </div>
      <p class="end-next"></p>
    </section>
  </main>
  <dialog class="help">
    <form method="dialog">
      <h2>How to play</h2>
      <div class="help-body"></div>
      <button type="submit" class="primary">Play</button>
    </form>
  </dialog>
  <div class="popover" role="dialog" aria-label="Guess detail" hidden>
    <p class="pop-word"></p>
    <ul class="pop-verdicts"></ul>
    <button type="button" class="link pop-report">Disagree?</button>
    <form class="pop-form" hidden>
      <label for="pop-note">What did the board get wrong?</label>
      <textarea id="pop-note" rows="3" maxlength="500"></textarea>
      <button type="submit" class="primary">Send</button>
      <p class="pop-sent" hidden>Noted. The prototype does not send reports.</p>
    </form>
  </div>`;
}

export async function mountGame({ variant, view, staged, reach = false }) {
  const { deck, puzzle, dateLabel, isToday } = await loadGame();
  document.body.innerHTML = template(dateLabel, isToday);
  document.body.dataset.variant = variant;
  resetIfAsked(variant, puzzle.id);

  const $ = (sel) => document.querySelector(sel);
  const input = $("#guess-input");
  const submit = $(".guess button");
  const status = $(".status");
  const dots = $(".dots");
  const popover = $(".popover");
  let guesses = loadGuesses(variant, puzzle.id);
  let stopped = reach && loadStopped(variant, puzzle.id);
  let pending = false;

  const viewApi = (view === "board" ? createBoard : createList)($("#view"), puzzle, {
    onWord: (i, el) => openPopover(i, el),
  });

  const help = $("dialog.help");
  help.querySelector(".help-body").innerHTML = HELP[variant]
    .map((line) => `<p>${line}</p>`)
    .join("");
  $(".help-button").addEventListener("click", () => help.showModal());
  const seenKey = `liminal.proto.help.${variant}`;
  if (!localStorage.getItem(seenKey) && !new URLSearchParams(location.search).has("nohelp")) {
    help.showModal();
  }
  help.addEventListener("close", () => {
    localStorage.setItem(seenKey, "1");
    input.focus();
  });

  function visibleConditions(stage) {
    return puzzle.conditions.slice(0, Math.min(stage, puzzle.conditions.length));
  }

  function render() {
    const { stage, trail, solved } = stageTrail(puzzle, guesses, staged);
    const finds = reach ? findsOf(puzzle, guesses) : null;
    const finished = reach
      ? stopped || guesses.length >= GUESS_LIMIT
      : solved || guesses.length >= GUESS_LIMIT;
    const sequence =
      viewApi.update({ visible: staged ? stage : 3, words: guesses, solved, finds }) ?? 0;

    dots.innerHTML = Array.from(
      { length: GUESS_LIMIT },
      (_, i) => `<span class="dot${i < guesses.length ? " used" : ""}"></span>`,
    ).join("");
    const left = GUESS_LIMIT - guesses.length;
    dots.setAttribute("aria-label", `${left} of ${GUESS_LIMIT} guesses left`);

    input.disabled = finished || pending;
    submit.disabled = finished || pending;
    $(".guess").hidden = finished;
    dots.hidden = finished;
    $(".stop-row").hidden = !reach || !solved || finished;
    input.placeholder = reach && solved ? "Another way in" : "Name a thing";

    status.hidden = finished;
    const end = $(".end");
    end.hidden = !finished;
    end.style.animationDelay = `${sequence + 300}ms`;
    if (finished) {
      $(".trail").innerHTML = guesses
        .map(
          (g, i) =>
            `<span class="trail-row">${puzzle.conditions
              .map((c, k) => {
                const state = k < trail[i].after ? g.states[c.id] : "hidden";
                return `<span class="mark c-${k + 1} ${state}"></span>`;
              })
              .join(
                "",
              )}${finds?.some((f) => f.index === i && !f.listed) ? '<span class="off-list">✦</span>' : ""}</span>`,
        )
        .join("");
      const others = otherAnswers(puzzle, guesses);
      $(".end-title").textContent = solved
        ? `Found in ${guesses.length}`
        : "The center stayed empty";
      $(".end-ways-label").textContent = solved ? "Other ways in:" : "Ways in:";
      $(".end-ways-list").textContent = others.join(", ").replaceAll("-", "\u2011");
      $(".end-ways").hidden = others.length === 0;
      if (reach) endForReach(finds);
      $(".another").href = `?p=${nextPuzzleId(deck, puzzle.id)}`;
      $(".end-next").textContent = isToday ? `Next puzzle in ${untilTomorrow()}` : "";
      const share = $(".share");
      share.onclick = async () => {
        await navigator.clipboard
          .writeText(shareText(puzzle, guesses, trail, dateLabel, solved, finds))
          .catch(() => {});
        share.textContent = "Copied";
      };
    }
    return { stage, solved, finished, finds };
  }

  /** Reach end panel: the rarest thing you found, then the setters' list. */
  function endForReach(finds) {
    const sub = $(".end-sub");
    if (!finds.length) {
      sub.hidden = true;
      return;
    }
    const first = finds[0].index + 1;
    const off = finds.filter((f) => !f.listed);
    $(".end-title").textContent = off.length ? "Off the list" : `Found in ${first}`;
    const yours = finds.map((f) => f.answer).join(", ");
    sub.textContent = off.length
      ? `“${off[0].answer}” is a way in we didn’t write down. You found: ${yours}.`
      : `You found: ${yours}. All on our list.`;
    sub.hidden = false;
    $(".end-ways-label").textContent = "On our list:";
    $(".end-ways-list").textContent = puzzle.answers.join(", ").replaceAll("-", "\u2011");
    $(".end-ways").hidden = false;
  }

  function verdictLine(word, stageBefore) {
    const shown = visibleConditions(stageBefore);
    const inside = shown.filter((c) => word.states[c.id] === "inside").length;
    const close = shown.filter((c) => word.states[c.id] === "close").length;
    if (shown.length === 1) {
      return `“${word.answer}” is ${STATE_WORD[word.states[shown[0].id]].toLowerCase()}.`;
    }
    const closeText = close ? `, on the line of ${close}` : "";
    return `“${word.answer}” is inside ${inside} of ${shown.length}${closeText}.`;
  }

  $(".guess").addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = input.value.trim();
    if (pending || !raw) return;
    pending = true;
    submit.textContent = "Placing";
    status.textContent = `Placing “${raw}”`;
    status.className = "status pending";
    render();
    const before = stageTrail(puzzle, guesses, staged);
    const result = await judgeGuess(puzzle, raw, guesses);
    pending = false;
    submit.textContent = "Place";
    if (result.kind === "refused") {
      status.textContent = refusalCopy(result.reason, raw);
      status.className = "status refused";
      render();
      input.focus();
      input.select();
      return;
    }
    const word = { answer: raw, states: result.states };
    guesses = [...guesses, word];
    saveGuesses(variant, puzzle.id, guesses);
    input.value = "";
    const after = render();
    status.className = "status";
    const newFind = after.finds?.find((f) => f.index === guesses.length - 1);
    if (after.finished) {
      status.textContent = "";
    } else if (newFind && before.solved) {
      status.textContent = newFind.listed
        ? `“${raw}” is in too, and on our list.`
        : `“${raw}” is in, and it isn’t on our list.`;
    } else if (newFind) {
      status.textContent = newFind.listed
        ? `“${raw}” is in the center. It’s on our list. Find one we didn’t expect?`
        : `“${raw}” is in the center, and it isn’t on our list.`;
    } else if (staged && after.stage > before.stage) {
      status.textContent =
        after.stage - before.stage > 1
          ? `“${raw}” fits the next circle too. One more.`
          : `“${raw}” is in. A new circle.`;
    } else {
      status.textContent = verdictLine(word, before.stage);
    }
    input.focus();
  });

  function openPopover(i, anchor) {
    const word = guesses[i];
    const { trail, stage } = stageTrail(puzzle, guesses, staged);
    const shown = visibleConditions(staged ? Math.max(stage, trail[i].after) : 3);
    popover.querySelector(".pop-word").textContent = word.answer;
    popover.querySelector(".pop-verdicts").innerHTML = "";
    shown.forEach((condition, k) => {
      const li = document.createElement("li");
      li.className = `c-${k + 1} ${word.states[condition.id]}`;
      li.innerHTML =
        '<span class="key" aria-hidden="true"></span><span class="v-text"></span><span class="v-state"></span>';
      li.querySelector(".v-text").textContent = splitCondition(condition.text).label;
      li.querySelector(".v-state").textContent = STATE_WORD[word.states[condition.id]];
      popover.querySelector(".pop-verdicts").append(li);
    });
    popover.querySelector(".pop-form").hidden = true;
    popover.querySelector(".pop-report").hidden = false;
    popover.querySelector(".pop-sent").hidden = true;
    popover.hidden = false;
    const a = anchor.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    popover.style.width = `${width}px`;
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, a.left + a.width / 2 - width / 2))}px`;
    popover.style.top = `${a.bottom + window.scrollY + 8}px`;
    popover.querySelector(".pop-report").focus();
  }

  $(".stop").addEventListener("click", () => {
    stopped = true;
    saveStopped(variant, puzzle.id);
    status.textContent = "";
    render();
  });

  popover.querySelector(".pop-report").addEventListener("click", () => {
    popover.querySelector(".pop-report").hidden = true;
    popover.querySelector(".pop-form").hidden = false;
    popover.querySelector("textarea").focus();
  });
  popover.querySelector(".pop-form").addEventListener("submit", (event) => {
    event.preventDefault();
    popover.querySelector(".pop-sent").hidden = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") popover.hidden = true;
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      !popover.hidden &&
      !popover.contains(event.target) &&
      !event.target.closest(".word, .row-word")
    ) {
      popover.hidden = true;
    }
  });

  render();
  if (!help.open) input.focus();
}
