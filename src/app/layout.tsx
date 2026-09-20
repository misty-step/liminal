import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liminal — a daily intersection puzzle",
  description:
    "Find a real object that satisfies every condition. Outside, Close, Inside. Five guesses, one drawer a day.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#game">
          Skip to the puzzle
        </a>
        {children}
      </body>
    </html>
  );
}
