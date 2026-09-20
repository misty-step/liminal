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
