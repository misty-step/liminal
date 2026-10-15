# LIMINAL-1: optional analytics prevented puzzle play

Date: 2026-10-15. Repair owner: Kanban `t_c5dbfb4f`.
Sentry: `misty-step/liminal`, `LIMINAL-1` (7751902824).

## Impact

Four production error events were recorded on 2026-09-24 between 03:09Z and
23:31Z, on release `89b1b758`. These are event counts, not a count of affected
players. All four events have the request URL `http://liminal.mistystep.io/`.
`crypto.randomUUID` requires a secure context: current browsers loading this
HTTP origin lack it, not just older browsers or embedded WebViews. Production
still returned HTTP 200 without an HTTPS redirect during review on 2026-10-15
at 14:42Z. Browsers without the API could not play: the session-start mount
effect threw, the root error boundary replaced the puzzle with “The board
stopped.”, and retrying repeated the same failing effect. The evidence does not
establish the exact devices or total affected population. HTTPS enforcement is
separately owned by `t_393a8eae`; this repair must work without that redirect.

No later event was observed during the commissioning triage. That silence did
not demonstrate recovery: both unguarded calls remained on master at `b305855e`.
No safe earlier release was established as supporting this capability, so
rolling back arbitrarily would not have been a verified recovery.

## Timeline and detection gap

- 2026-09-24: the four production errors reached the root error boundary and
  were captured by Sentry from the HTTP origin.
- 2026-09-24, 15:57:05Z: off-lane Worker version `7e5debd6` became the active
  production version. It was created 51 seconds before PR #10's source commit
  `2ddd5ec` existed and three minutes before its merge. There was no later deploy
  or secret change before this investigation. Its release label `d3c03d6` does
  not identify the served source, and its browser build omitted the public
  Sentry DSN and release. The 23:31Z event came from the earlier browser bundle.
- 2026-10-15: residual production-incident triage confirmed the defect still
  existed, identified its user impact, and assigned this repair card. The
  unresolved issue had spent roughly three weeks without a specific repair
  owner. A broad product umbrella and a quiet issue were not repair ownership
  or proof of a fix.
- 2026-10-15: a credential-free local build on the authorized build host
  reproduced the exact error screen with `randomUUID` removed before hydration.
  The candidate passed the same browser scenario and four-guess completion on
  desktop and mobile viewports, plus denied storage, denied entropy, synchronous
  fetch failure and rejected-network scenarios.
- 2026-10-15: independent review also reproduced the baseline crash on a native
  insecure origin in Chromium and Firefox, without removing any API. Both
  browsers completed the candidate in four guesses with valid event IDs and no
  page errors. Review established the missing browser capture described below.

The detection gap had two parts: captured errors lacked a specific repair owner
for roughly three weeks, and the active deployment disabled browser exception
capture. Review found all ten served JavaScript chunks byte-identical to a
`build:cf` of master `b305855` without `NEXT_PUBLIC_SENTRY_DSN` or
`NEXT_PUBLIC_SENTRY_RELEASE`. The served initialization retained an un-inlined
`process.env.NEXT_PUBLIC_SENTRY_DSN` and set `enabled` from its absent value.
Silence from that bundle was guaranteed, not evidence of a rare browser group or
recovery. A generic HTTP/health check also cannot detect a client mount failure.
This release must supply the project's public DSN and exact source release at
build time and verify the served initialization. A build guard and corrected
README build instructions are separately owned by `t_c8476774`. The DSN value
does not belong in this public postmortem or its evidence.

## Root cause

Two page-local analytics operations (event ID creation and anonymous session ID
creation) assumed a secure-context-only Web Crypto convenience API was universally
present. HTTP was served without a redirect, so even current browsers lacked
that API. `crypto.getRandomValues`, unlike `randomUUID`, remains available in
insecure contexts; older implementations without `randomUUID` are also covered
by the same capability-based fallback. See the
[Web Crypto specification](https://w3c.github.io/webcrypto/#Crypto-interface) and
[MDN's randomUUID reference](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).
`fetch(...).catch(...)` caught only asynchronous transport rejection. It did not
contain errors raised earlier by ID creation, session storage, serialization,
or a synchronous fetch failure. Optional telemetry therefore became a hard
availability dependency in React mount effects and gameplay handlers.

## Class-closing change (pokayoke)

- One `randomId()` helper is authoritative for both IDs. It calls native
  `crypto.randomUUID` when available; otherwise it uses 16 bytes from
  `crypto.getRandomValues` and explicitly sets the UUID v4 version and variant
  bits. It never substitutes weak randomness.
- `productEvents.ts` is the single browser analytics boundary. Its emission
  function returns `void`, catches the entire synchronous operation and handles
  promise rejection. Failure drops optional telemetry, not the puzzle. Session
  retention and the existing event taxonomy remain unchanged.
- The page only calls that contained boundary. No global polyfill, new
  dependency, schema, game mechanic or production-data change is needed.

## Verification and release custody

`bun run check` passed 184 tests across 25 files, including 15 new ID/analytics
regressions, and formatting, lint, foundation and type checks. The one existing
CSS specificity warning is unrelated. `bun run build:cf` passed on pinned Bun
1.4.2 with the frozen lockfile. The local browser regression is
`e2e/uuid-compatibility.ts`; it refuses a non-loopback target and captures
analytics without persisting it. Its six scenarios assert “Filled in 4 guesses”
and no browser errors. The fallback paths also validate the exact event names,
server-accepted UUID envelopes, a retained session and progress after reload.
The pre-fix screenshot and candidate desktop/mobile screenshots are retained
with the repair card, not production analytics.

Independent review approved the production code and required the factual
corrections above plus a non-vacuous rejected-network regression: a plain fetch
stub must expose an unhandled rejection when the production promise catch is
removed. Kaylee authorized self-verification of those corrections and release
without another review round. Exact-head hosted CI, merge and verified
deployment remain release gates; this document does not claim deployment or
Sentry resolution. The release owner must build clean merged master with
`NEXT_PUBLIC_SENTRY_DSN` supplied privately and `NEXT_PUBLIC_SENTRY_RELEASE` set
to the exact source SHA, verify the isolated candidate, and promote those same
bytes through the approved README deploy lane. Retain the source SHA and Worker
version; verify served static bytes, browser Sentry activation and health with
read-only requests. Only after verification and a regression watch may the owner
resolve LIMINAL-1 and record the transition on `t_c5dbfb4f` and incident
`t_0c37060e`. Never exercise the missing-API scenario against production or
create production usage fixtures. No D1 migration or credential change belongs
to this repair.
