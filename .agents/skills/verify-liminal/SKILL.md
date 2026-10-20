---
name: verify-liminal
description: Drive Liminal, the daily three-circle word puzzle at liminal.mistystep.io, the way a player does, from a shell, in Claude Code or Codex. Use it to prove a change, check production, or reproduce a player report. It covers today's puzzle, the live judge, sharing, the archive, the changelog, disputes, and the states that break.
---

# verify-liminal

Liminal is a web game with no accounts: one shared puzzle per UTC day, three
labeled circles, four regions to fill. Players touch the browser UI; the
`/api/*` routes exist to serve it. This skill drives the real UI with
Playwright from a shell (no T3 preview tools needed) against either
production or a local production-mode Worker on disposable D1.

Everything runs through one helper. Run it from the repository root, or put it on `PATH`:

```sh
V=.agents/skills/verify-liminal/scripts/verify-liminal
$V help
```

There is no sign-in. Liminal has no accounts, sessions or owner-only pages
(AGENTS.md: "Solo only"; README: "No accounts and no multiplayer (by
design)"). The real player is anonymous. The doctor's identity checks are on
the deployment instead: the served revision, the environment, and the puzzle
for today's date.

## Targets and what is safe where

| Target | URL | Allowed |
| --- | --- | --- |
| `prod` | `https://liminal.mistystep.io` | Read-only: `doctor` and `journey`. The journey aborts every same-origin request that is not GET/HEAD and fails if one is attempted. It also aborts every other origin, so PostHog and Sentry receive no synthetic play. |
| `offline` | local Worker, no judge key | Everything, including `qa`, which files a real dispute into the disposable D1 and requires the judge to be unreachable. |
| `judge` | local Worker with the live judge | `journey --live-judge`: real Jev judgments for novel words. This costs a few cents of judge credit. |

Never run `--live-judge`, a dispute, or a novel word against production. They
write D1 rows (cached judgments, reports) and spend the production judge key.
The helper refuses `--live-judge` on any non-loopback URL.

## Launch

```sh
$V build                 # bun install, OpenNext build, wrangler dry-run bundle -> .open-next/bundle
$V launch                # instance "offline": prints its URL once /api/health is ok
pass-env run -e OPENROUTER_API_KEY=workstation/OPENROUTER_MISTY_STEP_LIMINAL_SHARED_JUDGMENT_API_KEY \
  -- $V launch --judge   # instance "judge": same Worker, with the live judge
$V base offline          # print a running instance's URL
```

`build` takes about two minutes and must be rerun after any source change;
`launch` warns when the bundle is older than `HEAD`. The build uses no Sentry
or PostHog keys, so the production build guard stays off and nothing leaves the
machine. `launch` applies every migration to a fresh D1 under
`~/.cache/tmp/verify-liminal/<instance>/d1`, starts
`wrangler dev --env production --local` on a free loopback port in its own
process group, and returns once `/api/health` reports `status: ok` with
`deck: ok` and `storage: ok`. Ready means that health check passed and the
board can load. A cold Worker on a busy machine can take a minute to answer
its first request, so launch waits up to 300 s (`VERIFY_LIMINAL_READY_SECONDS`).
If the Worker never becomes healthy, launch prints the log tail and stops the
Worker it started. Two instances (`offline` and `judge`) can run side by side. A
second launch of the same instance refuses until you clean it up. Set
`VERIFY_LIMINAL_STATE` to give a parallel run its own state root.

## Doctor

Run it first, and again after any surprising failure:

```sh
$V doctor prod           # or: offline | judge | <URL>
```

Read-only. It checks:

- `/api/health` is `ok`, the environment is `production`, and deck and storage are `ok`;
- the served `revision` equals `origin/master` for prod, or the bundle's `SOURCE_SHA` for a local instance;
- `/api/today` is today's UTC date and number (#1 = 2026-09-23), with three labels and a `calibrated` judge status;
- tomorrow's number answers 404;
- for prod, plain HTTP answers 308 to HTTPS;
- for a local instance, our port is listening.

Any `FAIL` line means the target is not worth driving. A revision mismatch on
prod right after a merge usually means the deploy has not finished; see the
`Deploy app` workflow.

## Drive

```sh
$V journey prod                     # read-only player journey on production
$V journey offline                  # same journey on the local Worker
$V journey judge --live-judge       # plus a real novel-word and hostile-input judgment
$V qa                               # repo write journeys on "offline": e2e/qa-journeys.ts + e2e/local-storage.ts
```

`journey` (`scripts/journey.ts`) reads today's authored answers from
`/api/today`. Authored answers are judged in the browser, so a full board
needs no judge and makes no write. It drives, in order:

1. the API contract;
2. first visit with the how-to;
3. free refusals for a circle label and a repeated word;
4. all four regions filled;
5. the end panel and the share text read from the clipboard;
6. reload persistence;
7. word detail;
8. the archive and the way back;
9. the changelog;
10. the share page as a friend on a phone, plus a malformed link;
11. schedule outage with retry, slow schedule, judge outage, judge rate limit, denied storage, and a full game at phone width;
12. with `--live-judge`, a novel word and an instruction-like input.

Each feature file in [features/](features/README.md) names its selectors and
expected text.

Exit code `0` means every check passed. Each check prints `PASS` or `FAIL` with
the observed value.

## Evidence

Artifacts go to `$OUT`, default `evidence/verify-liminal/<UTC date>/<prod|local-offline|local-judge>/`:

- numbered screenshots (`01-first-visit-howto.png` … `19-live-judge-hostile.png`);
- an ARIA snapshot of the finished board;
- `05-share-text.txt`;
- `journey.json`, with every check, the revision, the puzzle ID, and a same-origin request census (method, path, sent or blocked) plus the external origins it blocked;
- for `qa`, `qa-journeys/` and `local-storage/`.

Save the doctor's output yourself: `$V doctor prod | tee "$OUT/doctor.txt"`.

Proof standards:

- drive the visible UI (input `#guess`, the Place button, the Share button), never internal setters;
- capture the action and the resulting state;
- check the side effect where it lives. Prod's side effect is none, and `journey.json` proves it with its request census. The local dispute's side effect is the D1 row: `bunx wrangler d1 execute LIMINAL_DB --env production --local --persist-to ~/.cache/tmp/verify-liminal/offline/d1 --command "select count(*) from reports"`.

Simulated breaking states are routed inside the browser and never reach the
server. The local Worker is a stand-in for Cloudflare, so the real Jev
judgment only proves the code and key path. Production's own secret binding
is proven only by real player traffic.

Commit evidence only when a PR asks for it. Never commit `judge.env`, worker
logs, or anything containing a key.

## Cleanup

```sh
$V cleanup               # stop both instances; delete their D1 state and judge.env
$V cleanup judge         # just one
```

It stops only the process group `launch` recorded, never anything by name.
Evidence under `evidence/verify-liminal/` (or `$OUT`) is never touched. After
cleanup, confirm the evidence still exists with `ls "$OUT"`.

## Feature map

[features/README.md](features/README.md) is the maintained source of what to
verify. Keep it current with `/maintain-verification-skill`.
