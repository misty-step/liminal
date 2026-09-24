// Prototype engine shared by every finalist. Mirrors the production rules:
// authored answers and near misses judge locally; everything else goes to the
// live judge; only a confident judgment spends a guess.

export const GUESS_LIMIT = 5;
export const MAX_LENGTH = 120;

const DASH = /\s*(?:\u2014|\u2013)\s*/u;

export function normalizeAnswer(raw) {
  return raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(a|an|the)\s+/, "")
    .trim();
}

/** Circle label (before the dash) and its clarifier (after it). */
export function splitCondition(text) {
  const [label, ...rest] = text.split(DASH);
  return { label, detail: rest.join(", ") };
}

export async function loadGame() {
  const deck = await (await fetch("/deck.json")).json();
  const params = new URLSearchParams(location.search);
  const requested = params.get("p");
  const puzzle =
    deck.puzzles.find((p) => p.id === requested) ?? deck.puzzles.find((p) => p.id === deck.todayId);
  const date = new Date(`${deck.dateKey}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return { deck, puzzle, dateLabel, isToday: puzzle.id === deck.todayId };
}

function statesFor(puzzle, pick) {
  return Object.fromEntries(puzzle.conditions.map((c) => [c.id, pick(c.id)]));
}

/**
 * Judge one guess. Returns { kind: "judged", states } or
 * { kind: "refused", reason } where a refusal never spends a guess.
 */
export async function judgeGuess(puzzle, raw, previous) {
  const answer = normalizeAnswer(raw);
  if (raw.length > MAX_LENGTH) return { kind: "refused", reason: "too-long" };
  if (!answer) return { kind: "refused", reason: "empty" };
  if (
    puzzle.conditions.some(
      (c) =>
        normalizeAnswer(c.text) === answer ||
        normalizeAnswer(splitCondition(c.text).label) === answer,
    )
  ) {
    return { kind: "refused", reason: "echo" };
  }
  if (previous.some((g) => normalizeAnswer(g.answer) === answer)) {
    return { kind: "refused", reason: "repeat" };
  }
  if (puzzle.answers.map(normalizeAnswer).includes(answer)) {
    return { kind: "judged", states: statesFor(puzzle, () => "inside") };
  }
  const near = puzzle.nearMisses.find((n) => normalizeAnswer(n.answer) === answer);
  if (near) {
    return {
      kind: "judged",
      states: statesFor(puzzle, (id) => (id === near.fails ? "outside" : "inside")),
    };
  }
  try {
    const response = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleId: puzzle.id, answer: raw }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.status === "judged" && data.states) {
      return { kind: "judged", states: data.states };
    }
    return { kind: "refused", reason: data?.reason ?? "unreachable" };
  } catch {
    return { kind: "refused", reason: "unreachable" };
  }
}

export function refusalCopy(reason, word) {
  switch (reason) {
    case "echo":
      return "That repeats a circle. Name a thing instead.";
    case "repeat":
      return `“${word}” is already on the board.`;
    case "too-long":
      return "Keep it to a short name.";
    case "empty":
      return "Name a thing first.";
    case "uncertain":
      return `Couldn’t place “${word}” with confidence. Try a more specific name. No guess used.`;
    case "prototype-offline":
      return `This prototype only knows the sample answers. “${word}” isn’t one. No guess used.`;
    case "rate-limited":
      return "Too many tries at once. Wait a moment. No guess used.";
    default:
      return "Couldn’t reach the judge. Try again in a moment. No guess used.";
  }
}

/** Storage: one list of { answer, states } per variant and puzzle. */
export function loadGuesses(variant, puzzleId) {
  try {
    return JSON.parse(localStorage.getItem(`liminal.proto.${variant}.${puzzleId}`) ?? "[]");
  } catch {
    return [];
  }
}

export function saveGuesses(variant, puzzleId, guesses) {
  localStorage.setItem(`liminal.proto.${variant}.${puzzleId}`, JSON.stringify(guesses));
}

export function resetIfAsked(variant, puzzleId) {
  if (!new URLSearchParams(location.search).has("reset")) return;
  saveGuesses(variant, puzzleId, []);
  localStorage.removeItem(`liminal.proto.${variant}.${puzzleId}.stopped`);
}

export function loadStopped(variant, puzzleId) {
  return localStorage.getItem(`liminal.proto.${variant}.${puzzleId}.stopped`) === "1";
}

export function saveStopped(variant, puzzleId) {
  localStorage.setItem(`liminal.proto.${variant}.${puzzleId}.stopped`, "1");
}

/** Loose singular tokens so "sinks" matches "sink" (but "glass" stays "glass"). */
function tokens(answer) {
  return normalizeAnswer(answer)
    .split(" ")
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

function containsRun(hay, needle) {
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((t, k) => hay[i + k] === t)) return true;
  }
  return false;
}

/**
 * On the setters' list: an authored answer, or a variant that contains one
 * ("pedestal sink" is still a sink). Anything else inside every circle is a
 * way in nobody wrote down.
 */
export function isListed(puzzle, answer) {
  const t = tokens(answer);
  return puzzle.answers.some((a) => containsRun(t, tokens(a)));
}

/** Every guess inside all three circles, in guess order. */
export function findsOf(puzzle, guesses) {
  const ids = puzzle.conditions.map((c) => c.id);
  return guesses.flatMap((g, index) =>
    ids.every((id) => g.states[id] === "inside")
      ? [{ index, answer: g.answer, listed: isListed(puzzle, g.answer) }]
      : [],
  );
}

/**
 * Staged play: stage n means circles 1..n are visible. A guess inside every
 * visible circle opens the next one; words already inside it cascade.
 * Returns the stage after each guess, plus the final stage (4 = solved).
 */
export function stageTrail(puzzle, guesses, staged) {
  const ids = puzzle.conditions.map((c) => c.id);
  const all = ids.length;
  let stage = staged ? 1 : all;
  const trail = [];
  for (const guess of guesses) {
    const shownAt = stage;
    while (stage <= all && ids.slice(0, stage).every((id) => guess.states[id] === "inside")) {
      stage += 1;
    }
    trail.push({ shownAt, after: stage });
  }
  return { stage, trail, solved: stage > all };
}

const MARK = { inside: "●", close: "◐", outside: "○" };

/**
 * One row per guess, one mark per circle visible after it. With finds (Reach),
 * a way in nobody listed gets a ✦ and the score names both moments.
 */
export function shareText(puzzle, guesses, trail, dateLabel, solved, finds = null) {
  const ids = puzzle.conditions.map((c) => c.id);
  const offList = new Set((finds ?? []).filter((f) => !f.listed).map((f) => f.index));
  const rows = guesses.map(
    (g, i) =>
      ids.map((id, k) => (k < trail[i].after ? MARK[g.states[id]] : "·")).join("") +
      (offList.has(i) ? " ✦" : ""),
  );
  let score = solved ? `${guesses.length} of ${GUESS_LIMIT}` : `X of ${GUESS_LIMIT}`;
  if (finds?.length) {
    const first = finds[0].index + 1;
    const off = finds.find((f) => !f.listed);
    score = off ? `Found in ${first}. Off the list in ${off.index + 1}.` : `Found in ${first}.`;
  }
  return `Liminal, ${dateLabel}\n${rows.join("\n")}\n${score}`;
}

export function otherAnswers(puzzle, guesses) {
  const mine = new Set(guesses.map((g) => normalizeAnswer(g.answer)));
  return puzzle.answers.filter((a) => !mine.has(normalizeAnswer(a)));
}

export function nextPuzzleId(deck, currentId) {
  const index = deck.puzzles.findIndex((p) => p.id === currentId);
  return deck.puzzles[(index + 1) % deck.puzzles.length].id;
}

export function untilTomorrow() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.max(1, Math.round((next - now.getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
