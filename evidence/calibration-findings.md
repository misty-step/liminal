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

## 2026-09-20 run 4 — canonical-answer hardening (card t_d6df5a4f)

Trigger: independent QA (run 1053) found that the most canonical player
guesses for Pass or Fail — "exam" and "physical" — returned
`unavailable:uncertain`. Honest (no guess consumed), but the most likely
day-one answers were not accepted. Also observed as uncertain: bath-vessel
"bidet", made-and-taken "suggestion", bath-vessel "hot tub".

### Diagnosis (raw probes, prompt liminal-judge-2026-09-20.3)

| answer | c1 conf | c2 conf | c3 conf | reading |
| --- | --- | --- | --- | --- |
| exam | 1.00 | 0.94 | 0.30 | c3 splits partly 0.53 / yes 0.45 — the exam-paper artifact sense |
| physical | 0.27 | 0.15 | 0.49 | bare word read as an adjective; c3 leans no on that reading |
| test | 0.34 | 0.14 | 0.74 | bare polysemous noun; the model averages across senses |
| checkup | 0.64 | 0.31 | 1.00 | c2 hedges on "fail a checkup" |
| final exam | 1.00 | 0.96 | 0.64 | accepted |

Semantic reason: the conditions assert that an idiom EXISTS ("you can pass
it"), but the c1/c2 questions ("can people 'pass' it?") invited the model to
average over every sense of a bare polysemous word. Averaging splits the
probability mass and drops confidence below the 0.5 floor even when the
idiom exists. The question form did not match the condition's semantics.

### Rubric change, with the semantic reason

- c1 judge: "can people 'pass' it in the sense of clearing it or succeeding
  at it?" → "is there a common sense in which people can 'pass' it — where
  to pass it is to clear it or succeed at it?" Existential
  sense-selection asks exactly what the condition asserts.
- c2 judge: same form — "is there a common sense in which people can 'fail'
  it — or in which it itself fails?"
- c3 was NOT changed. A candidate rewording was probed and REJECTED on
  evidence: anchoring to "in its main noun sense" (plus a referent-level
  partly) thinned required-label margins — test c3 0.74 → 0.37, interview
  c3 → 0.52, launch c3 → 0.57 — and lifted neither exam nor physical above
  the floor (exam moved to a no-lean on c3). Forcing the model to commit to
  a "main" sense makes it hedgier, not less. The candidate was reverted.

Result at the new rubrics: checkup fixed (0.79 / 0.86 / 0.99), all fixtures
solid, all near misses still discriminated (launch c1 outside at conf 0.60,
takeover 0.75, rescue 0.83), bar exam / entrance exam / hearing test now
accepted with margin.

### Deck change, with the semantic reason

- answers += "checkup" (live-verified all-inside: 0.79 / 0.86 / 0.99).
  "Pass a checkup" and "fail a checkup" are attested idiomatic uses; the
  occasion clearly satisfies c3. Authored so the canonical family has an
  outage-safe deterministic win.
- heldOut += "entrance exam" (1.00 / 0.99 / 0.95) and "hearing test"
  (0.93 / 0.80 / 1.00): fresh live-verified held-outs. "bar exam" also
  verified accepted (1.00 / 0.99 / 0.98) and deliberately left out-of-deck
  as ongoing live coverage.
- exam / physical / test are NOT authored. Reason: the live matrix judges
  every authored answer and expects all-inside; these three refuse below
  the confidence floor under two independently authored rubric generations
  (the run-3 documented limit: bare polysemous words split across senses).
  Authoring them would either fail the matrix gate or require weakening the
  calibration protocol. Both are dishonest. They remain honest refusals —
  no guess consumed, report path available — and their multi-word family
  members judge confidently.

### Observed, deliberately unchanged (honest uncertainty)

- bath-vessel "bidet": c1 conf 0.41 (yes 0.60 / partly 0.39) — regional
  fixture variation is a genuine world-knowledge borderline.
- made-and-taken "suggestion": c1 conf 0.41 — the model hedges on "make a
  suggestion" though the usage is idiomatic.
- bath-vessel "hot tub": judged, not refused — c1 confidently
  not-in-a-bathroom; an honest live near-miss shape.
- Parallel pattern noted, not touched: made-and-taken c3's partly level
  ("It has both abstract and physical senses") describes the lexeme while
  its yes/no describe the referent — the same incoherence rejected for
  pass-or-fail c3. No label exercises it, so it stays.

### Guess-budget policy for invented/instruction-like input (decided)

Invented objects and injection strings are rejected semantically, not
deterministically. Fresh probes at the new version: bath-vessel "zorblax"
0.99 / 0.99 / 0.68 all-no; kitchen-well "flumbewick" 0.92 / 0.70 / 0.79
all-no; pass-or-fail "zorblax" 0.91 / 0.90 / 0.79 all-no — no fake win, no
instruction execution. A confidently judged guess consumes one of the five,
exactly like a real-but-wrong answer; deterministic rejections
(echo/empty/too-long), honest uncertainty, outage, rate limit, and the
calibration gate consume nothing. A deterministic nonsense detector was
rejected: any lexical rule would falsely refuse real answers (stockpot,
washbasin, bathroom sink were all live-verified valid), and
instruction-keyword matching misfires on legitimate answers ("take
instructions" is idiomatic). The injection string itself now refuses as
uncertain on one cell (c2 conf 0.41) — no states returned at all. The
policy is pinned in AGENTS.md, README.md, and a storage test.

### Gate evidence

- bun run test: 61/61 (6 files); tsc --noEmit clean; bun run build clean.
- Live matrix: 53/53 rows match, 0 failures —
  evidence/live-matrix-2026-09-20T19-36-35-398Z.json (24 answers, 17 near
  misses, 12 held-out; deck 2026-09-20.4; prompt
  liminal-judge-2026-09-20.4; model typesafe/jev-1.13).
- Versions: DECK 2026-09-20.4; pass-or-fail judgments 2026-09-20.4
  (conditions, answers, and held-out changed; the other three puzzles keep
  their 2026-09-20.3 authored sets); JUDGE_PROMPT_VERSION
  liminal-judge-2026-09-20.4. Runtime caches key on the prompt version, so
  no existing judgment can silently reroll.
