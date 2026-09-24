"use client";

import { useState } from "react";
import type { RevealWord } from "@/lib/liminal/share";

// Places are named by their share-square color: the circle labels stay hidden
// so a reveal never spoils today's puzzle.
const LANDING_LABEL = {
  center: "The center",
  c1: "The orange gap",
  c2: "The green gap",
  c3: "The purple gap",
  line: "On a line",
  single: "Inside one circle",
  outside: "Outside every circle",
} as const;

export function RevealWords({ words }: { words: RevealWord[] }) {
  const [shown, setShown] = useState<boolean[]>(() => words.map(() => false));
  const allShown = shown.every(Boolean);

  return (
    <section className="reveal-words" aria-label="Player's guesses">
      <div className="reveal-words-heading">
        <h2>The words</h2>
        {!allShown && (
          <button
            type="button"
            className="link reveal-all"
            onClick={() => setShown(words.map(() => true))}
          >
            Show all
          </button>
        )}
      </div>
      <p className="reveal-hint">Tap a guess to see where it landed.</p>
      <ol className="reveal-list">
        {words.map(({ word, landing, filled }, index) => {
          const visible = shown[index];
          const place = landing.kind === "target" ? landing.key : landing.kind;
          const landingLabel = LANDING_LABEL[place];
          return (
            <li key={word}>
              <button
                type="button"
                className={`reveal-chip${visible ? " is-revealed" : ""}`}
                aria-pressed={visible}
                aria-label={
                  visible
                    ? `Guess ${index + 1}: ${word}. ${landingLabel}${filled ? ", filled this place" : ""}`
                    : `Guess ${index + 1}, hidden. Tap to reveal`
                }
                onClick={() =>
                  setShown((current) =>
                    current.map((value, position) => (position === index ? !value : value)),
                  )
                }
              >
                <span className="reveal-chip-number" aria-hidden="true">
                  {index + 1}
                </span>
                {visible ? (
                  <span className="reveal-chip-content">
                    <span className="reveal-chip-word">{word}</span>
                    <span className="reveal-chip-landing">
                      <span
                        className={`reveal-chip-swatch reveal-chip-swatch-${place}`}
                        aria-hidden="true"
                      />
                      <span>
                        {filled
                          ? `Filled ${landingLabel.toLowerCase()}`
                          : landing.kind === "target"
                            ? `Also ${landingLabel.toLowerCase()}`
                            : landingLabel}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="reveal-chip-hidden" aria-hidden="true">
                    Reveal guess
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
