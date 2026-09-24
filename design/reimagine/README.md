# Liminal, reimagined

**Outcome (2026-09-23):** the operator chose the in-between direction (fill
the center and the three pair regions). It is built in `src/` and specified in
the root `DESIGN.md`; the probes and rule change behind it are in
`evidence/calibration-findings.md`. Everything below is the exploration that led
there, kept as lineage.

Design exploration, 2026-09-23. Nothing here changes the live product. Every
change to the current product contract (see "Contract changes the operator
decides") needs an explicit operator call.

Run the prototypes: `bun design/reimagine/serve.ts`, then open
<http://localhost:4317/>. By default only the deck's authored answers and near
misses are judged; other words are refused without spending a guess.

For open play, run the app's own judge locally (process-local cache, nothing
durable) and point the prototypes at it. Never point them at production: a
deployed judge stores confident verdicts in its durable cache.

```sh
pass-env run -e OPENROUTER_API_KEY=workstation/LIMINAL_OPENROUTER_API_KEY -- bun run dev --port 3000
LIMINAL_JUDGE_URL=http://localhost:3000/api/judge bun design/reimagine/serve.ts
```

## Brief

**The player's job:** in two minutes a day, name one thing that sits exactly
where several ideas overlap, feel clever for finding it, and see how your
thinking travelled there.

**What is strong and must survive:**

- Open answers. You bring your own vocabulary and many answers are right. The
  live judge makes any word playable; no other daily puzzle does this.
- Per-condition feedback. Every guess tells you which ideas it satisfied, so
  the space narrows.
- The lateral turn: "you make it, you take it, you cannot hold it" (decision).

**The name already contains the right metaphor.** Liminal means the threshold,
the in-between. The mechanic is an intersection: the answer lives where the
circles overlap, and "close" means sitting on the line. The current design
imports a second, unrelated metaphor (a brass cabinet of drawers) and then
spends copy explaining it.

## Diagnosis of the live product

Observed at <https://liminal.mistystep.io>, 2026-09-23, desktop 1280 px.

1. **Two metaphors fight.** The name is a threshold; the UI is a cabinet. The
   cabinet forces copy with no game meaning: "Try the drawer", "The drawer is
   considering it", "In the drawer", "Drawer settled", "Drawer IV".
2. **Idle inventory.** Before the first guess the screen shows about twenty
   elements: mark, wordmark, tagline, two tabs, drawer number, mode chip,
   title, teaser, legend label and three legend items, three conditions each
   with an index and a Waiting status, field label and hint, field, button,
   counter, five pips, footer line, report link. Wordle idle is a grid and a
   keyboard.
3. **The puzzle is stated three times.** Title ("Pass or Fail"), teaser ("You
   can pass it and you can fail it: but you will never hold it") and the three
   conditions say the same thing.
4. **No arc.** All conditions are visible, answers are plentiful, five guesses
   are generous. Most players read, think of one, and win on the first or
   second guess. There is no tension, no turn, nothing to share.
5. **Close is hard to act on.** It is a third label in a legend, not a place.
6. **Refusals land on the obvious answers.** "exam", "physical", "test",
   "bidet", "suggestion" are refused below the confidence floor. The honest
   refusal is right; the copy ("Judging is unavailable") reads as an outage
   and gives no direction.
7. **Engineering distinctions surface as chrome.** "Literal object" and
   "Wordplay" chips are authoring categories; the condition wording already
   carries the sense.
8. **Practice is a second screen for a four-puzzle deck.** The cabinet grid
   with "Untouched" states adds a mode without adding play.
9. **The look is generic.** Near-black with a single brass accent, tracked
   all-caps eyebrows, 01/02/03 markers on things that are not sequences,
   chips, rails.

## Contract changes the operator decides

Current rules from `AGENTS.md`, with what this exploration proposes.

| Current rule | Proposal |
| --- | --- |
| Solo only | Keep |
| Several legitimate answers | Keep, and show them at the end |
| Five guesses | Keep |
| Persistent per-puzzle history | Keep |
| Daily + Practice as two modes | Daily is the product; past and spare puzzles move behind "Play another" after you finish |
| Outside / Close / Inside per condition | Keep the three states, express them as place: outside the circle, on its line, inside |
| Literal and wordplay labeled | Stop labeling; keep judging them separately |
| Reject echo, invented, instruction-like input | Keep |
| Guess consumed only on confident judgment | Keep |
| Honest outages | Keep, with directive copy |
| New: conditions arrive one at a time | Proposed (see Narrowing) |

## References: principles, not pixels

- **Wordle.** The history is the board; there is no separate results panel.
  A one-time how-to replaces permanent legends. The share artifact encodes the
  path without spoiling the answer. Limit: Wordle has one answer; we have many.
- **Connections.** One arc per day with difficulty that rises, and one reveal.
  Limit: its tiers are authored per group; ours come from condition order.
- **Spelling Bee.** Open answers need a reason to care beyond win/lose; it
  shows breadth. Limit: rank systems add a dashboard; we show the other
  answers instead.
- **Semantle and Contexto (anti-reference).** AI-judged open answers with a
  numeric proximity readout become a dashboard and a long grind. Confirms the
  rule "never decimal dashboards".
- **Venn diagrams, literally.** Membership as position needs no legend: in,
  out, on the line.

## Six concepts

Each concept names its archetype and its structural claim. Rubric dimensions:
job, content model, layout, density, type, material, unit, motion.

### 1. Quiet list (conservative)

- Archetype: operate.
- Stance: same game, a tenth of the chrome.
- Structure: three conditions in a list; five empty guess rows below, each row
  a word plus three marks aligned to the conditions, like Wordle rows. No tabs,
  chips, title, teaser or legend.
- Differs from today by removing everything except conditions, rows and one
  field; the mechanic is unchanged.

### 2. Venn (evolutionary)

- Archetype: explore.
- Stance: the board is a three-circle diagram; every guess is placed where it
  belongs.
- Structure: spatial content model. Circles are labeled with the conditions.
  Inside, on the line (close), outside. Your five words accumulate on the
  board as a map of your thinking. The center is the win.
- Differs from Quiet by replacing rows with position, so feedback needs no
  legend and the history is spatial.

### 3. Narrowing (evolutionary, behavioral)

- Archetype: decide/learn.
- Stance: the circles arrive one at a time.
- Structure: stage 1 shows one condition; land a word inside it and the second
  circle appears; words already on the board slide into it if they fit; then
  the third. The authored near misses (cake: made and taken, but you can hold
  it) become the turn that the final circle springs.
- Differs from Venn by changing behavior over time: reading load drops to one
  line, difficulty rises, and the last circle creates a turn.

### 4. Rarity (radical, social)

- Archetype: compare.
- Stance: everyone can find an answer; the score is how few other players
  found yours.
- Structure: three tries to land an answer; the first inside answer locks;
  the end shows your answer's share and the spread of what others found.
- Needs anonymous per-puzzle answer counts (a privacy and moderation change:
  today no player text is stored in events).

### 5. Hidden circles (radical, deduction)

- Archetype: decide/learn.
- Stance: the conditions are hidden; deduce them from where your words land.
- Structure: unlabeled circles; guesses land in regions; deduce, then aim for
  the center.

### 6. Threshold (wildcard, out of family)

- Archetype: decide.
- Stance: two rooms, one doorway. "Kitchen | Bathroom": name what lives on the
  threshold.
- Structure: two conditions, one line between them, binary judgment.

## Comparative critique

Judged against the player's job: find the overlap, feel clever, see the path.

### 1. Quiet list: survives as the baseline

- Optimizes: legibility and build cost; ships in a day on the current engine.
- Sacrifices: the arc. It fixes noise, not flatness.
- Wins for: a cautious release that keeps every current rule.
- Fails when: a player solves on guess one, which is the common case.
- Keep: one field, no permanent legend, sentence-case copy, guess rows as
  the budget indicator.

### 2. Venn: merges

- Optimizes: self-explanatory feedback; close becomes the line, which is the
  name of the game made visible.
- Sacrifices: nothing structural; needs exactly three conditions (the whole
  deck already has three) and careful label layout at 360 px.
- Wins for: first-time players; the board reads without instructions.
- Fails when: all conditions are visible from the start, the puzzle is still
  flat.
- Keep: position as feedback, the target region, the center fill as the win.

### 3. Narrowing: survives, becomes the spine

- Optimizes: the arc. One line to read at a time, rising difficulty, and a
  turn authored into the deck that already exists (near misses fail exactly
  one condition, so they are ready-made lures).
- Sacrifices: order now matters; each puzzle's condition order must put the
  turn last. A first-guess solve becomes rare and lucky rather than normal.
- Wins for: the daily habit; each puzzle has a small story.
- Fails when: the last condition is not a turn (Pass or Fail's third
  condition is weak); authoring must own this.
- Keep: staged reveal, words sliding into new circles, score as guesses used.

### 4. Rarity: deferred

- Optimizes: replay and sharing; makes "many answers" the point.
- Sacrifices: needs stored player text, a minimum-count rule before showing
  anyone's answer, and a cold start with few players.
- Wins for: a larger audience later.
- Fails when: there are too few players for the share to mean anything.
- Keep: the end screen shows other ways in; the slot can hold shares later.

### 5. Hidden circles: rejected

- The judge misplaces some words (see `evidence/calibration-findings.md`).
  With visible conditions the player can see and report a wrong call; with
  hidden ones a misjudgment is indistinguishable from a wrong deduction.
  Unfair by construction.

### 6. Threshold: rejected

- Two conditions lose the three-way overlap, which is the core. It is a
  different game.

## Synthesis: Narrowing

- Spine: Narrowing's staged reveal. It is the only concept that fixes the
  missing arc, and it reuses the deck's near misses as intended turns.
- Grafts:
  - Venn's board: position is the feedback, the line is close, the center is
    the win. Removes the legend.
  - Venn's target region: the overlap of the visible circles is shaded, so the
    shrinking target is visible at every stage.
  - Quiet's discipline: one field, five dots, no tabs, chips, title or teaser.
  - Rarity's end screen slot: "Other ways in" lists more answers now and can
    hold answer shares later.
- Dropped: drawer and cabinet metaphor, brass-on-ink palette, mode chips,
  legend, per-condition Waiting labels, title and teaser, the Practice tab
  (becomes "Play another" after finishing).

## Finalists

| File | Concept | What to try |
| --- | --- | --- |
| `quiet.html` | Quiet list | The current mechanic with no chrome |
| `venn.html` | Venn | All circles visible, placement as feedback |
| `narrowing.html` | Synthesis | Circles arrive one at a time |
| `reach.html` | Experiment | Narrowing, then keep going for a way in nobody listed |

## Experiment: Reach

Reach tests the mechanics critique: in Narrowing, luck decides the score and
nothing rewards a good answer over an obvious one.

- **Rules.** Narrowing until your first word lands in the center. The game
  does not end there: keep placing words with the guesses you have left, or
  tap "Stop here". Misses after a find cost a guess but never take the find
  away. The game ends when you stop or the five guesses run out.
- **Listed or not.** The deck's authored answers are "our list", the answers
  the setters expected. A variant that contains one still counts as listed
  ("pedestal sink", "sinks"). Any other word the judge places in the center is
  off the list: its pill gets an amber ring and the result says so.
- **Result.** "Off the list" if you found one, otherwise "Found in N". The end
  panel names what you found and shows the whole list. Share rows mark an
  off-the-list find with ✦ and end with "Found in 2. Off the list in 3."
- **Honest limits.** Hunting costs nothing but guesses, so the push-your-luck
  choice is soft. Listing is a local rule over authored answers, not player
  data; "rarer than N% of players" would need anonymous answer counts, which
  is a privacy decision.

**What to watch in a test** (five players, Reach against Narrowing, the same
two puzzles, one after the other):

1. How often the first word wins outright.
2. Whether players keep going after the first find, and how many guesses they
   spend before stopping.
3. Whether "off the list" feels earned or cheap (specific variants, borderline
   calls by the judge).
4. Whether any loss feels unfair, and whether the judge caused it.

If players stop at the first find, drop Reach and keep Narrowing with the
authoring trap rule.

Refinement notes and the before/after record live in `REFINEMENT.md` (the
pre-refinement build is frozen in `v1/`); the handoff spec is
`DESIGN.proposed.md`.
