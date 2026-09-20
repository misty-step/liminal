import type { Puzzle } from "./types";

/**
 * The curated launch deck. Every puzzle is a semantic intersection puzzle: a
 * thing (or, in wordplay drawers, a word's idiomatic use) that satisfies
 * several independent clues at once. Every puzzle ships with:
 * - several verified answers that satisfy every condition,
 * - near misses that fail exactly one condition (tested in deck.test.ts),
 * - held-out valid answers that are NOT in the allowlist: scripts/live-matrix.ts
 *   must show the live semantic judge accepting them (open-answer guarantee).
 *
 * Bump a puzzle's judgments.version (and DECK_VERSION) whenever its answers,
 * near misses, or conditions change. Runtime caches key on the judgment and
 * prompt versions, so an edit cannot silently reroll an existing judgment.
 *
 * judgeStatus stays "uncalibrated" until scripts/live-matrix.ts passes live;
 * the flip to "calibrated" is the freeze step and ships in its own commit with
 * the raw matrix evidence.
 */
export const DECK_VERSION = "2026-09-20.3";

export const DECK: readonly Puzzle[] = [
  {
    id: "bath-vessel",
    title: "The Vessel in the Wall",
    drawer: "Drawer I — The Wash Room",
    mode: "literal",
    teaser: "It belongs where you bathe, water runs through it, and it can hold a pool.",
    judgeStatus: "calibrated",
    conditions: [
      {
        id: "c1",
        text: "Commonly found in a bathroom",
        judge: "Is `answer` commonly found in a bathroom?",
        levels: {
          yes: "A thing you would expect to see in a bathroom in most homes.",
          partly: "Occasionally kept in a bathroom, but a bathroom is not where it usually lives.",
          no: "Not something found in bathrooms.",
        },
      },
      {
        id: "c2",
        text: "Plumbed in — it has a drain or pipes",
        judge: "Is `answer` plumbed in — does it have a drain or water pipes as part of what it is?",
        levels: {
          yes: "Plumbed in — a drain, pipes, or both are part of it.",
          partly: "Sometimes plumbed in, sometimes not.",
          no: "Not plumbed in — no drain, no pipes; you could carry it away.",
        },
      },
      {
        id: "c3",
        text: "It can hold a pool of water",
        judge: "Can `answer` hold a pool of water — could you fill it, with any drain closed, and the water would stay?",
        levels: {
          yes: "Yes — you could fill it and the water would stay (a plugged sink, a full tub).",
          partly: "It can hold a little water briefly, but not a standing pool.",
          no: "Water runs through or off it — nothing stays.",
        },
      },
    ],
    judgments: {
      version: "2026-09-20.3",
      answers: ["sink", "bathtub", "washbasin", "toilet"],
      heldOut: ["pedestal sink", "toilet bowl"],
      nearMisses: [
        { answer: "kitchen sink", fails: "c1", note: "Plumbed in and it holds a pool — but it lives in the kitchen." },
        { answer: "shampoo bottle", fails: "c2", note: "In the bathroom and holds liquid, but you could carry it away." },
        { answer: "faucet", fails: "c3", note: "Water runs through it all day — none of it stays." },
        { answer: "shower head", fails: "c3", note: "Water runs through it all day — none of it stays." },
      ],
    },
  },
  {
    id: "kitchen-well",
    title: "The Kitchen Well",
    drawer: "Drawer II — Kitchen Wells",
    mode: "literal",
    teaser: "Vessels that keep what you pour into them.",
    judgeStatus: "calibrated",
    conditions: [
      {
        id: "c1",
        text: "A container",
        judge: "Is `answer` a container?",
        levels: {
          yes: "It is a vessel — made to hold things inside it, even if it has holes or lets liquid drain.",
          partly: "It can hold things, but containing is not what it is.",
          no: "Not a container at all.",
        },
      },
      {
        id: "c2",
        text: "Found in a kitchen",
        judge: "Is `answer` commonly found in a kitchen?",
        levels: {
          yes: "A kitchen thing — it belongs in the world of kitchens.",
          partly: "Occasionally found in a kitchen, but it is not really a kitchen thing.",
          no: "Not a kitchen thing at all.",
        },
      },
      {
        id: "c3",
        text: "Can hold liquid without leaking",
        judge: "Can `answer` hold liquid without leaking — could you pour water in and have it stay?",
        levels: {
          yes: "Yes — you could pour water in and it would stay.",
          partly: "It holds liquid briefly, or only a little.",
          no: "Liquid runs straight through or out of it.",
        },
      },
    ],
    judgments: {
      version: "2026-09-20.3",
      answers: ["mug", "teapot", "pitcher", "kettle", "jar", "jug", "bowl", "bottle", "pan", "wok"],
      heldOut: ["tumbler", "measuring cup", "carafe"],
      nearMisses: [
        { answer: "colander", fails: "c3", note: "A kitchen vessel with deliberate holes." },
        { answer: "aquarium", fails: "c2", note: "A container that holds water, but it lives in the living room." },
        { answer: "watering can", fails: "c2", note: "A container that pours, but it lives in the garden shed." },
        { answer: "barrel", fails: "c2", note: "It holds liquid, but it lives in the cellar." },
        { answer: "vase", fails: "c2", note: "It holds water for flowers, but it lives on the table." },
        { answer: "bucket", fails: "c2", note: "It carries liquid, but it belongs to the mop, not the kitchen." },
      ],
    },
  },
  {
      id: "made-and-taken",
      title: "Made and Taken",
      drawer: "Drawer III — Made and Taken",
      mode: "wordplay",
      teaser: "People make it and people take it — but you will never once hold it.",
      judgeStatus: "calibrated",
      conditions: [
        {
          id: "c1",
          text: "You can make it — people really say this",
          judge: "Consider `answer`. In natural English, can people 'make' it?",
          levels: {
            yes: "People really do 'make' it — a familiar usage.",
            partly: "'Make' is possible but unusual or strained.",
            no: "People do not 'make' it.",
          },
        },
        {
          id: "c2",
          text: "You can take it — people really say this",
          judge: "Consider `answer`. In natural English, can people 'take' it?",
          levels: {
            yes: "People really do 'take' it — a familiar usage.",
            partly: "'Take' is possible but unusual or strained.",
            no: "People do not 'take' it.",
          },
        },
        {
          id: "c3",
          text: "It is not a physical object",
          judge: "Is `answer` an abstraction — not a physical object you could pick up?",
          levels: {
            yes: "An abstraction — not something you can pick up.",
            partly: "It has both abstract and physical senses.",
            no: "A physical object.",
          },
        },
      ],
      judgments: {
        version: "2026-09-20.3",
        answers: ["decision", "phone call", "wrong turn", "u-turn", "apology"],
        heldOut: ["conference call", "vow", "mental note"],
        nearMisses: [
          { answer: "cake", fails: "c3", note: "You make it and take it to the party — and you can hold the leftovers." },
          { answer: "pie", fails: "c3", note: "You make it and take it to the picnic — and you could pick up a slice." },
          { answer: "sandwich", fails: "c3", note: "You make it and take it to lunch — and you can hold it in one hand." },
          { answer: "salad", fails: "c3", note: "You make it and take it to the potluck — and you can carry the bowl." },
        ],
      },
    },
  {
    id: "pass-or-fail",
    title: "Pass or Fail",
    drawer: "Drawer IV — Pass or Fail",
    mode: "wordplay",
    teaser: "You can pass it and you can fail it — but you will never hold it in your hands.",
    judgeStatus: "calibrated",
    conditions: [
      {
        id: "c1",
        text: "You can pass it — clear it, succeed at it",
        judge:
          "Consider `answer`. In natural English, can people 'pass' it in the sense of clearing it or succeeding at it?",
        levels: {
          yes: "People really do 'pass' it, in the succeed sense.",
          partly: "Possible but unusual or strained.",
          no: "People do not 'pass' it in the succeed sense.",
        },
      },
      {
        id: "c2",
        text: "You can fail it",
        judge: "Consider `answer`. In natural English, can people 'fail' it — or can it itself fail?",
        levels: {
          yes: "People really do 'fail' it, or say that it failed.",
          partly: "Possible but unusual or strained.",
          no: "People do not 'fail' it, and it does not fail.",
        },
      },
      {
        id: "c3",
        text: "It is something that happens — not a thing you could touch",
        judge:
          "Is `answer` something that happens — an occasion or a procedure a person goes through — not a physical object you could pick up?",
        levels: {
          yes: "An occasion or procedure — something that happens; not an object you could pick up.",
          partly: "It has both an event sense and a physical sense.",
          no: "A physical object.",
        },
      },
    ],
    judgments: {
      version: "2026-09-20.3",
      answers: ["audition", "interview", "drug test", "driving test"],
      heldOut: ["eye test", "background check"],
      nearMisses: [
        { answer: "launch", fails: "c1", note: "It can fail on the pad — but nobody passes it." },
        { answer: "takeover", fails: "c1", note: "It can fail in the boardroom — but nobody passes it." },
        { answer: "rescue", fails: "c1", note: "It can fail in the attempt — but nobody passes it." },
      ],
    },
  },
];

export function getPuzzle(id: string): Puzzle | undefined {
  return DECK.find((puzzle) => puzzle.id === id);
}
