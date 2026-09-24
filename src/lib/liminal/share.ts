import { formatClock, type Landing } from "./regions";
import { MAX_ANSWER_LENGTH, type TargetKey } from "./types";

export interface RevealWord {
  word: string;
  landing: Landing;
  filled: boolean;
}

type ShareWord = Pick<RevealWord, "word" | "landing">;

export interface Reveal {
  number: number;
  elapsedMs: number;
  words: RevealWord[];
}

const SQUARES: Record<TargetKey, string> = {
  c3: "🟪",
  c2: "🟩",
  c1: "🟧",
  center: "⬛",
};

const CODES: Record<TargetKey, string> = {
  center: "m",
  c1: "1",
  c2: "2",
  c3: "3",
};

const MAX_CODE_LENGTH = 2000;
const MAX_WORDS = 60;

function markedWords(words: readonly ShareWord[]): RevealWord[] {
  const filled = new Set<TargetKey>();
  return words.map(({ word, landing }) => {
    const first = landing.kind === "target" && !filled.has(landing.key);
    if (first && landing.kind === "target") filled.add(landing.key);
    return { word, landing, filled: first };
  });
}

function squareRow(words: readonly RevealWord[]): string {
  return words
    .map(({ landing, filled }) =>
      filled && landing.kind === "target" ? SQUARES[landing.key] : "⬜",
    )
    .join("");
}

export function scoreLine(guesses: number, elapsedMs: number): string {
  return `${guesses} ${guesses === 1 ? "guess" : "guesses"}, ${formatClock(elapsedMs)}${guesses === 4 ? " 🎯" : ""}`;
}

export function revealSquares(words: readonly RevealWord[]): string {
  return squareRow(words);
}

/** Encodes only the player's own guesses, after they choose to share their result. */
export function encodeReveal({
  number,
  elapsedMs,
  words,
}: {
  number: number;
  elapsedMs: number;
  words: readonly ShareWord[];
}): string {
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    words.length > MAX_WORDS
  ) {
    throw new RangeError("Invalid share result");
  }
  const marked = markedWords(words);
  const w = marked.map(({ word, landing, filled }) => {
    if (typeof word !== "string" || !word.length || word.length > MAX_ANSWER_LENGTH) {
      throw new RangeError("Invalid share word");
    }
    const code =
      landing.kind === "target"
        ? CODES[landing.key]
        : { line: "l", single: "s", outside: "o" }[landing.kind];
    // Digits have no uppercase form, so A/B/C mark a first fill in c1/c2/c3.
    const encoded =
      filled && landing.kind === "target" && landing.key !== "center"
        ? { c1: "A", c2: "B", c3: "C" }[landing.key]
        : filled
          ? code.toUpperCase()
          : code;
    return [word, encoded];
  });
  const json = JSON.stringify({ v: 1, n: number, t: Math.floor(elapsedMs / 1000), w });
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const code = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  if (code.length > MAX_CODE_LENGTH) throw new RangeError("Share link is too long");
  return code;
}

/** Invalid or tampered links never render user-supplied content. */
export function decodeReveal(code: string): Reveal | null {
  if (
    typeof code !== "string" ||
    !code.length ||
    code.length > MAX_CODE_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(code)
  )
    return null;
  try {
    const base64 = code.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64);
    if (btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") !== code)
      return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    if (
      Object.keys(data).sort().join(",") !== "n,t,v,w" ||
      data.v !== 1 ||
      !Number.isSafeInteger(data.n) ||
      (data.n as number) < 1 ||
      !Number.isSafeInteger(data.t) ||
      (data.t as number) < 0 ||
      !Array.isArray(data.w) ||
      data.w.length > MAX_WORDS
    )
      return null;

    const words: ShareWord[] = [];
    const fillFlags: boolean[] = [];
    const seen = new Set<string>();
    for (const entry of data.w) {
      if (!Array.isArray(entry) || entry.length !== 2) return null;
      const [word, letter] = entry;
      if (
        typeof word !== "string" ||
        !word.length ||
        word.length > MAX_ANSWER_LENGTH ||
        typeof letter !== "string"
      )
        return null;
      const normalized = word.toLowerCase();
      if (seen.has(normalized)) return null;
      seen.add(normalized);
      const filledPair = { A: "c1", B: "c2", C: "c3" } as const;
      const pair = filledPair[letter as keyof typeof filledPair];
      const low = letter.toLowerCase();
      let landing: Landing;
      if (pair) landing = { kind: "target", key: pair };
      else if (low === "m") landing = { kind: "target", key: "center" };
      else if (low === "1" || low === "2" || low === "3")
        landing = { kind: "target", key: `c${low}` as TargetKey };
      else if (low === "l") landing = { kind: "line" };
      else if (low === "s") landing = { kind: "single" };
      else if (low === "o") landing = { kind: "outside" };
      else return null;
      words.push({ word, landing });
      fillFlags.push(Boolean(pair) || letter !== low);
    }
    const marked = markedWords(words);
    if (marked.some((word, index) => word.filled !== fillFlags[index])) return null;
    return { number: data.n as number, elapsedMs: (data.t as number) * 1000, words: marked };
  } catch {
    return null;
  }
}

export function shareText({
  number,
  guesses,
  elapsedMs,
  origin,
}: {
  number: number;
  guesses: readonly ShareWord[];
  elapsedMs: number;
  origin: string;
}): string {
  const words = markedWords(guesses);
  const squares = Array.from(squareRow(words));
  const row = squares.length > 40 ? `${squares.slice(0, 40).join("")}…` : squares.join("");
  let link = new URL(origin).origin;
  try {
    const code = encodeReveal({ number, elapsedMs, words: guesses });
    link += `/s/${code}`;
  } catch {
    // A result can exceed the share-link limits without ending the game.
  }
  return `Liminal #${number}\n${row}\n${scoreLine(guesses.length, elapsedMs)}\n${link}`;
}
