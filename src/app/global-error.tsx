"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          margin: 0,
          padding: "1.5rem",
          color: "#1e2126",
          background: "#fafaf8",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ width: "min(100%, 30rem)", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 600 }}>The board stopped.</h1>
          <p style={{ color: "#5c6169" }}>Nothing was spent. Your guesses are saved.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              padding: "0.65rem 1.25rem",
              border: 0,
              borderRadius: 12,
              color: "#fafaf8",
              background: "#1e2126",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
