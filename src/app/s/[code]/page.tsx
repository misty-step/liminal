import type { Metadata } from "next";
import Link from "next/link";
import { formatClock } from "@/lib/liminal/regions";
import { decodeReveal, revealSquares, scoreLine } from "@/lib/liminal/share";
import { Mark } from "../../Mark";
import { RevealWords } from "./RevealWords";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const result = decodeReveal(code);
  const title = result
    ? `Liminal #${result.number}: ${result.words.length} ${result.words.length === 1 ? "guess" : "guesses"}, ${formatClock(result.elapsedMs)}`
    : "Liminal | Broken share link";
  const description = "Tap to see the words.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: "/brand/liminal-share.png",
          width: 1200,
          height: 630,
          alt: "Liminal's three overlapping circles",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/brand/liminal-share.png"],
    },
    robots: { index: false },
  };
}

export default async function SharePage({ params }: Props) {
  const { code } = await params;
  const result = decodeReveal(code);
  return (
    <div className="shell share-shell">
      <header className="top">
        <Mark size={28} />
        <Link className="wordmark share-wordmark" href="/">
          Liminal
        </Link>
      </header>
      <main id="game" className="share-main">
        {result ? (
          <>
            <div className="share-result">
              <h1>Liminal #{result.number}</h1>
              <p
                className="share-result-squares"
                role="img"
                aria-label={`Guess results: ${result.words.length} guesses`}
              >
                {revealSquares(result.words)}
              </p>
              <p className="share-result-score">
                {scoreLine(result.words.length, result.elapsedMs)}
              </p>
            </div>
            <RevealWords words={result.words} />
            <Link className="primary share-play" href="/">
              Play today’s Liminal
            </Link>
          </>
        ) : (
          <div className="share-broken">
            <h1>This share link is broken</h1>
            <p>There’s nothing to reveal here.</p>
            <Link className="primary share-play" href="/">
              Play today’s Liminal
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
