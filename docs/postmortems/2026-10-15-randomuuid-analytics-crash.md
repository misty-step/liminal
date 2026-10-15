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

## Corrective actions

- Prevent a repeat of the disabled browser capture and false release identity:
  [require browser Sentry identity in production builds](../decisions/production-sentry-build-guard.md)
  (`t_c8476774`).

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
without another review round. The corrected test killed the missing-catch mutant
with exit 1 and an unhandled `Offline` rejection; restoring the approved code
passed all 184 tests. No runtime change was needed after independent approval.

## Recovery

PR #18 passed exact-head CI run `38775839430` at
`aed7384e6059d06e80528b1065c1a919586cedb0` and merged as
`f9a2621419744379cdec226d885b141f07e964b4`. Merged-master CI run `38775990309`
also passed. A clean checkout of that merged source was built once with the
project's public browser DSN and exact release supplied at build time. The
actual local Cloudflare Worker passed all six missing-API/fault scenarios;
Chromium and Firefox also completed the native insecure-origin scenario.
External telemetry and event persistence were blocked during browser proof.

The same tested artifact (1,408 files, verified by a SHA-256 manifest) was
promoted through the approved README lane on 2026-10-15. At 17:20:40Z, after the
release-metadata update, production served Worker version
`d7279abb-f875-452f-9a21-788402f5af8d` at 100%. Fresh GETs at 17:21:55Z matched
all 15 HTML-referenced static/build assets byte-for-byte, and health reported
the deck and storage healthy. Health has no release field: served bytes, build
ID, active Worker version and browser Sentry options establish identity.

A normal production mount showed a playable board with no page errors. The
served browser client reported capture enabled, a DSN present, production
environment, exact release `f9a2621419744379cdec226d885b141f07e964b4`, and
`sendDefaultPii: false`. All browser POSTs and external telemetry were blocked:
there was no missing-API production test, gameplay fixture or analytics write.
No production D1 migration, data or credential change was needed.

The repair card retains the screenshots, commands, source/artifact hashes,
hosted CI results and the subsequent bounded Sentry watch and issue-state
readback. Three GET-only samples from 17:22:31Z through 17:27:36Z found health
healthy, no issues attributed to the new release, and LIMINAL-1 unchanged at four
events with last occurrence 2026-09-24T23:31:28Z. Only then was LIMINAL-1 resolved;
an independent exact-issue GET at 17:27:49Z verified `status: resolved`, the same
event count and unchanged last occurrence. The transition is recorded on
`t_c5dbfb4f` and incident `t_0c37060e`. This bounded watch is not a guarantee
against future regressions. The separate HTTPS, production-build guard and
localStorage-denial repairs remain owned by `t_393a8eae`, `t_c8476774` and
`t_0575050d`, respectively.
