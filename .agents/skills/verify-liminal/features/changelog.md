# Changelog

From the game, a player can open "Changelog" to read the release notes built
into the version they are using, then return with "Play today".

## Sub-features

- `open-changelog`: the `Changelog` link under the board opens `/changelog`.
- `serving-version`: the page shows `This build · <version>`, matching `/api/health` `version`.
- `canonical-notes`: one release heading per `## ` heading in `CHANGELOG.md` at the deployed revision.
- `return`: `Play today` returns to the game.
- `themes-and-widths`: readable at 1280 and 390 px, in light and dark, with no horizontal scroll.

## How to get to it (user POV)

- Choose `Changelog` at the bottom of the game, then `Play today`.

## Driving it with verify-liminal

Preconditions:

- The doctor passes.

- **Open.** `verify-liminal journey <target>` clicks link `Changelog`, waits for heading `Changelog`, and checks the text `This build · <health.version>`. Evidence: `08-changelog.png`.
- **Return.** Click link `Play today`. The game returns.
- **Every width and theme (local).** `verify-liminal qa` repeats this at 1280 and 390 px in light and dark. It counts release headings against the checkout's `CHANGELOG.md` and checks for no horizontal scroll and the right color scheme. Evidence: `qa-journeys/changelog-*.png`.

## Gotchas

- The release-heading count compares with the checkout's `CHANGELOG.md`. Against production, run it only when the checkout is at the deployed revision (the doctor's revision line).
- The notes are rendered at build time. A stale local bundle shows the old notes; rebuild.
