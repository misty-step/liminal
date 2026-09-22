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
          color: "#f3ead7",
          background: "#101419",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ width: "min(100%, 30rem)", textAlign: "center" }}>
          {/* biome-ignore lint/performance/noImgElement: keep the root error boundary dependency-light. */}
          <img src="/brand/liminal-mark-32.svg" width="48" height="48" alt="" />
          <p style={{ color: "#d8b45f", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            The cabinet paused
          </p>
          <h1 style={{ fontFamily: "Georgia, serif" }}>This drawer would not open.</h1>
          <p>Nothing was spent. Try the drawer again when you are ready.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0.65rem 1rem",
              border: "1px solid #efd58f",
              borderRadius: 5,
              color: "#17140d",
              background: "#d8b45f",
              fontWeight: 700,
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
