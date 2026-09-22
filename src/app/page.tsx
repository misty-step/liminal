"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { dailyPuzzle, dateKeyUTC } from "@/lib/liminal/daily";
import { DECK, getPuzzle } from "@/lib/liminal/deck";
import { evaluateGuess, guessesRemaining, judgedFeedback } from "@/lib/liminal/evaluator";
import {
  canGuess,
  emptyProgress,
  loadProgress,
  recordGuess,
  saveProgress,
} from "@/lib/liminal/storage";
import { GUESS_LIMIT } from "@/lib/liminal/types";
import type { ConditionState, GuessFeedback, Puzzle, PuzzleProgress } from "@/lib/liminal/types";
import type { ProductEventName } from "@/lib/liminal/runtime";

type Mode = "today" | "practice";
type EventProps = Record<string, string | number | boolean>;

const STATE_LABEL: Record<ConditionState, string> = {
  inside: "Inside",
  close: "Close",
  outside: "Outside",
};
const ATTEMPT_POSITIONS = [0, 1, 2, 3, 4] as const;
const REPORT_SUCCESS = "Report filed. Thank you for the note.";

function displayCopy(value: string): string {
  return value.replace(/\s*(?:\u2014|\u2013)\s*/g, ": ");
}

function drawerNumber(value: string): string {
  return value.split(/\s*(?:\u2014|\u2013)\s*/u, 1)[0] ?? value;
}

function sessionId(): string {
  const key = "liminal.event-session.v1";
  const retained = window.sessionStorage.getItem(key);
  if (retained) return retained;
  const created = `session_${crypto.randomUUID().replaceAll("-", "")}`;
  window.sessionStorage.setItem(key, created);
  return created;
}

function emitProductEvent(eventName: ProductEventName, props: EventProps): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    eventId: crypto.randomUUID(),
    eventName,
    sessionId: sessionId(),
    props,
  });
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function refusalReason(reason: string | undefined): string {
  if (reason === "rate-limited") return "ratelimit";
  if (reason === "uncalibrated") return "calibration";
  if (reason === "uncertain") return "uncertainty";
  return "outage";
}

function judgedResult(feedback: GuessFeedback): ConditionState {
  if (feedback.solved) return "inside";
  return Object.values(feedback.states).includes("close") ? "close" : "outside";
}

export default function Page() {
  const [mode, setMode] = useState<Mode>("today");
  const [practiceId, setPracticeId] = useState<string>(DECK[0].id);
  const [progressById, setProgressById] = useState<Record<string, PuzzleProgress>>({});
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportAnswer, setReportAnswer] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [reportPending, setReportPending] = useState(false);
  const reportAnswerRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLElement>(null);
  const reportTriggerRef = useRef<HTMLButtonElement>(null);
  const openedRef = useRef<string | null>(null);

  const today = dailyPuzzle(dateKeyUTC(), DECK);
  const puzzle: Puzzle = mode === "today" ? today : (getPuzzle(practiceId) ?? DECK[0]);
  const progress = progressById[puzzle.id] ?? emptyProgress(puzzle.id);
  const remaining = guessesRemaining(progress.guesses.length);
  const finished = progress.solved || progress.guesses.length >= GUESS_LIMIT;
  const lastGuess = progress.guesses[progress.guesses.length - 1];
  const reportFiled = reportStatus === REPORT_SUCCESS;

  useEffect(() => {
    const next: Record<string, PuzzleProgress> = {};
    for (const entry of DECK) {
      next[entry.id] = loadProgress(entry.id) ?? emptyProgress(entry.id);
    }
    setProgressById(next);

    const visitorKey = "liminal.visited.v1";
    const newVisitor = window.localStorage.getItem(visitorKey) === null;
    window.localStorage.setItem(visitorKey, "1");
    emitProductEvent("session_start", { mode: "today", new_visitor: newVisitor });
  }, []);

  useEffect(() => {
    const key = `${mode}:${puzzle.id}`;
    if (openedRef.current === key) return;
    openedRef.current = key;
    emitProductEvent("puzzle_open", { puzzle_id: puzzle.id, mode });
  }, [mode, puzzle.id]);

  useEffect(() => {
    if (!reportOpen) return;
    reportAnswerRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReportOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        reportRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      reportTriggerRef.current?.focus();
    };
  }, [reportOpen]);

  const persist = useCallback((updated: PuzzleProgress) => {
    saveProgress(updated);
    setProgressById((prev) => ({ ...prev, [updated.puzzleId]: updated }));
  }, []);

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    setNotice(null);
    setText("");
  };

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (pending || finished || !text.trim()) return;
      const local = evaluateGuess(puzzle, text);
      if (local.rejected) {
        setNotice({
          message:
            local.rejected === "echo"
              ? "That repeats the clue. Name an object instead."
              : "Name a real noun or short noun phrase.",
          error: true,
        });
        emitProductEvent("guess_refused", { puzzle_id: puzzle.id, reason: "rejection" });
        return;
      }

      setPending(true);
      setNotice(null);
      try {
        let feedback: GuessFeedback = local;
        if (local.needsJudgment) {
          const response = await fetch("/api/judge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ puzzleId: puzzle.id, answer: text }),
          });
          const data = (await response.json().catch(() => null)) as {
            status?: string;
            reason?: string;
            states?: Record<string, ConditionState>;
            judgmentVersion?: string;
          } | null;
          if (!response.ok || !data || data.status !== "judged" || !data.states) {
            setNotice({ message: "Judging is unavailable. Your guess remains.", error: true });
            emitProductEvent("guess_refused", {
              puzzle_id: puzzle.id,
              reason: refusalReason(data?.reason),
            });
            return;
          }
          feedback = judgedFeedback(
            data.states,
            "judged",
            String(data.judgmentVersion ?? "unknown"),
          );
        }

        const updated = recordGuess(progress, feedback, text.trim());
        persist(updated);
        setText("");
        emitProductEvent("guess_judged", {
          puzzle_id: puzzle.id,
          result: judgedResult(feedback),
          source: feedback.source === "authored" ? "authored" : "live",
        });

        if (feedback.solved) {
          setNotice({ message: "Inside every condition. The drawer opens." });
          emitProductEvent("puzzle_complete", {
            puzzle_id: puzzle.id,
            solved: true,
            guesses_used: updated.guesses.length,
          });
        } else if (updated.guesses.length >= GUESS_LIMIT) {
          setNotice({ message: "Five guesses used. The drawer stays shut." });
          emitProductEvent("puzzle_complete", {
            puzzle_id: puzzle.id,
            solved: false,
            guesses_used: updated.guesses.length,
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

  const openReport = () => {
    setReportAnswer(text.trim() || lastGuess?.answer || "");
    setReportStatus(null);
    setReportOpen(true);
  };

  const submitReport = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!reportAnswer.trim() || reportPending || reportFiled) return;
      setReportPending(true);
      setReportStatus(null);
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          puzzleId: puzzle.id,
          answer: reportAnswer,
          note: reportNote,
        }),
      }).catch(() => null);
      const data = (await response?.json().catch(() => null)) as { ok?: boolean } | null;
      if (response?.ok && data?.ok) {
        setReportStatus(REPORT_SUCCESS);
        setReportNote("");
        emitProductEvent("report_submitted", { puzzle_id: puzzle.id });
      } else {
        setReportStatus("The note could not be filed. Please try again later.");
      }
      setReportPending(false);
    },
    [puzzle.id, reportAnswer, reportNote, reportPending, reportFiled],
  );

  return (
    <div className="shell">
      <header className="masthead" aria-hidden={reportOpen || undefined}>
        <div className="brand-lockup">
          {/* biome-ignore lint/performance/noImgElement: the static local SVG is the authored brand mark. */}
          <img
            className="brand-mark"
            src="/brand/liminal-mark-32.svg"
            alt=""
            width="44"
            height="44"
          />
          <div>
            <h1 className="wordmark">Liminal</h1>
            <p className="tagline">Find what belongs. Five guesses.</p>
          </div>
        </div>
        <fieldset className="tabs">
          <legend className="visually-hidden">Puzzle mode</legend>
          <button type="button" aria-pressed={mode === "today"} onClick={() => chooseMode("today")}>
            Today
          </button>
          <button
            type="button"
            aria-pressed={mode === "practice"}
            onClick={() => chooseMode("practice")}
          >
            Practice
          </button>
        </fieldset>
      </header>

      <main id="game" aria-hidden={reportOpen || undefined}>
        {mode === "practice" && (
          <section className="panel cabinet" aria-labelledby="cabinet-title">
            <div className="section-heading">
              <div>
                <p className="drawer-label">The cabinet</p>
                <h2 id="cabinet-title">Choose a drawer</h2>
              </div>
              <p className="section-note">Your progress stays with each drawer.</p>
            </div>
            <div className="cabinet-grid">
              {DECK.map((entry, index) => {
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
                      setText("");
                    }}
                    aria-pressed={entry.id === puzzle.id}
                  >
                    <span className="cabinet-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="cabinet-copy">
                      <strong>{entry.title}</strong>
                      <span className="meta">
                        {entry.mode === "literal" ? "Literal object" : "Wordplay"}
                        <span aria-hidden="true"> · </span>
                        {solved ? (
                          <span className="done">Solved</span>
                        ) : used > 0 ? (
                          `${used} of ${GUESS_LIMIT} used`
                        ) : (
                          "Untouched"
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section
          className={`drawer-card ${finished ? "finished" : ""}`}
          aria-label="Current puzzle"
          aria-busy={pending}
        >
          <span className="drawer-rail" aria-hidden="true" />
          <header className="puzzle-heading">
            <p className="drawer-label">{drawerNumber(puzzle.drawer)}</p>
            <span className={`chip ${puzzle.mode === "wordplay" ? "wordplay" : ""}`}>
              {puzzle.mode === "literal" ? "Literal object" : "Wordplay"}
            </span>
            <h2 className="title">{puzzle.title}</h2>
            <p className="teaser">{displayCopy(puzzle.teaser)}</p>
          </header>

          <div className="state-legend">
            <span className="legend-label">Fit per clue</span>
            {(["outside", "close", "inside"] as const).map((state) => (
              <span key={state}>
                <span className={`state keyhole-state ${state}`} aria-hidden="true" />
                {STATE_LABEL[state]}
              </span>
            ))}
          </div>

          <ol className="conditions">
            {puzzle.conditions.map((condition, index) => {
              const state = lastGuess?.states[condition.id];
              return (
                <li key={condition.id}>
                  <div className="condition-copy">
                    <span className="condition-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="condition-text">{displayCopy(condition.text)}</span>
                  </div>
                  <span className={`condition-status ${state ?? "unjudged"}`}>
                    <span
                      className={`state keyhole-state ${state ?? "unjudged"}`}
                      aria-hidden="true"
                    />
                    {state ? STATE_LABEL[state] : "Waiting"}
                  </span>
                </li>
              );
            })}
          </ol>

          <form className="guess-form" onSubmit={submit}>
            <label htmlFor="guess">
              Your guess
              <span>A real noun or short noun phrase</span>
            </label>
            <div className="guess-controls">
              <input
                id="guess"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={finished ? "This drawer is settled" : "Type your answer"}
                autoComplete="off"
                spellCheck={false}
                disabled={finished || pending}
                maxLength={120}
              />
              <button
                type="submit"
                disabled={pending || finished || !canGuess(progress) || !text.trim()}
              >
                {finished ? "Drawer settled" : pending ? "Considering…" : "Try the drawer"}
              </button>
            </div>
          </form>

          {pending && (
            <div className="loading-state" role="status">
              <span className="turning-key" aria-hidden="true" />
              The drawer is considering it.
            </div>
          )}

          <div className="attempts">
            <span className="attempt-count">
              <strong>{remaining}</strong> {remaining === 1 ? "guess left" : "guesses left"}
            </span>
            <span
              className="pips"
              role="img"
              aria-label={`${remaining} of ${GUESS_LIMIT} guesses remaining`}
            >
              {ATTEMPT_POSITIONS.map((position) => (
                <span
                  key={`attempt-${position + 1}`}
                  className={`pip ${position < progress.guesses.length ? "used" : ""}`}
                  aria-hidden="true"
                />
              ))}
            </span>
          </div>

          <p aria-live="polite" className="visually-hidden">
            {notice?.message ?? ""}
          </p>
          {notice && (
            <div className={`notice ${notice.error ? "error" : ""}`}>{notice.message}</div>
          )}

          {progress.guesses.length > 0 && (
            <section className="guess-history" aria-labelledby="history-title">
              <h3 id="history-title">In the drawer</h3>
              <ol className="history">
                {progress.guesses.map((guess, index) => (
                  <li key={`${guess.at}-${guess.answer}`}>
                    <span className="guess-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="word">{guess.answer}</span>
                    <span className="marks">
                      {puzzle.conditions.map((condition) => {
                        const state = guess.states[condition.id] ?? "outside";
                        return (
                          <span
                            key={condition.id}
                            className={`state keyhole-state ${state}`}
                            role="img"
                            title={`${displayCopy(condition.text)}: ${STATE_LABEL[state]}`}
                            aria-label={`${displayCopy(condition.text)}: ${STATE_LABEL[state]}`}
                          />
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {finished && (
            <div className="reveal">
              {progress.solved ? (
                <>
                  <p className="reveal-kicker">Found inside</p>
                  <h3>Drawer open: {progress.solvedAnswer}</h3>
                  <p>The drawer keeps what you found.</p>
                </>
              ) : (
                <>
                  <p className="reveal-kicker">Five guesses</p>
                  <h3>The drawer stays closed</h3>
                  <p>Other things that belonged here:</p>
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

      <footer className="colophon" aria-hidden={reportOpen || undefined}>
        <p>Each drawer may hold more than one right answer.</p>
        <button ref={reportTriggerRef} type="button" className="link" onClick={openReport}>
          Report a judging issue
        </button>
      </footer>

      {reportOpen && (
        <div className="report-overlay">
          <button
            type="button"
            className="report-scrim"
            tabIndex={-1}
            aria-label="Close report"
            onClick={() => setReportOpen(false)}
          />
          <section
            ref={reportRef}
            className="report"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
          >
            <div className="report-heading">
              <div>
                <p className="drawer-label">A note for the cabinet</p>
                <h3 id="report-title">Report a judging issue</h3>
              </div>
              <button type="button" className="close-button" onClick={() => setReportOpen(false)}>
                <span aria-hidden="true">×</span>
                <span className="visually-hidden">Close report</span>
              </button>
            </div>
            <p className="teaser">Tell us which answer felt misplaced and why.</p>
            <form onSubmit={submitReport}>
              <label htmlFor="report-answer">Answer (required)</label>
              <input
                ref={reportAnswerRef}
                id="report-answer"
                value={reportAnswer}
                onChange={(event) => setReportAnswer(event.target.value)}
                placeholder="the answer you tried"
                maxLength={120}
                required
                disabled={reportPending || reportFiled}
              />
              <label htmlFor="report-note">What felt wrong?</label>
              <textarea
                id="report-note"
                value={reportNote}
                onChange={(event) => setReportNote(event.target.value)}
                rows={4}
                maxLength={500}
                disabled={reportPending || reportFiled}
              />
              {reportStatus && (
                <p className="report-status" role="status">
                  {reportStatus}
                </p>
              )}
              <div className="row">
                <button type="button" className="secondary" onClick={() => setReportOpen(false)}>
                  {reportFiled ? "Done" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={reportFiled || reportPending || !reportAnswer.trim()}
                >
                  {reportFiled
                    ? "Filed"
                    : reportPending
                      ? "Filing…"
                      : reportAnswer.trim()
                        ? "File the note"
                        : "Answer required"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
