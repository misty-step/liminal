# Narrowing: refinement record

Before: `v1/narrowing.html` (frozen copy of the first clickable build, with its
own copies of the shared files). After: `narrowing.html`.

Every finalist was played on all four deck puzzles at 390 px, 360 px and
1280 px. During exploration the prototype server proxied unknown guesses to
the production judge, which stores confident verdicts in its shared D1 cache;
about 30 exploration guesses were written there. They are the same verdicts
any player typing those words would get, and they were not removed. The proxy
is now opt-in and never defaults to production.

## What playing the finalists showed

- **Quiet list** is the most legible, and still flat. On Made and Taken you read
  three lines, think "decision", and win on guess one. Noise fixed, arc not.
- **Venn** makes feedback self-explanatory and makes "close" literal (on the
  line). With all three circles visible from the start it is the same flat
  puzzle, and by guess four the board is busy.
- **Narrowing** produced the turn every time the deck allowed it: towel (in the
  bathroom) slides out of Plumbed in; shower head opens the third circle and
  then sits on the line of Holds a pool of water; cake fits make and take, then
  lands on the line of You can't hold it. One line to read at a time.
- **Pass or Fail breaks Narrowing.** Almost anything you "pass" in the succeed
  sense is also failable and is an occasion, so first guesses cascade straight
  to the center (job interview, driving test). The puzzle has no lure. This is
  an authoring rule, recorded in `DESIGN.proposed.md`.
- **Canonical bare words are still refused** (exam, the salt, promise, napkin).
  The new copy directs instead of reporting an outage, and spends nothing, but
  judge coverage for bare polysemous words remains a product gap.

## Critique of v1 and what changed

| v1 finding | Change | Result |
| --- | --- | --- |
| A word on a line looked like a word inside a circle | Words on any visible line render in italic | Close reads as a distinct state without a legend |
| A cascade revealed every new circle at once; a first guess win had no story | One orchestrated sequence per guess: the word lands, each new circle draws in turn (1.1 s apart), words migrate, then the center fills; the end panel waits for the sequence | The turn is visible; a first guess win plays out circle by circle |
| Seam gap at three o'clock on every ring | Removed `pathLength`; the draw animation uses the real circumference and clears itself | Continuous rings |
| After a win, word halos smudged the ink center | Non-winning words fade and lose their halo when solved | Winner stands alone; path stays visible |
| Result said twice (status line and end title) | Status hides when finished; the end panel is the live region | One statement of the result |
| No summary of the path at the end | Trail of marks per guess, identical to the share text | "See how your thinking travelled", and a share preview |
| Share showed a first guess win as one mark and two blanks | Marks cover every circle visible after the guess | Cascades read as full rows |
| Five words on one short arc overlapped | Stronger overlap penalty in placement | Legible; crowded on-line words may drift slightly off their line |
| Judge hedges on the board ("people really say this") | Short authored labels, clarifier only where a sense needs it | Labels read as the puzzle, not the rubric |
| A mobile toolbar resize would cut a sequence short | Re-layout only on width change | Sequences survive scrolling |
| Reduced motion still delayed the end panel | Animation delays zeroed under reduced motion | Final state at once |
| Amber ring 2.3:1, input border 1.5:1, dots 2.4:1 against paper | Amber #b98310 (3.2:1), input and dot borders #8a8f96 / #858a92 (3.1 / 3.3:1), placeholder #6b7078 (4.8:1) | Non-text contrast at or above 3:1 |
| Review: position cannot encode every verdict (no point is on all three lines; crowding drifts words) | Placement reports whether a word's center is in its true region; if not, the word carries explicit marks | Position never silently misleads |
| Review: non-winning words faded to 35% fell below text contrast | Opaque quiet ink (6.0:1) on a paper pill | Legible on paper and over the center edge |
| axe-core: no page heading | Wordmark is the page's h1 | 0 violations |

## Rendered state review

Stored outside Git in `~/.cache/tmp/liminal-reimagine-qa/` with
`evidence-manifest.json`. Every state below was opened and looked at. States
with an uncertain or unreachable judge used the production judge (uncertain)
or a deliberately unreachable one (outage).

| State | Width | Verdict |
| --- | --- | --- |
| First visit How to play | 390 | Pass |
| Idle, stage 1, ghosts | 390, 1280 | Pass |
| Placing (judge pending, delayed 4 s) | 390 | Pass |
| Advance to stage 2, word slides out | 390 | Pass |
| Echo refused, no guess used | 390 | Pass |
| Uncertain refused, no guess used | 390 | Pass (seen on exam, the salt, promise, napkin) |
| Judge unreachable | 390 | Pass |
| Stage 3, lure on the line in italic | 390 | Pass |
| Word detail with Disagree | 390 | Pass |
| Report note sent (prototype says it does not send) | 390 | Pass |
| Win after a turn | 390, 1280 | Pass after the quiet-ink pill fix |
| Triple on-the-line verdict (synthetic, no judge) | 390 | Pass: word flagged inexact, marks shown |
| First guess win sequence (polled at 250 ms steps) | 390 | Pass: rings at 0, 1.1, 2.2 s; fill at 3.0 s |
| Loss, five guesses, ways in | 390 | Pass after the overlap fix |
| Two-line label, 360 px | 360 | Pass |
| Reduced motion | 390 | Pass after the delay fix |
| Keyboard focus on a placed word | 390 | Pass |

axe-core 4.10.2, run on every interactive state: how-to, idle (390, 360 and
1280 px), placing, echo, sample-only refusal (the uncertain refusal uses the
same element and styling; it needs a live judge and was not audited itself),
outage, advance mid-sequence, stage 3,
word detail, report form, keyboard focus, first-guess win mid-sequence, win
(390 and 1280 px), reduced-motion win, loss, synthetic inexact marks, Venn mid-game and
Quiet win. Two fixes came out of it: the page had no heading (the wordmark is
now the h1), and the placing pulse dipped below 4.5:1 (it now pulses ink with
an opacity floor of 0.7). 0 violations after both.

## Known limitations

- Crowded on-the-line words can drift off their line; they now show marks,
  but production placement should give each on-the-line word a slot along
  its arc so drift is rare.
- Not covered: real iOS and Android keyboards, a full screen reader pass (labels
  and live regions are wired, not audited), dark mode (not designed), the brand
  mark (the keyhole retires; a new mark is an open item).

## What a next round would test

Only with new evidence: a five-player hallway test of Narrowing against Quiet
on the same two puzzles, measuring guesses to solve and whether players can say
what "on the line" meant without the how-to.
