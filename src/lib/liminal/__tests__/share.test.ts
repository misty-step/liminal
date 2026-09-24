import { describe, expect, it } from "vitest";
import type { Landing } from "../regions";
import { decodeReveal, encodeReveal, shareText } from "../share";

const target = (key: "c1" | "c2" | "c3" | "center"): Landing => ({ kind: "target", key });
const mixed = [
  { word: "café", landing: target("c2") },
  { word: "wait", landing: { kind: "outside" } as Landing },
  { word: "orchid", landing: target("c3") },
  { word: "again", landing: target("c2") },
  { word: "torch", landing: target("c1") },
  { word: "heart", landing: target("center") },
];

function result(number: number, words: typeof mixed, elapsedMs = 84_000) {
  return { number, guesses: words, elapsedMs, origin: "https://liminal.mistystep.io" };
}

describe("share text (US-007)", () => {
  it("uses exactly four lines, with first-fill squares and no answer words", () => {
    const text = shareText(result(12, mixed));
    const code = encodeReveal({ number: 12, elapsedMs: 84_000, words: mixed });
    expect(text).toBe(
      `Liminal #12\n🟩⬜🟪⬜🟧⬛\n6 guesses, 1:24\nhttps://liminal.mistystep.io/s/${code}`,
    );
    expect(text.split("\n").slice(0, 3).join("\n")).not.toMatch(
      /café|orchid|again|torch|heart|wait/,
    );
  });

  it("marks four clean first fills as perfect and uses the supplied origin", () => {
    const words = [mixed[0], mixed[2], mixed[4], mixed[5]];
    const text = shareText({ ...result(1, words, 59_900), origin: "http://localhost:3000" });
    expect(text).toBe(
      `Liminal #1\n🟩🟪🟧⬛\n4 guesses, 0:59 🎯\nhttp://localhost:3000/s/${encodeReveal({ number: 1, elapsedMs: 59_900, words })}`,
    );
  });
  it("still shares a seventy-guess game without an oversized reveal link", () => {
    const guesses = [
      { word: "first", landing: target("c3") },
      { word: "second", landing: target("c2") },
      { word: "third", landing: target("c1") },
      { word: "fourth", landing: target("center") },
      ...Array.from({ length: 66 }, (_, index) => ({
        word: `miss ${index}`,
        landing: { kind: "outside" } as Landing,
      })),
    ];
    expect(shareText(result(12, guesses))).toBe(
      `Liminal #12\n🟪🟩🟧⬛${"⬜".repeat(36)}…\n70 guesses, 1:24\nhttps://liminal.mistystep.io`,
    );
  });

  it("falls back to the root when words make a reveal code too long", () => {
    const guesses = Array.from({ length: 25 }, (_, index) => ({
      word: `${index} ${"a".repeat(115)}`,
      landing: { kind: "outside" } as Landing,
    }));
    expect(shareText(result(12, guesses)).split("\n")[3]).toBe("https://liminal.mistystep.io");
  });
});

describe("reveal code (US-007)", () => {
  it("round trips Unicode words, first fills, landing positions and whole seconds", () => {
    const code = encodeReveal({ number: 12, elapsedMs: 84_999, words: mixed });
    expect(decodeReveal(code)).toEqual({
      number: 12,
      elapsedMs: 84_000,
      words: mixed.map((word, index) => ({ ...word, filled: [0, 2, 4, 5].includes(index) })),
    });
    expect(JSON.parse(Buffer.from(code, "base64url").toString("utf8"))).toEqual({
      v: 1,
      n: 12,
      t: 84,
      w: [
        ["café", "B"],
        ["wait", "o"],
        ["orchid", "C"],
        ["again", "2"],
        ["torch", "A"],
        ["heart", "M"],
      ],
    });
  });

  it("rejects malformed, oversized, wrong-version and inconsistent links", () => {
    const pack = (value: unknown) =>
      btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    for (const code of [
      "not-a-code",
      "x".repeat(2001),
      pack({ v: 2, n: 1, t: 1, w: [] }),
      pack({ v: 1, n: -1, t: 1, w: [] }),
      pack({ v: 1, n: 1, t: 1, w: [["word", "z"]] }),
      pack({ v: 1, n: 1, t: 1, w: [["word", "1"]] }),
      pack({
        v: 1,
        n: 1,
        t: 1,
        w: [
          ["word", "A"],
          ["again", "A"],
        ],
      }),
      pack({ v: 1, n: 1, t: 1, w: [["w".repeat(121), "M"]] }),
      pack({ v: 1, n: 1, t: 1, w: Array.from({ length: 61 }, () => ["w", "o"]) }),
    ])
      expect(decodeReveal(code)).toBeNull();
  });
});
