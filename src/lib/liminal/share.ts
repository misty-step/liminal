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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function parseLandingCode(letter: unknown): { landing: Landing; filled: boolean } | null {
  switch (letter) {
    case "A":
      return { landing: { kind: "target", key: "c1" }, filled: true };
    case "B":
      return { landing: { kind: "target", key: "c2" }, filled: true };
    case "C":
      return { landing: { kind: "target", key: "c3" }, filled: true };
    case "M":
      return { landing: { kind: "target", key: "center" }, filled: true };
    case "1":
      return { landing: { kind: "target", key: "c1" }, filled: false };
    case "2":
      return { landing: { kind: "target", key: "c2" }, filled: false };
    case "3":
      return { landing: { kind: "target", key: "c3" }, filled: false };
    case "m":
      return { landing: { kind: "target", key: "center" }, filled: false };
    case "l":
      return { landing: { kind: "line" }, filled: false };
    case "s":
      return { landing: { kind: "single" }, filled: false };
    case "o":
      return { landing: { kind: "outside" }, filled: false };
    default:
      return null;
  }
}

function parseRevealPayload(value: unknown): Reveal | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "n,t,v,w") return null;
  if (
    value.v !== 1 ||
    !isSafeInteger(value.n) ||
    value.n < 1 ||
    !isSafeInteger(value.t) ||
    value.t < 0 ||
    !Array.isArray(value.w) ||
    value.w.length > MAX_WORDS
  ) {
    return null;
  }

  const words: ShareWord[] = [];
  const fillFlags: boolean[] = [];
  const seen = new Set<string>();
  for (const entry of value.w) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [word, letter] = entry;
    if (typeof word !== "string" || !word.length || word.length > MAX_ANSWER_LENGTH) return null;
    const normalized = word.toLowerCase();
    if (seen.has(normalized)) return null;
    seen.add(normalized);
    const parsed = parseLandingCode(letter);
    if (!parsed) return null;
    words.push({ word, landing: parsed.landing });
    fillFlags.push(parsed.filled);
  }
  const marked = markedWords(words);
  if (marked.some((word, index) => word.filled !== fillFlags[index])) return null;
  return { number: value.n, elapsedMs: value.t * 1000, words: marked };
}

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
    return parseRevealPayload(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
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
