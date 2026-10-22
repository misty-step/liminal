# Guess reducer experiment

Open [index.html](index.html) directly in a browser. It needs no server or network.
Step forward to see the input, the reason, and the resulting saved progress;
step backward or scrub to compare states. **Finish** replays the whole recorded
daily game. The expanded state view shows exact timestamps and feedback.

This is the one-day trial from [explore-queue #45](https://github.com/misty-step/explore-queue/issues/45).
It tests whether executable transitions and a real replay explain the guess loop
better than prose alone. It does not establish that people understand this format
better; that requires reader feedback.

## Boundary

`recordGuess` delegates to the pure `reduceGuess(state, event)` in
[src/lib/liminal/guessReducer.ts](../../src/lib/liminal/guessReducer.ts).
The wrapper still supplies `Date.now()` by default. The reducer receives that time
in the event and neither reads a clock nor performs effects. Existing saved data,
refusal rules, score rules, and completion rules are unchanged.

The state is `PuzzleProgress`. The event is evaluated `feedback-received`, with an
answer and timestamp. `guessTransition` names the branch used by both the reducer
and the diagram. The surrounding React page still owns raw input, pending state,
network calls, clock folding, sounds, focus, and storage. This intentionally models
the progress transition, not the entire React lifecycle.

## Real recording and replay

[recording.ts](recording.ts) contains a small captured sequence, not a scripted
fictional transcript. The recorder uses a production-mode Worker, submits
through the actual form, reads accepted judgments from saved progress, and checks
every replayed guess against the browser's saved guesses. Refusal feedback comes
from the same evaluator and is checked against unchanged saved guesses. This recording used read-only production: same-origin writes and all external
requests were blocked. It records the selected daily puzzle and served revision. No live-judge call is needed.

Clock folds are deliberately excluded: thinking time depends on browser scheduling
and is a separate transition. The captured event timestamps are real; `elapsedMs`
stays at the replay's initial value. The snapshot records no credentials or user data.

To repeat, use the repository's [verification skill](../../.agents/skills/verify-liminal/SKILL.md)
to build and launch a disposable offline Worker, then run on the QA VM:

```sh
BASE="$($PWD/.agents/skills/verify-liminal/scripts/verify-liminal base offline)" \
  OUT="$HOME/.cache/tmp/liminal-reducer" bun scripts/reducer/record.ts
cp "$HOME/.cache/tmp/liminal-reducer/recording.ts" docs/reducer/recording.ts
bun scripts/reducer/build.ts
```

`build.ts` bundles the actual reducer, the recording, and `replay.ts` into
`template.html`, producing the required standalone `index.html`. That HTML is the
intentional checked-in deliverable; other generated evidence stays outside Git.
Run `bun run test -- src/lib/liminal/__tests__/guessReducer.test.ts` for the reducer
and recording checks. Run `bun scripts/reducer/verify.ts` on the QA VM to check the
standalone page at desktop and phone widths.

## Edge cases surfaced

- A second, different answer in the same region spends a guess without advancing
  the board. The first word remains that region's fill. The recording demonstrates
  this beside a repeat of the exact same word, which spends nothing.
- A line judgment is a spent guess even though it fills nothing. Unit tests cover
  this along with single-circle and outside judgments; the authored-only recording
  does not claim to exercise these live-judge branches.
- Feedback after completion changes nothing, including timestamps. Tests cover
  this defensive boundary even though the UI prevents normal post-completion input.

These are existing semantics made explicit, not gameplay fixes. No confirmed new
production defect was found. The experiment provides an executable explanation and
exposes less obvious cases; the “better than prose” part remains unmeasured.
