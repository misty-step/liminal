# Liminal design and copy contract

## Direction: The Cabinet, Sharper

Liminal is a brass-on-ink curiosity cabinet. Preserve the quiet, tactile drawer metaphor; sharpen it with clearer hierarchy, stronger label plates, and one original keyhole symbol. Do not turn the game into a generic dashboard or add mechanics for decoration.

## Brand mark

The symbol is one silhouette: a round keyway above a broad tapered wedge. It is not a letterform or wordmark.

- `public/brand/liminal-mark-16.svg`: 16 px first, simplified and deliberately thick.
- `public/brand/liminal-mark-32.svg`: small interface and favicon variant.
- `public/brand/liminal-mark.svg`: editable 256 px master with restrained brass depth.
- `src/app/icon.svg`: App Router icon wired from the small geometry.
- Clear space: at least one quarter of the mark width.
- Never outline the small keyhole, add interior detail at 16 px, or place it on a bright field.

## Color and type

- Ink: `#101419`; raised ink: `#1a1e23`.
- Paper: `#f3ead7`; quiet paper: `#cfc3aa`.
- Brass: `#d8b45f`; dark brass: `#8f6d2f`.
- Danger: `#e7a27d`.
- Display: Iowan Old Style, then Palatino or Georgia fallbacks.
- Interface: system sans. Functional text never uses the display face.
- Body text is at least 16 px. Small labels are at least 12 px and must retain readable contrast.

## Feedback alphabet

All three states use the same keyhole silhouette and always include a text label.

- Outside: dim outline.
- Close: half-lit brass.
- Inside: fully lit brass.
- Before a guess: no status word repeated beside every clue; use a quiet `Waiting` label.

Color is never the only signal. History marks carry accessible labels. Conditions remain plain authored copy and are never replaced with model scores.

## Layout and motion

The puzzle is a cabinet drawer, not a floating card. Use an inset face, top rail, label plate, and restrained depth. Desktop may place clue copy and status side by side. Below 620 px, status moves beneath the clue so the clue keeps the full reading width. The answer field and action become one full-width stack on narrow screens.

Motion is limited to state entry, button response, and the drawer reveal. Keep transitions between 140 and 220 ms. Under `prefers-reduced-motion`, disable animation and transition duration.

## Copy

Voice is concise, observant, and slightly secretive. Let the drawer withhold.

- Lead: `Find what belongs.`
- Action: `Try the drawer`.
- Success: `Inside every condition. The drawer opens.`
- Outage: `Judging is unavailable. Your guess remains.`
- Report link: `Report a judging issue`.
- Avoid engineering vocabulary, confidence values, internal service names, reassurance promises, and em or en dashes in interface copy.
- Automated surface-copy checks cover `src/app/page.tsx`, `src/app/layout.tsx`, and this document. They intentionally exclude `src/lib/liminal/deck.ts`: authored puzzle, calibration, and evaluator language keeps semantically meaningful punctuation, while every deck string rendered on the player surface passes through `displayCopy` to replace em and en dashes. Never rewrite authored puzzle meaning to satisfy a punctuation detector.
- Keep Today and Practice explicit. Never rename the five-guess budget or conceal saved progress.

## Maintenance checks

Every UI change must preserve Today and Practice, five scored guesses, unspent refusals, saved per-puzzle progress, reports, historical judgments, and first-writer-wins storage. Review desktop and 390 px mobile idle, loading, refusal, near miss, win, loss, practice cabinet, report, and error states. Inspect the 16 px, 32 px, and large mark at actual size.
