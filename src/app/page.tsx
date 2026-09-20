"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { DECK, getPuzzle } from "@/lib/liminal/deck";
import { dailyPuzzle, dateKeyUTC } from "@/lib/liminal/daily";
import { evaluateGuess, guessesRemaining, judgedFeedback } from "@/lib/liminal/evaluator";
import {
  canGuess,
  emptyProgress,
  loadProgress,
  recordGuess,
  saveProgress,
} from "@/lib/liminal/storage";
import { GUESS_LIMIT } from "@/lib/liminal/types";
import type {
  ConditionState,
  GuessFeedback,
  Puzzle,
  PuzzleProgress,
} from "@/lib/liminal/types";

type Mode = "today" | "practice";

const STATE_LABEL: Record<ConditionState, string> = {
  inside: "Inside",
  close: "Close",
  outside: "Outside",
};

export default function Page() {
  const [mode, setMode] = useState<Mode>("today");
  const [practiceId, setPracticeId] = useState<string>(DECK[0].id);
  const [progressById, setProgressById] = useState<Record<string, PuzzleProgress>>({});
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const today = dailyPuzzle(dateKeyUTC(), DECK);
  const puzzle: Puzzle = mode === "today" ? today : getPuzzle(practiceId) ?? DECK[0];
  const progress = progressById[puzzle.id] ?? emptyProgress(puzzle.id);
  const remaining = guessesRemaining(progress.guesses.length);
  const finished = progress.solved || progress.guesses.length >= GUESS_LIMIT;
  const lastGuess = progress.guesses[progress.guesses.length - 1];

  useEffect(() => {
    const next: Record<string, PuzzleProgress> = {};
    for (const entry of DECK) {
      next[entry.id] = loadProgress(entry.id) ?? emptyProgress(entry.id);
    }
    setProgressById(next);
  }, []);

  const persist = useCallback((updated: PuzzleProgress) => {
    saveProgress(updated);
    setProgressById((prev) => ({ ...prev, [updated.puzzleId]: updated }));
  }, []);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (pending || finished || !text.trim()) return;
      const local = evaluateGuess(puzzle, text);
      if (local.rejected) {
        setNotice({
          message:
            local.rejected === "echo"
              ? "That only repeats the clue — name a real object instead."
              : "Give a real noun or a short noun phrase.",
          error: true,
        });
        return;
      }
      setPending(true);
      try {
        let feedback: GuessFeedback = local;
        if (local.needsJudgment) {
          const response = await fetch("/api/judge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ puzzleId: puzzle.id, answer: text }),
          });
          const data = (await response.json().catch(() => null)) as
            | { status?: string; states?: Record<string, ConditionState>; judgmentVersion?: string }
            | null;
          if (!response.ok || !data || data.status !== "judged" || !data.states) {
            setNotice({
              message:
                "The judge is unavailable right now. Your guess was not used — try again in a moment.",
              error: true,
            });
            return;
          }
          feedback = judgedFeedback(
            puzzle,
            data.states,
            "judged",
            String(data.judgmentVersion ?? "unknown"),
          );
        }
        const updated = recordGuess(progress, feedback, text.trim());
        persist(updated);
        setText("");
        if (feedback.solved) {
          setNotice({ message: "Inside every condition. The drawer opens." });
        } else if (updated.guesses.length >= GUESS_LIMIT) {
          setNotice({
            message: "Five guesses spent. The drawer stays closed — see the reveal below.",
          });
        } else {
          setNotice(null);
        }
      } finally {
        setPending(false);
      }
    },
    [pending, finished, text, puzzle, progress, persist],
  );

  const submitReport = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setReportStatus("sending");
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ puzzleId: puzzle.id, answer: text || lastGuess?.answer || "", note: reportNote }),
      }).catch(() => null);
      const data = (await response?.json().catch(() => null)) as { ok?: boolean } | null;
      if (response?.ok && data?.ok) {
        setReportStatus("Thanks — the report is filed.");
        setReportNote("");
      } else {
        setReportStatus("The report could not be filed right now. Nothing was lost; try again later.");
      }
    },
    [puzzle.id, text, lastGuess?.answer, reportNote],
  );

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1 className="wordmark">
            Lim<em>i</em>nal
          </h1>
          <p className="tagline">A daily intersection puzzle. One drawer a day, five guesses, no tricks.</p>
        </div>
        <div className="tabs" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === "today"} onClick={() => setMode("today")}>
            Today
          </button>
          <button
            type="button"
            aria-pressed={mode === "practice"}
            onClick={() => setMode("practice")}
          >
            Practice
          </button>
        </div>
      </header>

      <main id="game">
        {mode === "practice" && (
          <section className="panel" aria-label="The cabinet">
            <p className="drawer-label">The cabinet</p>
            <p className="teaser">Open any drawer. Progress is kept per puzzle.</p>
            <div className="cabinet-grid">
              {DECK.map((entry) => {
                const entryProgress = progressById[entry.id];
                const solved = entryProgress?.solved ?? false;
                const used = entryProgress?.guesses.length ?? 0;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      setPracticeId(entry.id);
                      setNotice(null);
                    }}
                    aria-pressed={entry.id === puzzle.id}
                  >
                    <strong>{entry.title}</strong>
                    <div className="meta">
                      {entry.mode === "literal" ? "Literal object" : "Wordplay"} ·{" "}
                      {solved ? (
                        <span className="done">Solved</span>
                      ) : used > 0 ? (
                        `${used}/${GUESS_LIMIT} guesses used`
                      ) : (
                        "Untouched"
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="drawer-card" aria-label="Current puzzle" style={{ marginTop: mode === "practice" ? "1rem" : 0 }}>
          <p className="drawer-label">{puzzle.drawer}</p>
          <h2 className="title">
            {puzzle.title}{" "}
            <span className={`chip ${puzzle.mode === "wordplay" ? "wordplay" : ""}`}>
              {puzzle.mode === "literal" ? "Literal object" : "Wordplay"}
            </span>
          </h2>
          <p className="teaser">{puzzle.teaser}</p>

          <ul className="conditions">
            {puzzle.conditions.map((condition) => {
              const state = lastGuess?.states[condition.id];
              return (
                <li key={condition.id}>
                  <span className={`state ${state ?? "outside"}`} aria-hidden="true" />
                  <span className="state-label">{state ? STATE_LABEL[state] : "Unjudged"}</span>
                  <span className="condition-text">{condition.text}</span>
                </li>
              );
            })}
          </ul>

          <form className="guess-form" onSubmit={submit}>
            <label className="visually-hidden" htmlFor="guess">
              Your answer — a real noun or short noun phrase
            </label>
            <input
              id="guess"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="a real noun or short noun phrase"
              autoComplete="off"
              spellCheck={false}
              disabled={finished}
              maxLength={120}
            />
            <button type="submit" disabled={pending || finished || !canGuess(progress)}>
              {pending ? "Judging…" : "Guess"}
            </button>
          </form>

          <div className="pips" aria-label={`${remaining} of ${GUESS_LIMIT} guesses remaining`}>
            {Array.from({ length: GUESS_LIMIT }, (_, index) => (
              <span
                key={index}
                className={`pip ${index < progress.guesses.length ? "used" : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>

          <p aria-live="polite" className="visually-hidden">
            {notice?.message ?? ""}
          </p>
          {notice && <div className={`notice ${notice.error ? "error" : ""}`}>{notice.message}</div>}

          {progress.guesses.length > 0 && (
            <ol className="history">
              {progress.guesses.map((guess, index) => (
                <li key={`${guess.answer}-${index}`}>
                  <span className="word">{guess.answer}</span>
                  <span className="marks">
                    {puzzle.conditions.map((condition) => (
                      <span
                        key={condition.id}
                        className={`state ${guess.states[condition.id] ?? "outside"}`}
                        title={`${condition.text}: ${STATE_LABEL[guess.states[condition.id] ?? "outside"]}`}
                        aria-label={`${condition.text}: ${STATE_LABEL[guess.states[condition.id] ?? "outside"]}`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {finished && (
            <div className="reveal">
              {progress.solved ? (
                <>
                  <h3>Drawer open — {progress.solvedAnswer}</h3>
                  <p>
                    You found an answer that lives inside every condition. The drawer keeps the
                    concepts you collected.
                  </p>
                </>
              ) : (
                <>
                  <h3>The drawer stays closed</h3>
                  <p>Accepted answers for this drawer included:</p>
                </>
              )}
              <ul>
                {progress.solved
                  ? progress.collected.map((concept) => <li key={concept}>{concept}</li>)
                  : puzzle.judgments.answers.map((answer) => <li key={answer}>{answer}</li>)}
              </ul>
            </div>
          )}
        </section>
      </main>

      <footer className="colophon">
        <span>
          Answers are judged against the drawer&apos;s conditions. Outside, Close, Inside — no decimal
          dashboards.
        </span>
        <button type="button" className="link" onClick={() => setReportOpen(true)}>
          Report an answer
        </button>
      </footer>

      {reportOpen && (
        <div
          className="report-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Report an answer"
        >
          <form className="report" onSubmit={submitReport}>
            <h3>Report an answer</h3>
            <p className="teaser">
              A valid answer that was rejected, a near miss that felt wrong, or a clue that reads
              badly. Include the answer if it is not in the box.
            </p>
            <label htmlFor="report-answer">Answer</label>
            <input
              id="report-answer"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="the answer you tried"
              maxLength={120}
            />
            <label htmlFor="report-note">What happened?</label>
            <textarea
              id="report-note"
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              rows={3}
              maxLength={500}
            />
            {reportStatus && <p className="teaser">{reportStatus}</p>}
            <div className="row">
              <button type="button" onClick={() => setReportOpen(false)}>
                Close
              </button>
              <button type="submit" className="primary">
                Send report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
