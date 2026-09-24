"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Spot } from "@/lib/liminal/placement";
import { BOARD_H, BOARD_W, CIRCLES, placeWords, RADIUS } from "@/lib/liminal/placement";
import { CONDITION_IDS, landingOf, TARGETS } from "@/lib/liminal/regions";
import type { ConditionId, GuessRecord, Puzzle, TargetKey } from "@/lib/liminal/types";

const SPOKEN = { inside: "inside", close: "on the line", outside: "outside" } as const;
const START = { left: "50%", top: "100%" };

interface BoardProps {
  /** Null until the server names today's puzzle: rings only, no labels. */
  puzzle: Puzzle | null;
  guesses: readonly GuessRecord[];
  fills: Partial<Record<TargetKey, number>>;
  pendingWord: string | null;
  onWord: (index: number, anchor: HTMLElement) => void;
}

export function Board({ puzzle, guesses, fills, pendingWord, onWord }: BoardProps) {
  const uid = useId().replaceAll(":", "");
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  // Words already shown at their spot. A newer word starts at the bottom edge
  // and flies in on the next frame; restored progress appears in place.
  const [landed, setLanded] = useState(guesses.length);

  useEffect(() => {
    void document.fonts.ready.then(() => setFontsReady(true));
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(() => setWidth(board.clientWidth));
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (guesses.length <= landed) {
      if (guesses.length < landed) setLanded(guesses.length);
      return;
    }
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setLanded(guesses.length)),
    );
    return () => cancelAnimationFrame(frame);
  }, [guesses.length, landed]);

  // Measure words in the board's serif at the size CSS gives `.word`, then
  // place them. Re-runs when the board width or the guesses change.
  const spots: Spot[] | null = useMemo(() => {
    const board = boardRef.current;
    // The ref is null during server render, so check it before touching the DOM.
    if (!board || !fontsReady || width === 0) return null;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    const style = getComputedStyle(board);
    context.font = `500 ${style.getPropertyValue("--word-size").trim() || "17px"} ${style.fontFamily}`;
    const unitsPerPx = BOARD_W / width;
    return placeWords(
      guesses.map((g) => ({
        states: g.states,
        width: context.measureText(g.answer).width * unitsPerPx + 3,
      })),
      26 * unitsPerPx,
    );
  }, [guesses, width, fontsReady]);

  const fillOf = (index: number) => TARGETS.find((key) => fills[key] === index);
  const pairShape = (excluded: ConditionId) => {
    const [a, b] = CONDITION_IDS.filter((id) => id !== excluded);
    return (
      <g clipPath={`url(#${uid}-clip-${a})`}>
        <rect
          width={BOARD_W}
          height={BOARD_H}
          clipPath={`url(#${uid}-clip-${b})`}
          mask={`url(#${uid}-not-${excluded})`}
        />
      </g>
    );
  };

  return (
    <div className="board" ref={boardRef}>
      <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden="true">
        <defs>
          {CONDITION_IDS.map((id) => (
            <clipPath key={id} id={`${uid}-clip-${id}`}>
              <circle cx={CIRCLES[id].x} cy={CIRCLES[id].y} r={RADIUS} />
            </clipPath>
          ))}
          {CONDITION_IDS.map((id) => (
            <mask key={id} id={`${uid}-not-${id}`}>
              <rect width={BOARD_W} height={BOARD_H} fill="white" />
              <circle cx={CIRCLES[id].x} cy={CIRCLES[id].y} r={RADIUS} fill="black" />
            </mask>
          ))}
        </defs>
        {TARGETS.map((key) => (
          <g
            key={key}
            className={`target target-${key}${fills[key] !== undefined ? " filled" : ""}`}
          >
            {key === "center" ? (
              <g clipPath={`url(#${uid}-clip-c1)`}>
                <g clipPath={`url(#${uid}-clip-c2)`}>
                  <rect width={BOARD_W} height={BOARD_H} clipPath={`url(#${uid}-clip-c3)`} />
                </g>
              </g>
            ) : (
              pairShape(key)
            )}
          </g>
        ))}
        {CONDITION_IDS.map((id) => (
          <circle
            key={id}
            className={`ring ring-${id}`}
            cx={CIRCLES[id].x}
            cy={CIRCLES[id].y}
            r={RADIUS}
          />
        ))}
      </svg>

      {puzzle?.conditions.map((condition) => (
        <div key={condition.id} className={`circle-label label-${condition.id}`}>
          <span className="label-main">{condition.text}</span>
          {condition.detail && <span className="label-detail">{condition.detail}</span>}
        </div>
      ))}

      <div className="word-layer">
        {pendingWord && (
          <span className="word word-awaiting" aria-hidden="true" style={START}>
            {pendingWord}
          </span>
        )}
        {spots &&
          guesses.map((guess, index) => {
            const spot = spots[index];
            const filled = fillOf(index);
            const verdicts = (puzzle?.conditions ?? [])
              .map((c) => `${c.text}: ${SPOKEN[guess.states[c.id]]}`)
              .join("; ");
            const onLine = CONDITION_IDS.some((id) => guess.states[id] === "close");
            // A later center word sits on the filled ink center.
            const landing = landingOf(guess.states);
            const onInk =
              landing.kind === "target" &&
              landing.key === "center" &&
              fills.center !== undefined &&
              fills.center !== index;
            const showMarks = !spot.exact && filled === undefined;
            const position =
              index < landed ? { left: `${spot.x}%`, top: `${(spot.y / BOARD_H) * 100}%` } : START;
            return (
              <button
                key={`${guess.at}-${guess.answer}`}
                type="button"
                className={[
                  "word",
                  index < landed ? "" : "entering",
                  onLine ? "on-line" : "",
                  onInk ? "on-ink" : "",
                  filled ? `filled filled-${filled}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={position}
                aria-label={`${guess.answer}. ${verdicts}.${filled ? " Fills a region." : ""}`}
                onClick={(event) => onWord(index, event.currentTarget)}
              >
                <span>{guess.answer}</span>
                {showMarks && index < landed && (
                  <span className="word-marks" aria-hidden="true">
                    {CONDITION_IDS.map((id) => (
                      <span key={id} className={`mark mark-${id} ${guess.states[id]}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
