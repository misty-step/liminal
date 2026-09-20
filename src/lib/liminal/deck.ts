import type { Puzzle } from "./types";

/**
 * The curated launch deck. Every puzzle ships with:
 * - several verified answers that satisfy every condition,
 * - near misses that fail exactly one condition (tested in deck.test.ts).
 *
 * Bump a puzzle's judgments.version whenever its answers, near misses, or
 * conditions change. Runtime caches key on that version, so an edit cannot
 * reroll an existing judgment.
 */
export const DECK_VERSION = "2026-09-20.1";

export const DECK: readonly Puzzle[] = [
  {
    id: "pocket-relic",
    title: "The Pocket Relic",
    drawer: "Drawer I — Small Relics",
    mode: "literal",
    teaser: "Something old and smooth that you could close your hand around.",
    conditions: [
      {
        id: "c1",
        text: "A small physical object — it fits in a closed hand",
        judge: "Is `answer` a small physical object that fits in a closed hand?",
      },
      {
        id: "c2",
        text: "Made of stone, metal, or glass",
        judge: "Is `answer` made of stone, metal, or glass?",
      },
      {
        id: "c3",
        text: "Worn smooth by time or handling — not sharp, not rough",
        judge: "Is `answer` worn smooth by time or handling — neither sharp nor rough?",
      },
    ],
    judgments: {
      version: "2026-09-20.1",
      answers: ["pebble", "marble", "coin", "bead", "gemstone", "ring", "key"],
      nearMisses: [
        { answer: "boulder", fails: "c1", note: "Right material, far too big." },
        { answer: "sponge", fails: "c2", note: "Small and soft, but not stone, metal, or glass." },
        { answer: "glass shard", fails: "c3", note: "Glass and small, but sharp by definition." },
        { answer: "nail", fails: "c3", note: "Metal and small, but it ends in a point." },
        { answer: "geode", fails: "c3", note: "Stone and small, but rough until cut open." },
      ],
    },
  },
  {
    id: "kitchen-well",
    title: "The Kitchen Well",
    drawer: "Drawer II — Kitchen Wells",
    mode: "literal",
    teaser: "Vessels that keep what you pour into them.",
    conditions: [
      { id: "c1", text: "A container", judge: "Is `answer` a container?" },
      { id: "c2", text: "Found in a kitchen", judge: "Would `answer` be found in a kitchen?" },
      {
        id: "c3",
        text: "Can hold liquid without leaking",
        judge: "Can `answer` hold liquid without leaking?",
      },
    ],
    judgments: {
      version: "2026-09-20.1",
      answers: ["mug", "teapot", "pitcher", "kettle", "jar", "jug", "bowl", "bottle", "pan", "wok"],
      nearMisses: [
        { answer: "colander", fails: "c3", note: "A kitchen vessel with deliberate holes." },
        { answer: "sieve", fails: "c3", note: "Built to let liquid through." },
        { answer: "basket", fails: "c3", note: "Holds bread, not liquid." },
        { answer: "sponge", fails: "c1", note: "Holds water, but it is not a container." },
        { answer: "funnel", fails: "c3", note: "Channels liquid onward instead of holding it." },
      ],
    },
  },
  {
    id: "hidden-measures",
    title: "Hidden Measures",
    drawer: "Drawer III — Hidden Measures",
    mode: "wordplay",
    teaser: "The unit is in there somewhere — just not where you would look first.",
    conditions: [
      {
        id: "c1",
        text: "A real, recognizable thing — not a person, place, or action",
        judge: "Is `answer` a real, recognizable thing — not a person, a place, or an action?",
      },
      {
        id: "c2",
        text: "Its name hides a unit of measurement in consecutive letters",
        judge:
          "Do the letters of the name of `answer` contain a unit of measurement as consecutive letters (for example, 'bar' inside 'wheelbarrow')?",
      },
      {
        id: "c3",
        text: "The hidden unit is not at the start or end of the name",
        judge:
          "Within the name of `answer`, is the hidden unit of measurement somewhere other than the very start or the very end of the name?",
      },
    ],
    judgments: {
      version: "2026-09-20.1",
      answers: ["wheelbarrow", "windmill", "treadmill", "trampoline", "lampshade", "lamppost"],
      nearMisses: [
        { answer: "cupcake", fails: "c3", note: "Cup hides at the very start." },
        { answer: "inchworm", fails: "c3", note: "Inch leads the name." },
        { answer: "graveyard", fails: "c3", note: "Yard sits at the end." },
        { answer: "kilogram", fails: "c2", note: "The whole word is the unit — nothing is hidden." },
        { answer: "amphora", fails: "c3", note: "Amp leads the name." },
        { answer: "campsite", fails: "c1", note: "Amp hides mid-word, but a campsite is a place." },
      ],
    },
  },
  {
    id: "silent-partners",
    title: "Silent Partners",
    drawer: "Drawer IV — Silent Partners",
    mode: "wordplay",
    teaser: "Each keeps a letter it never says out loud.",
    conditions: [
      {
        id: "c1",
        text: "A real, recognizable thing — not a person, place, or action",
        judge: "Is `answer` a real, recognizable thing — not a person, a place, or an action?",
      },
      {
        id: "c2",
        text: "Its name contains a silent letter",
        judge:
          "Does the name of `answer` contain a silent letter — a letter that is not pronounced when the word is spoken, such as the 'b' in 'comb' or the 't' in 'castle'?",
      },
      {
        id: "c3",
        text: "The silent letter is not the first letter of the name",
        judge:
          "In the name of `answer`, is the silent letter somewhere other than the first letter of the name?",
      },
    ],
    judgments: {
      version: "2026-09-20.1",
      answers: [
        "castle",
        "whistle",
        "comb",
        "thumb",
        "sandwich",
        "chalk",
        "salmon",
        "yolk",
        "tomb",
        "bomb",
        "handkerchief",
      ],
      nearMisses: [
        { answer: "knife", fails: "c3", note: "The k is silent, but it opens the word." },
        { answer: "gnome", fails: "c3", note: "The g is silent, but it opens the word." },
        { answer: "hourglass", fails: "c3", note: "The h is silent, but it opens the word." },
        { answer: "wristwatch", fails: "c3", note: "The w is silent, but it opens the word." },
        { answer: "listen", fails: "c1", note: "A silent t hides inside, but listening is an action." },
      ],
    },
  },
];

export function getPuzzle(id: string): Puzzle | undefined {
  return DECK.find((puzzle) => puzzle.id === id);
}
