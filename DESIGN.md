---
version: 2026-09-23
name: Liminal, the in-between
colors:
  paper: "#fafaf8"
  ink: "#1e2126"
  quiet: "#5c6169"
  line: "#d8dadd"
  target: "rgba(30, 33, 38, 0.05)"
  c1: "#2a8fa3"
  c1Text: "#1a6c7c"
  c2: "#d0487f"
  c2Text: "#a53461"
  c3: "#b98310"
  c3Text: "#85590a"
  regionNotC3: "#7f5fae"
  regionNotC2: "#4f9a4a"
  regionNotC1: "#d9733a"
  fieldBorder: "#8a8f96"
  placeholder: "#6b7078"
typography:
  wordmark:
    fontFamily: Newsreader
    fontSize: 26px
    fontWeight: 600
  boardWord:
    fontFamily: Newsreader
    fontSize: 17px
    fontWeight: 500
  circleLabel:
    fontFamily: Schibsted Grotesk
    fontSize: 14px
    fontWeight: 600
  body:
    fontFamily: Schibsted Grotesk
    fontSize: 16px
rounded:
  control: 12px
  dialog: 16px
  pill: 999px
components:
  primaryButton:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
  centerFill:
    backgroundColor: "{colors.ink}"
---

# Liminal design and copy contract

## Overview

A daily puzzle about the in-between. Three labeled circles overlap in four
places; the player fills all four with real things. No guess limit: the score
is guesses and thinking time. The board
is the whole game: every word lands where it belongs, and position is the
feedback. Rationale, rejected directions, and the probes behind this design
live in `design/reimagine/`.

## Game

- Targets: the center (inside all three) and three pair regions (inside two,
  outside the third). Pair regions are named by the circle they exclude.
- A judged guess fills a target when it lands there cleanly (no circle on the
  line) and the target is empty. Otherwise it stays on the board as information.
- Ends only when all four are filled. Score: guesses used and clock time.
- The clock counts thinking time: it pauses while the judge considers a word,
  while the how-to is open, and while the tab is hidden; it is saved with
  progress and freezes on completion.
- Refusals spend nothing: a circle label, a repeat, empty or oversized input,
  judge outages, rate limits, the calibration gate.

## Colors

| Name | Hex | Role | Contrast on paper |
| --- | --- | --- | --- |
| paper | #fafaf8 | Page | |
| ink | #1e2126 | Text, primary button, filled center | 15.5:1 |
| quiet | #5c6169 | Secondary text | 6.0:1 |
| target | ink at 5% | Unfilled target regions | decorative |
| c1 / c2 / c3 | #2a8fa3 / #d0487f / #b98310 | Circle rings | 3.6 / 4.1 / 3.2:1 |
| c1Text / c2Text / c3Text | #1a6c7c / #a53461 / #85590a | Circle labels | 5.8 / 6.2 / 5.9:1 |
| region colors | #7f5fae / #4f9a4a / #d9733a | Filled pair regions (28%), pill rings, share squares | decorative, never the only signal |

Color never carries a verdict alone: position, italic (on the line), explicit
marks, and each word's accessible name and detail panel all state it.

## Brand mark

The mark is the exact curved triangle shared by three equal circles. At 32 px
and above, show the three thin circle outlines (c1 teal, c2 pink, c3 ochre)
around the filled ink center. Their centers and radius follow the board's
geometry. At 16 px, use the enlarged center silhouette alone: the full rings
collapse into visual noise in a tab strip. The optical cut is not a shrunken
master. Keep clear space of at least one center-silhouette width around the
mark when paired with other artwork or text. Minimum use is 16 px; below
32 px use the size-specific asset, not the 256 px master.

On paper the center is ink. On an ink-dark background it is paper-filled;
favicon SVGs switch via `prefers-color-scheme`. Never recolor the center with
one of the three ring colors or a pair-region color. The inline header mark
is ink on the paper interface. No box, gradient, or keyhole.

Files: `public/brand/liminal-mark-16.svg` (optical 16 px),
`public/brand/liminal-mark-32.svg` (32 px),
`public/brand/liminal-mark.svg` (256 px master), `src/app/icon.svg`,
`src/app/apple-icon.png` (180 px), `src/app/Mark.tsx` (header),
`public/brand/liminal-share.svg` and `public/brand/liminal-share.png`
(1200 by 630 social card, raster used in metadata).

## Typography

Newsreader for the player's words, the field, the wordmark and end title;
Schibsted Grotesk for labels and interface. Both SIL OFL, self-hosted by
`next/font/google`; fallbacks Iowan Old Style / Georgia and system-ui. Board
placement measures words after `document.fonts.ready`. No all-caps labels, no
numbered markers, no eyebrows.

## Layout

Single column, max 460 px, 16 px side padding: header, board, status line,
field, a meter row (guess count and clock). Board aspect 100:104; circle radius 27 units, centers
(36.5, 39.5), (63.5, 39.5), (50, 62.9). Labels: c1 top left, c2 top right, c3
below. Minimum width 320 px; verified at 360, 390, 1280.

## Components

| Component | States |
| --- | --- |
| Board | unfilled targets faint; filled pair targets tint in their region color; filled center turns ink |
| Board word | entering (flies in from bottom center), placed, on the line (italic), on ink (paper text for a later center word), filling (paper pill with region ring; center pill is paper on ink), inexact (marks under it), hover, focus-visible (paper halo plus ink outline) |
| Field | idle "Name a thing", placing (disabled, "Placing"), refused (text kept and selected), hidden when finished |
| Status line | placing (ink, pulse with 0.7 opacity floor), landing sentence, refusal |
| Meter | guess count (quiet), clock in the serif with tabular figures (ink while running, quiet while paused); the clock is hidden from screen readers and stated in the end panel |
| Header | mark, wordmark, date on Today; "#N" and "Back to today" in the archive; mark and wordmark only while today loads |
| Loading today | unlabeled circles, no field or meter; on failure "Couldn’t load today’s puzzle. Try again" |
| End panel | "Filled in N guesses", "m:ss on the clock", guess squares, other ways in per region, share preview (the exact text a friend receives, link shortened), Share / Copied / Couldn’t copy, "Play #N" (the day before), next puzzle countdown on Today |
| Share page `/s/<code>` | result card (number, squares, score), "The words" with each guess hidden until tapped, Show all, Play today’s Liminal; broken link state |
| Word detail | verdict per circle, the region it fills, Disagree, note, Send, sent or failed |
| How to play | first visit and "?" |

## Motion

| Moment | Duration | Purpose |
| --- | --- | --- |
| Word lands | 650 ms, cubic-bezier(0.2, 0.7, 0.2, 1) | Shows where it belongs |
| Region fills | 600 ms after 450 ms | The fill follows the landing |
| End panel | 600 ms after 900 ms | Result after the board settles |

Reduced motion collapses every animation and delay.

## Copy

One verb: **Place**. Short, plain, second person only when needed.

| Moment | String |
| --- | --- |
| Fill a pair region | “{word}” fills a gap. {n} of 4. |
| Fill the center | “{word}” fills the center. {n} of 4. |
| Already filled | “{word}” fits a place you already filled. |
| On a line | “{word}” is on a line. Close, but it fills nothing. |
| One circle | “{word}” is inside only one circle. |
| Nowhere | “{word}” is outside every circle. |
| Label echo | That repeats a circle. Name a thing instead. |
| Repeat | “{word}” is already on the board. |
| Judge unavailable | Couldn’t reach the judge. Try again in a moment. No guess used. |
| Rate limited | Too many tries at once. Wait a moment. No guess used. |
| Share text | Liminal #{n} / squares / {n} guesses, m:ss / link |
| Hidden guess | Reveal guess |
| Revealed guess | Filled the purple gap · Also the purple gap (place already filled) · On a line · Inside one circle · Outside every circle |
| Broken share link | This share link is broken. There’s nothing to reveal here. |
| Today unavailable | Couldn’t load today’s puzzle. Try again |

No em or en dashes in player copy (enforced by `brand.test.ts`). Deck labels
are short authored text; judge rubrics are never shown.

Share squares and the share page name places by color, never by circle label,
so a shared result spoils nothing for someone who has not played.

## Accessibility

Focus order: help, words in guess order, field, button, end actions. Board
words are buttons named "{word}. {label}: {state}; …". Status line and end
panel are polite live regions. axe-core: 0 violations on how-to, idle, placing,
refusals, outage, mid game, word detail, report, partial end, practice,
desktop, 360 px wordplay, reduced motion (2026-09-23).

## Authoring

Every region needs at least two verified answers (three for the center) and a
held-out answer the live judge must place there. Conditions must be ones the
judge can answer no to with confidence. Probe each region with the live judge
before authoring; run `bun run validate:live` before release.

## Maintenance checks

Capture and look at: how-to, idle, placing, fill, already filled, on a line,
one circle, outside, echo, repeat, outage, word detail, report, complete end
with time and share preview, today unavailable, archive (#N, Back to today), share page (hidden,
revealed, broken), clock paused (judge, how-to, hidden tab), desktop, 360 px
wordplay, reduced motion, keyboard focus.
