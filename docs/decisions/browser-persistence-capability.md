# Browser persistence is a capability, not a play prerequisite

## Context

Review of the `crypto.randomUUID` repair exposed a separate failure: denying
`window.localStorage` before hydration made the page show “The board stopped.”
even when native `crypto.randomUUID` was available. The page accessed the
visitor marker and how-to preference directly, and progress loads, clock saves,
guess saves, and how-to dismissal could also throw. Catching only the visitor
marker would leave playable-board failure paths.

This is not LIMINAL-1. That incident concerned anonymous analytics IDs on
origins without `crypto.randomUUID`; its repair contains session storage and
analytics failures. Persistent-storage denial does not require that API to be
missing. This decision records a locally reproduced capability defect, not a
new production incident or evidence to reopen LIMINAL-1.

## Decision

`src/lib/liminal/localStorage.ts` contains property access and each storage
operation. Both obtaining the storage object and calling its methods may fail;
writes may fail independently, including quota exhaustion. Do not cache an
unavailable capability forever: later operations can succeed if access recovers.

- Keep the existing preference/progress keys and values: `liminal.howto.v2`,
  `liminal.sound.v1`, and `liminal.v2.puzzle.<id>`. No schema change or migration.
- A missing or unreadable saved game loads no progress. The existing page state
  remains authoritative for the current tab; best-effort saves must not block
  accepted guesses or clock updates. No synthetic persistent backup is added.
- An unreadable how-to preference shows instructions; dismissing or reopening
  them must still work. Sound remains opt-in, and an unavailable preference
  does not prevent the tab from honoring a new sound choice.
- The old visitor/session collector is superseded by the official analytics
  SDK (see README). Its historical marker may remain untouched in storage;
  the app no longer reads it or fabricates first-visit events. Analytics
  remains optional when browser persistence is unavailable.
- If storage remains unavailable, this tab can complete the puzzle, but reload
  cannot be promised to restore its progress. When storage works, reload keeps
  the same guesses and elapsed time.

The product consumers are page preferences, progress storage, and audio.
All use the shared boundary. `design/reimagine/` is an independent design
prototype, not a shipped Next.js route; its separate prototype keys are outside
this product repair.

## Verification

The new progress regressions failed against the pre-repair implementation for
all three denial classes: property getter (`SecurityError`), read
(`SecurityError`), and write (`QuotaExceededError`). The tests also exercise
recovery and normal key/schema round-tripping. Preference tests distinguish
absence from denial and verify that denied storage does not break in-tab audio
choices.

Run `bun run check` and `bun run build:cf` using the pinned Bun 1.4.2 and
`bun install --frozen-lockfile`. Against an isolated local build, run:

```sh
BASE=http://127.0.0.1:43185 OUT=content/local-storage bun run e2e/local-storage.ts
```

The browser regression keeps native `crypto.randomUUID` present, denies the
localStorage getter/read/write separately, closes and reopens how-to, and
completes four authored guesses with the exact heading “Filled in 4 guesses”.
It checks page errors and unhandled rejections and verifies that normal
persistence and preferences survive reload. It refuses non-loopback targets,
blocks external browser traffic, and aborts analytics delivery rather than
writing events or faking successful delivery. Screenshots and machine-readable
results are local verification evidence, never production screenshots.
