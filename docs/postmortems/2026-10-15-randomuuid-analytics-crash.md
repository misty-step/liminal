# LIMINAL-1: optional analytics prevented puzzle play

Date: 2026-10-15. Repair owner: Kanban `t_c5dbfb4f`.
Sentry: `misty-step/liminal`, `LIMINAL-1` (7751902824).

## Impact

Four production error events were recorded on 2026-09-24 between 03:09Z and
23:31Z, on release `89b1b758`. These are event counts, not a count of affected
players. Browsers without `crypto.randomUUID` could not play: the session-start
mount effect threw, the root error boundary replaced the puzzle with “The board
stopped.”, and retrying repeated the same failing effect. Older Safari and
embedded WebViews are examples of the affected capability class; the evidence
does not establish the exact devices or total affected population.

No later event was observed during the commissioning triage. That silence did
not demonstrate recovery: both unguarded calls remained on master at `b305855e`.
No safe earlier release was established as supporting this capability, so
rolling back arbitrarily would not have been a verified recovery.

## Timeline and detection gap

- 2026-09-24: the four production errors reached the root error boundary and
  were captured by Sentry.
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

The monitoring gap was not missing exception capture. It was failure to turn a
captured, low-volume browser crash into an owned product repair and a
capability-specific regression. A generic HTTP/health check cannot detect this
client mount failure. This card owns verification through release; issue silence
alone is never the closure criterion.

## Root cause

Two page-local analytics operations (event ID creation and anonymous session ID
creation) assumed a newer Web Crypto convenience API was universally present.
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

At implementation handoff, independent review, exact-head hosted CI, merge and
production deployment remain release gates; no deployment or Sentry resolution
is claimed by this document. The release owner must retain the deployed source
SHA and Worker version, verify the served static bundle and health with read-only
requests, watch LIMINAL-1 for new production events, then resolve it and record
that verified transition on `t_c5dbfb4f` and incident `t_0c37060e`. Never exercise
the missing-API scenario against production or create production usage fixtures.
No D1 migration or credential change belongs to this repair.
