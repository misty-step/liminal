# Dispute a verdict

A player who thinks a word was placed wrongly opens it, chooses "Disagree?",
writes a note, and sends it. The report is stored durably and confirmed with
"Noted. Thanks." If it cannot be stored, the player is told it was not sent.

## Sub-features

- `open-dispute`: word detail offers `Disagree?`.
- `send-report`: the note posts to `/api/report`, is stored in D1 `reports`, and confirms with "Noted. Thanks."
- `report-failure`: a failed store shows "Couldn’t send that. Try again later." and never falls back to local storage in production.

## How to get to it (user POV)

- Tap a word on the board, choose `Disagree?`, type in the note field, and send.

## Driving it with verify-liminal

Preconditions:

- Instance `offline` is running and its doctor passes. This writes a row, so it never runs on production.

- **Offered (any target).** `verify-liminal journey <target>` asserts the `Disagree?` button exists in word detail, without sending.
- **Send.** `verify-liminal qa` opens the first word, chooses `Disagree?`, fills `#report-note`, and submits `form.report`. `.report-status` reads "Noted. Thanks." Evidence: `qa-journeys/desktop-report.png`.
- **Stored.** `bunx wrangler d1 execute LIMINAL_DB --env production --local --persist-to ~/.cache/tmp/verify-liminal/offline/d1 --command "select count(*) from reports"` returns at least 1. Run this before cleanup, which deletes the D1.

## Gotchas

- Never send a report on production. It is an append-only row that the operator reads as real player feedback.
- The failure path ("Couldn’t send that") is covered by `src/lib/liminal/__tests__/report-durability.test.ts`, not by a browser drive. Routing `/api/report` to a 503 in the browser would show it if needed.
- `qa` needs instance `offline`, because its outage journey expects the judge to be unreachable.
