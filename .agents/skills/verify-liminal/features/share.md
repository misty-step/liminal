# Share a result

A player who finishes today's board chooses Share. On a desktop that copies
four lines: `Liminal #N`, one square per guess, `N guesses, m:ss` (with 🎯 on a
perfect four), and a `/s/<code>` link. The text never contains a word or a
circle label. A friend who opens the link sees the squares and score with every
word hidden until they tap it.

## Sub-features

- `share-text`: four spoiler-free lines, copied to the clipboard on desktop and offered to the native share sheet on touch devices.
- `share-preview`: the end panel previews the share card ("Share preview").
- `share-page`: `/s/<code>` shows the result with words hidden; tapping a chip reveals that word and where it landed.
- `share-broken`: a malformed code shows "This share link is broken".

## How to get to it (user POV)

- Finish today's board, then choose `Share`.
- Open the shared link in another browser.

## Driving it with verify-liminal

Preconditions:

- Today's board was completed in the same context (the journey's first scenario).
- The context grants `clipboard-read` and `clipboard-write`.

- **Copy.** Choose the `Share` button and wait for `Copied`. Read `navigator.clipboard.readText()`. Line 0 is `Liminal #<today>`, line 1 is four squares, line 2 matches `^4 guesses, \d+:\d{2}( 🎯)?$`, and line 3 starts with `<origin>/s/`. No label or answer appears (case-insensitive). Evidence: `05-share-text.txt`.
- **Friend view.** In a new phone-sized context, open line 3's path on the same target. The page text contains none of the four answers, and `.reveal-chip.is-revealed` count is 0. Evidence: `09-share-page-hidden.png`.
- **Reveal.** Click the first `.reveal-chip`. Exactly one chip is revealed, and it names the first word placed. Evidence: `10-share-page-revealed.png`.
- **Broken.** Open `/s/not-a-real-code`. The heading reads "This share link is broken". Evidence: `11-share-broken.png`.

## Gotchas

- The share link uses the page's own origin, so a local run produces `http://127.0.0.1:<port>/s/...`. Open it on the same target.
- The `/s/<code>` code base64-encodes the player's words by design. `journey.json` records share paths as `/s/*`. Do not paste real players' codes into evidence.
- On touch devices with `navigator.share`, Share opens the OS sheet instead of copying. Headless Chromium has no sheet, so drive Share in a desktop context.
- A tap on a chip before the share page hydrates is silently dropped ([#36](https://github.com/misty-step/liminal/issues/36)). The journey taps again until the chip reveals and reports `taps=N; N-1 dropped before hydration`. While #36 is open, a nonzero count is that known bug. Once it is fixed, a nonzero count is a regression.
- Share appears only for today's puzzle. An archive board has no Share button.
