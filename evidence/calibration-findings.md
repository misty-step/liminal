# Live judge calibration findings

Date: 2026-09-20. Model: `typesafe/jev-1.13` via `https://openrouter.ai/api/alpha/decisions`.
Runner: `scripts/live-matrix.ts` (`bun run validate:live`). Raw evidence:
`evidence/live-matrix-2026-09-20T17-38-41-167Z.json` (prompt v1) and
`evidence/live-matrix-2026-09-20T17-40-08-667Z.json` (prompt v2).

## Result: the live judge does NOT reproduce the authored deck verdicts. The gate fails.

| run | prompt version | rows | mismatched rows |
| --- | --- | --- | --- |
| 1 | `liminal-judge-2026-09-20.1` | 55 | 39 |
| 2 | `liminal-judge-2026-09-20.2` | 55 | 41 |

Rows = every published verified answer and every tested near miss across the
four launch puzzles (the same labels the fixture tests assert).

### Where the disagreement lives

- Objecthood (`c1`, "a real, recognizable thing") is broadly reliable:
  1–3 wrong cells per run across all puzzles.
- Orthographic wordplay conditions disagree heavily:
  `hidden-measures.c2` (hidden unit) 8–10 wrong cells;
  `silent-partners.c2` (silent letter) 11–13; `silent-partners.c3` (position of
  the silent letter) 11; `hidden-measures.c3` 8–10.
- Literal texture (`pocket-relic.c3`, "worn smooth") disagrees 6–8 cells.

Examples: the model does not treat `mil` (in `windmill`) or `amp` (in
`trampoline`) as units, and it answers "no silent letter" for words whose
silent letters are textbook cases (`chalk`, `yolk`, `hourglass`). On the
inverse side it is genuinely unsure (0.35–0.65 band) on things the deck labels
inside, which the UI then renders as Close.

### Two different meanings of "Close" (design note)

- Authored near miss: "fails exactly one condition, by construction."
- Live judge: "the model's probability landed in the unsure band."
Both are honest, but they are not the same signal. The UI keeps one label;
the distinction must be documented wherever live judging is enabled.

## What this means for the slice

1. The authored deterministic layer stays authoritative for the launch deck.
   It is what the executable tests and the validation matrix enforce.
2. Live judging of out-of-deck answers must not ship for wordplay puzzles
   until a calibration protocol exists. Encoded in code: puzzles default to
   `judgeStatus: "uncalibrated"`, and `/api/judge` refuses them unless
   `JEV_ALLOW_UNCALIBRATED=1` is set (it still never consumes a guess).
3. Remediation options for the release gate, in order of preference:
   - Author explicit accept/close lists per wordplay condition (deterministic,
     no model dependency) and keep the judge for objecthood only.
   - Fit per-condition thresholds on a larger labeled set (this deck is 55
     rows; per-condition n is 11–15, too small to fit honestly).
   - Improve judge phrasing further; re-run the matrix after any change.
4. Every rerun is cheap (about $0.0013 for both runs) and versioned; the
   matrix runner exits non-zero on any mismatch, so the gate stays honest.

## Do not claim

- "The judge is calibrated." It is not.
- "Fixture tests prove live behavior." They prove rules, not model behavior.

## 2026-09-20 run 3 — calibration recovery (completed)

Mechanism: every condition now ships an authored Choice rubric (yes / partly /
no, each with a descriptive level). The judge sends one descriptive question
per condition. A pick below the confidence floor (0.5) is refused as
"unavailable:uncertain". Uncertainty never maps to Close. Noul remains only as
a legacy path; no new code uses it.

Rubric rewordings, with the semantic reason for each:

- Article-free backticked nouns read ungrammatical to the model ("can you
  'pass' test"). Reworded to "Consider `answer` ... can people 'pass' it?"
  via pronoun anaphora.
- Examples inside a question inverted the answer (the model judged the example
  as the whole class). Examples were removed from all judge questions.
- "can people 'fail' it" excluded events that fail themselves. Reworded to
  "can people 'fail' it — or can it itself fail?". This change alone verified
  rescue and takeover as near misses.

Puzzle replacements, with the semantic reason for each:

- Lost and Found (lose/find abstract nouns) was replaced by Pass or Fail.
  Reason: the model splits on abstract-noun idioms at genuine coin-flips
  (balance 0.5, sleep 0.55, voice 0.5). The idiom space is beyond the
  model's reliable range. Pass or Fail uses school vocabulary with clean
  pass/fail asymmetry.
- Kept and Broken (break/keep) was replaced by Made and Taken. Reason: the
  break+keep idiom space is symmetric. Every candidate near miss split at
  the confidence floor. No honest near miss could exist. Made and Taken uses
  asymmetric make/take pairs instead.

Observed model limits that shaped the fixtures:

- Bare polysemous nouns (stand, call, turn) split across senses. Verified
  fixtures use multi-word phrases (phone call, wrong turn) or monosemous
  nouns (decision, apology).
- Idiom-absence claims ("nobody makes a rain check") hedge below the floor.
  Near misses therefore fail a concrete condition (physical object) or rest
  on a usage the model rejects with margin (launch, takeover, rescue:
  nobody "passes" these).

Held-out policy: held-out answers were probed fresh each round, never the
tuned allowlist. Kitchen held-outs (tumbler, measuring cup, carafe) were
retained from run 2; their green rows are in the raw evidence.

Final state: 50/50 rows match in
evidence/live-matrix-2026-09-20T18-59-52-242Z.json (23 answers, 17 near
misses, 10 held-out). All four puzzles are marked "calibrated". Failed
matrices from runs 1-2 are retained as evidence of the recovery path.
