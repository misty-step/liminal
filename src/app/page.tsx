"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DECK } from "@/lib/liminal/deck";
import { evaluateGuess, judgedFeedback } from "@/lib/liminal/evaluator";
import { parsePuzzle } from "@/lib/liminal/puzzleSchema";
import {
  boardState,
  CONDITION_IDS,
  formatClock,
  landingOf,
  parseStates,
  TARGETS,
} from "@/lib/liminal/regions";
import type { ProductEventName } from "@/lib/liminal/runtime";
import type { DailyPayload } from "@/lib/liminal/schedule";
import { shareText } from "@/lib/liminal/share";
import { emptyProgress, loadProgress, recordGuess, saveProgress } from "@/lib/liminal/storage";
import type { GuessFeedback, Puzzle, PuzzleProgress, TargetKey } from "@/lib/liminal/types";
import { Board } from "./Board";
import { Mark } from "./Mark";
import { ShareButton } from "./ShareButton";

type EventProps = Record<string, string | number | boolean>;

const STATE_WORD = { inside: "Inside", close: "On the line", outside: "Outside" } as const;
const HOWTO_KEY = "liminal.howto.v2";

const REFUSAL: Record<NonNullable<GuessFeedback["rejected"]>, (word: string) => string> = {
  echo: () => "That repeats a circle. Name a thing instead.",
  repeat: (word) => `“${word}” is already on the board.`,
  "too-long": () => "Keep it to a short name.",
  empty: () => "Name a thing first.",
};

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

/** A target region by its circles; a pair region excludes the third by rule. */
function regionName(puzzle: Puzzle, key: TargetKey): string {
  const label = (id: string) => puzzle.conditions.find((c) => c.id === id)?.text ?? id;
  if (key === "center") return "All three";
  const [a, b] = CONDITION_IDS.filter((id) => id !== key);
  return `${label(a)} + ${label(b)}`;
}

function dateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today's or a past puzzle from the schedule API; null when unreachable or malformed. */
async function fetchPayload(path: string): Promise<DailyPayload | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return null;
    const date = Reflect.get(data, "date");
    const number = Reflect.get(data, "number");
    if (typeof date !== "string" || typeof number !== "number") return null;
    return { date, number, puzzle: parsePuzzle(Reflect.get(data, "puzzle"), path) };
  } catch {
    return null;
  }
}

/**
 * Inert stand-in so hooks always have a puzzle before the server answers. It
 * is never rendered, played, or timed: labels, input, and the clock all wait
 * for `current`. Only the server may choose the deck fallback, after a
 * successful schedule lookup, so every player sees the same puzzle #N.
 */
const STAND_IN: DailyPayload = { date: "", number: 0, puzzle: DECK[0] };

function untilTomorrow(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.max(1, Math.round((next - now.getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function Page() {
  const [today, setToday] = useState<DailyPayload | null>(null);
  const [current, setCurrent] = useState<DailyPayload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [progressById, setProgressById] = useState<Record<string, PuzzleProgress>>({});
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ message: string; tone?: "refused" | "pending" } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [detail, setDetail] = useState<{ index: number; top: number; left: number } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportStatus, setReportStatus] = useState<"sending" | "sent" | "failed" | null>(null);
  const [howtoOpen, setHowtoOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [, setTick] = useState(0);
  // Latest progress for the clock, updated synchronously on every save.
  const progressRef = useRef<Record<string, PuzzleProgress> | null>(null);
  // The running clock segment; folded into elapsedMs whenever the clock stops.
  const segmentRef = useRef<{ puzzleId: string; startedAt: number } | null>(null);
  const howtoRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const detailAnchor = useRef<HTMLElement | null>(null);
  const openedRef = useRef<string | null>(null);

  const shown = current ?? STAND_IN;
  const puzzle: Puzzle = shown.puzzle;
  const mode = today === null || shown.number === today.number ? "today" : "practice";
  const ready = current !== null && progressById[puzzle.id] !== undefined;
  // Nothing of the stand-in's saved progress may show while loading.
  const progress = (current && progressById[puzzle.id]) || emptyProgress(puzzle.id);
  const board = boardState(progress.guesses);
  const segment = segmentRef.current;
  const clockMs =
    progress.elapsedMs +
    (segment?.puzzleId === puzzle.id ? performance.now() - segment.startedAt : 0);

  const loadToday = useCallback(async () => {
    setLoadFailed(false);
    const payload = await fetchPayload("/api/today");
    if (!payload) {
      setLoadFailed(true);
      return;
    }
    setToday(payload);
    setCurrent(payload);
  }, []);

  useEffect(() => {
    void loadToday();

    const visitorKey = "liminal.visited.v1";
    const newVisitor = window.localStorage.getItem(visitorKey) === null;
    window.localStorage.setItem(visitorKey, "1");
    emitProductEvent("session_start", { mode: "today", new_visitor: newVisitor });
    if (!window.localStorage.getItem(HOWTO_KEY)) {
      howtoRef.current?.showModal();
      setHowtoOpen(true);
    }
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loadToday]);

  // Load saved progress the first time a puzzle is shown.
  useEffect(() => {
    if (!current || progressRef.current?.[current.puzzle.id]) return;
    const id = current.puzzle.id;
    progressRef.current = {
      ...(progressRef.current ?? {}),
      [id]: loadProgress(id) ?? emptyProgress(id),
    };
    setProgressById(progressRef.current);
  }, [current]);

  useEffect(() => {
    if (!ready) return;
    const key = `${mode}:${puzzle.id}`;
    if (openedRef.current === key) return;
    openedRef.current = key;
    emitProductEvent("puzzle_open", { puzzle_id: puzzle.id, mode });
  }, [ready, mode, puzzle.id]);

  const closeDetail = useCallback(() => {
    setDetail(null);
    setReportOpen(false);
    detailAnchor.current?.focus();
  }, []);

  useEffect(() => {
    if (!detail) return;
    detailRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !detailRef.current?.contains(event.target)) {
        if (!(event.target instanceof Element && event.target.closest(".word"))) closeDetail();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [detail, closeDetail]);

  const persist = useCallback((updated: PuzzleProgress) => {
    saveProgress(updated);
    progressRef.current = { ...(progressRef.current ?? {}), [updated.puzzleId]: updated };
    setProgressById(progressRef.current);
  }, []);

  /** Stop the clock: add the running segment to the puzzle's saved time. */
  const foldClock = useCallback(() => {
    const running = segmentRef.current;
    if (!running) return;
    segmentRef.current = null;
    const current = progressRef.current?.[running.puzzleId];
    if (!current) return;
    persist({
      ...current,
      elapsedMs: current.elapsedMs + (performance.now() - running.startedAt),
      updatedAt: Date.now(),
    });
  }, [persist]);

  // The clock counts thinking time only: it stops while the judge considers a
  // word, while the how-to is open, while the tab is hidden, and once the board
  // is complete. Network latency never reaches the score.
  const clockRunning = ready && !board.complete && !pending && !howtoOpen && visible;
  useEffect(() => {
    if (!clockRunning) return;
    segmentRef.current = { puzzleId: puzzle.id, startedAt: performance.now() };
    const interval = setInterval(() => setTick((tick) => tick + 1), 250);
    window.addEventListener("pagehide", foldClock);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", foldClock);
      foldClock();
    };
  }, [clockRunning, puzzle.id, foldClock]);

  function openHowto() {
    howtoRef.current?.showModal();
    setHowtoOpen(true);
  }

  const [loadingOther, setLoadingOther] = useState(false);
  /** Open a puzzle by number: today's from state, earlier ones from the archive API. */
  const openNumber = async (number: number) => {
    if (!today || loadingOther) return;
    setLoadingOther(true);
    const next =
      number === today.number ? today : ((await fetchPayload(`/api/puzzle/${number}`)) ?? null);
    setLoadingOther(false);
    if (!next) {
      setStatus({ message: "Couldn’t load that puzzle. Try again in a moment.", tone: "refused" });
      return;
    }
    setCurrent(next);
    setStatus(null);
    setText("");
    setDetail(null);
  };

  const refuse = (message: string, reason: string) => {
    setStatus({ message, tone: "refused" });
    emitProductEvent("guess_refused", { puzzle_id: puzzle.id, reason });
    inputRef.current?.select();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const word = text.trim();
    if (pending || board.complete || !word) return;
    const local = evaluateGuess(
      puzzle,
      word,
      progress.guesses.map((g) => g.answer),
    );
    if (local.rejected) {
      refuse(REFUSAL[local.rejected](word), "rejection");
      return;
    }

    setPending(true);
    setStatus({ message: `Placing “${word}”`, tone: "pending" });
    try {
      let feedback: GuessFeedback = local;
      if (local.needsJudgment) {
        const response = await fetch("/api/judge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ puzzleId: puzzle.id, answer: word }),
        }).catch(() => null);
        const data: unknown = await response?.json().catch(() => null);
        const judged =
          response?.ok &&
          data &&
          typeof data === "object" &&
          Reflect.get(data, "status") === "judged"
            ? parseStates(Reflect.get(data, "states"))
            : null;
        if (!judged) {
          const reason = data && typeof data === "object" ? Reflect.get(data, "reason") : undefined;
          if (reason === "rate-limited") {
            refuse("Too many tries at once. Wait a moment. No guess used.", "ratelimit");
          } else {
            refuse(
              "Couldn’t reach the judge. Try again in a moment. No guess used.",
              reason === "uncalibrated" ? "calibration" : "outage",
            );
          }
          return;
        }
        feedback = judgedFeedback(
          judged,
          "judged",
          String(Reflect.get(data ?? {}, "judgmentVersion") ?? "unknown"),
        );
      }

      // Record onto the latest saved progress, which carries any clock time
      // folded while the judge was considering.
      const updated = recordGuess(progressRef.current?.[puzzle.id] ?? progress, feedback, word);
      persist(updated);
      setText("");
      const after = boardState(updated.guesses);
      const landing = landingOf(feedback.states);
      const newlyFilled =
        landing.kind === "target" && board.fills[landing.key] === undefined ? landing.key : null;

      if (after.complete) {
        setStatus(null);
      } else if (newlyFilled === "center") {
        setStatus({ message: `“${word}” fills the center. ${after.filledCount} of 4.` });
      } else if (newlyFilled) {
        setStatus({ message: `“${word}” fills a gap. ${after.filledCount} of 4.` });
      } else if (landing.kind === "target") {
        setStatus({ message: `“${word}” fits a place you already filled.` });
      } else if (landing.kind === "line") {
        setStatus({ message: `“${word}” is on a line. Close, but it fills nothing.` });
      } else if (landing.kind === "single") {
        setStatus({ message: `“${word}” is inside only one circle.` });
      } else {
        setStatus({ message: `“${word}” is outside every circle.` });
      }

      emitProductEvent("guess_judged", {
        puzzle_id: puzzle.id,
        result: newlyFilled ? "inside" : landing.kind === "line" ? "close" : "outside",
        source: feedback.source === "authored" ? "authored" : "live",
      });
      if (after.complete) {
        emitProductEvent("puzzle_complete", {
          puzzle_id: puzzle.id,
          solved: true,
          guesses_used: updated.guesses.length,
        });
      }
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const openDetail = (index: number, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    detailAnchor.current = anchor;
    setReportOpen(false);
    setReportStatus(null);
    setReportNote("");
    setDetail({
      index,
      top: rect.bottom + window.scrollY + 8,
      left: Math.max(
        12,
        Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2),
      ),
    });
  };

  const sendReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || reportStatus === "sending" || reportStatus === "sent") return;
    setReportStatus("sending");
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        puzzleId: puzzle.id,
        answer: progress.guesses[detail.index].answer,
        note: reportNote,
      }),
    }).catch(() => null);
    const data: unknown = await response?.json().catch(() => null);
    const ok = response?.ok && data && typeof data === "object" && Reflect.get(data, "ok") === true;
    setReportStatus(ok ? "sent" : "failed");
    if (ok) emitProductEvent("report_submitted", { puzzle_id: puzzle.id });
  };

  const sharedText =
    board.complete && mode === "today" && typeof window !== "undefined"
      ? shareText({
          number: shown.number,
          guesses: progress.guesses.map((guess) => ({
            word: guess.answer,
            landing: landingOf(guess.states),
          })),
          elapsedMs: progress.elapsedMs,
          origin: window.location.origin,
        })
      : "";

  // Earlier puzzles: walk back one number at a time from the one shown.
  const previousNumber = shown.number > 1 ? shown.number - 1 : null;
  const detailGuess = detail ? progress.guesses[detail.index] : null;
  const detailFill = detail ? TARGETS.find((key) => board.fills[key] === detail.index) : undefined;

  return (
    <div className="shell">
      <header className="top">
        <Mark size={28} />
        <h1 className="wordmark">Liminal</h1>
        {!current ? null : mode === "today" ? (
          <span className="date">{dateLabel(shown.date)}</span>
        ) : (
          <span className="date">
            #{shown.number}{" "}
            <button
              type="button"
              className="link"
              onClick={() => today && void openNumber(today.number)}
            >
              Back to today
            </button>
          </span>
        )}
        <button type="button" className="help-button" aria-label="How to play" onClick={openHowto}>
          ?
        </button>
      </header>

      <main id="game" className="play" aria-busy={pending || (!current && !loadFailed)}>
        <Board
          key={current ? puzzle.id : "loading"}
          puzzle={current ? puzzle : null}
          guesses={progress.guesses}
          fills={board.fills}
          onWord={openDetail}
        />

        {!current && (
          <p className="status refused" aria-live="polite">
            {loadFailed && (
              <>
                Couldn’t load today’s puzzle.{" "}
                <button type="button" className="link strong" onClick={() => void loadToday()}>
                  Try again
                </button>
              </>
            )}
          </p>
        )}

        {current && (
          <p
            className={`status${status?.tone ? ` ${status.tone}` : ""}`}
            aria-live="polite"
            hidden={board.complete}
          >
            {status?.message ?? ""}
          </p>
        )}

        {current && !board.complete && (
          <>
            <form className="guess" onSubmit={submit} autoComplete="off">
              <label className="visually-hidden" htmlFor="guess">
                Your guess
              </label>
              <input
                id="guess"
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Name a thing"
                spellCheck={false}
                maxLength={120}
                disabled={pending || !ready}
              />
              <button type="submit" disabled={pending || !text.trim() || !ready}>
                {pending ? "Placing" : "Place"}
              </button>
            </form>
            <div className="meter">
              <span className="meter-count">
                {progress.guesses.length} {progress.guesses.length === 1 ? "guess" : "guesses"}
              </span>
              <span className={`meter-clock${clockRunning ? "" : " paused"}`} aria-hidden="true">
                {formatClock(clockMs)}
              </span>
            </div>
          </>
        )}

        {board.complete && (
          <section className="end" aria-live="polite">
            <h2 className="end-title">Filled in {progress.guesses.length} guesses</h2>
            <p className="end-sub">{formatClock(progress.elapsedMs)} on the clock</p>
            <div className="trail" aria-hidden="true">
              {progress.guesses.map((guess, index) => {
                const key = TARGETS.find((k) => board.fills[k] === index);
                return (
                  <span
                    key={`${guess.at}-${guess.answer}`}
                    className={`square${key ? ` square-${key}` : ""}`}
                  />
                );
              })}
            </div>
            <ul className="ways">
              {TARGETS.map((key) => {
                const region =
                  key === "center" ? puzzle.judgments.center : puzzle.judgments.pairs[key];
                return (
                  <li key={key}>
                    <span className={`swatch swatch-${key}`} aria-hidden="true" />
                    <span className="ways-copy">
                      <span className="ways-name">{regionName(puzzle, key)}</span>
                      <span className="ways-list">{region.answers.join(", ")}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {mode === "today" && sharedText && (
              <figure className="share-preview" aria-label="Share preview">
                <span className="share-preview-title">{sharedText.split("\n")[0]}</span>
                <span className="share-preview-squares" role="img" aria-label="Guess results">
                  {sharedText.split("\n")[1]}
                </span>
                <span className="share-preview-score">{sharedText.split("\n")[2]}</span>
                <span className="share-preview-url">
                  {(sharedText.split("\n")[3] ?? "")
                    .replace(/^https?:\/\//, "")
                    .replace(/\/s\/.+$/, "/s/…")}
                </span>
              </figure>
            )}
            <div className="end-actions">
              {mode === "today" && <ShareButton text={sharedText} title="Liminal" />}
              {previousNumber && (
                <button
                  type="button"
                  className="link strong"
                  disabled={loadingOther}
                  onClick={() => void openNumber(previousNumber)}
                >
                  Play #{previousNumber}
                </button>
              )}
            </div>
            {mode === "today" && <p className="end-next">Next puzzle in {untilTomorrow()}</p>}
          </section>
        )}
      </main>

      {detail && detailGuess && (
        <div
          ref={detailRef}
          className="detail"
          role="dialog"
          aria-label={`About ${detailGuess.answer}`}
          style={{ top: detail.top, left: detail.left }}
        >
          <p className="detail-word">{detailGuess.answer}</p>
          <ul className="verdicts">
            {puzzle.conditions.map((condition) => (
              <li
                key={condition.id}
                className={`verdict-${condition.id} ${detailGuess.states[condition.id]}`}
              >
                <span className="key" aria-hidden="true" />
                <span className="verdict-label">{condition.text}</span>
                <span className="verdict-state">
                  {STATE_WORD[detailGuess.states[condition.id]]}
                </span>
              </li>
            ))}
          </ul>
          {detailFill && <p className="detail-fill">Fills: {regionName(puzzle, detailFill)}</p>}
          {!reportOpen ? (
            <button type="button" className="link" onClick={() => setReportOpen(true)}>
              Disagree?
            </button>
          ) : (
            <form className="report" onSubmit={sendReport}>
              <label htmlFor="report-note">What did the board get wrong?</label>
              <textarea
                id="report-note"
                rows={3}
                maxLength={500}
                value={reportNote}
                onChange={(event) => setReportNote(event.target.value)}
                disabled={reportStatus === "sending" || reportStatus === "sent"}
              />
              <button
                type="submit"
                className="primary small"
                disabled={reportStatus === "sending" || reportStatus === "sent"}
              >
                {reportStatus === "sent" ? "Sent" : reportStatus === "sending" ? "Sending" : "Send"}
              </button>
              {reportStatus === "sent" && <p className="report-status">Noted. Thanks.</p>}
              {reportStatus === "failed" && (
                <p className="report-status">Couldn’t send that. Try again later.</p>
              )}
            </form>
          )}
        </div>
      )}

      <dialog
        ref={howtoRef}
        className="howto"
        onClose={() => {
          setHowtoOpen(false);
          window.localStorage.setItem(HOWTO_KEY, "1");
          inputRef.current?.focus();
        }}
      >
        <form method="dialog">
          <h2>How to play</h2>
          <p>Fill the four places where the circles overlap.</p>
          <p>The middle needs all three. Each other gap needs two circles but not the third.</p>
          <p>
            Every word lands where it belongs. A word on a line is almost in, and fills nothing.
          </p>
          <p>
            No guess limit. Your score is how many guesses and how long you take. The clock pauses
            while the judge thinks.
          </p>
          <button type="submit" className="primary wide">
            Play
          </button>
        </form>
      </dialog>
    </div>
  );
}
