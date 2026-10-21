# States that break

Liminal stays honest when things go wrong. An unreadable schedule shows a
retry and never a client-chosen puzzle. A judge outage or rate limit says so
and spends no guess. Slow loads show nothing playable until the puzzle
arrives. Denied browser storage still lets the tab play. A phone keeps the
board and composer in view, even with the keyboard open. The clock counts only
thinking time.

## Sub-features

- `schedule-outage`: `/api/today` failing shows "Couldn’t load today’s puzzle." with `Try again` and no `#guess`; the retry loads the board (US-005.3).
- `slow-network`: while `/api/today` is slow, `main#game[aria-busy="true"]` and no input; then today's board.
- `judge-outage`: a novel word during an outage shows "Couldn’t reach the judge. Try again in a moment. No guess used." and spends nothing (US-002.2).
- `judge-rate-limit`: a 429 shows "Too many tries at once. Wait a moment. No guess used."
- `storage-denied`: a throwing `localStorage` still plays without page errors.
- `phone`: at 390×844 with touch, there is no side scroll, the labels and composer are in view, and a whole board completes (US-009).
- `phone-keyboard`: with the visual viewport shortened to 520 px, the labels, input, Place, and status stay visible.
- `reduced-motion`: word transitions are at most 1 ms.
- `clock-pauses`: the clock holds while the judge works, while the how-to is open, and while the tab is hidden (US-003.2).
- `sound`: sound is opt-in, and the preference survives reload (US-010).

## How to get to it (user POV)

- These happen to players on bad networks, during provider outages, in private browsing, and on phones. The journey reproduces each one in the browser.

## Driving it with verify-liminal

Preconditions:

- The doctor passes. The simulated states use Playwright `page.route` inside the browser, so they are safe on production; they never reach the server.

- **Schedule outage.** Route `/api/today` to a 503 and load `/`. Button `Try again` appears with no `#guess`. Unroute and click it; today's labels appear. Evidence: `12-schedule-outage.png`.
- **Slow network.** Delay `/api/today` by 3 s. At 1 s, `main#game` has `aria-busy="true"` and no `#guess`; then today's labels appear. Evidence: `13-slow-network-loading.png`.
- **Judge outage and rate limit.** Fulfill `/api/judge` with 503 `{"status":"unavailable","reason":"upstream"}`, then 429 `reason: "rate-limited"`. Place a novel word. The status contains "No guess used", the count is 0, and no `.word` exists. Evidence: `14-judge-outage.png`, `14-judge-rate-limit.png`.
- **Real outage (local).** On instance `offline`, which has no key, `verify-liminal qa` places "sundial" against the real route. It gets the same honest refusal (`qa-journeys/desktop-judge-outage.png`).
- **Storage denied.** An init script makes `window.localStorage` throw. The how-to opens every visit; Play dismisses it. One authored answer fills a region with no `pageerror`. Evidence: `15-storage-denied.png`. `verify-liminal qa` runs `e2e/local-storage.ts` for the denied-getter, denied-read, and denied-write cases, plus the available case with reload.
- **Phone.** A 390×844 touch context checks no side scroll, labels and composer in view, and four fills ending in "Filled in 4 guesses". Evidence: `16-mobile-board.png`, `17-mobile-complete.png`.
- **Keyboard, reduced motion, clock, sound (local).** `verify-liminal qa` covers them: `qa-journeys/mobile-keyboard.png`, `mobile-reduced-motion.png`, and the PASS lines `clock holds while …` and `sound preference survives reload`.

## Gotchas

- Headless Chromium has no phone keyboard. The keyboard check shrinks `visualViewport` to 520 px; a real device remains a separate check.
- The clock checks allow 1 s of drift around a 2.5 s pause. Under heavy machine load they can flake. Rerun once before calling it a regression.
- With denied storage, the how-to cannot remember dismissal, and reload restores nothing. Both are by decision (`docs/decisions/browser-persistence-capability.md`), not bugs.
- "Signed out", "wrong identity", and "expired link" do not apply: Liminal has no accounts.
- The journey blocks all external origins. A real outage of PostHog or Sentry must never affect play, so a failing journey is never explained by telemetry.
