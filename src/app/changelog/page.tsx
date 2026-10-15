import type { Metadata } from "next";
import Link from "next/link";
import Markdown from "react-markdown";
import { version } from "../../../package.json";
import { Mark } from "../Mark";
import styles from "./page.module.css";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Changelog | Liminal",
  description: "What’s changed in Liminal, release by release.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  const notes = (process.env.LIMINAL_CHANGELOG ?? "").replace(/^# Changelog\s*/, "");
  return (
    <div className={`shell share-shell ${styles.shell}`}>
      <header className="top">
        <Mark size={28} />
        <Link className="wordmark share-wordmark" href="/">
          Liminal
        </Link>
        <nav aria-label="Main">
          <Link className="link" href="/">
            Play today
          </Link>
        </nav>
      </header>
      <main id="game" className={styles.main}>
        <h1>Changelog</h1>
        <p className={styles.intro}>A little better, one release at a time.</p>
        <p className={styles.version}>This build · {version}</p>
        <article className={styles.notes} aria-label="Release notes">
          {notes.trim() ? (
            <Markdown skipHtml>{notes}</Markdown>
          ) : (
            <p>The first release notes will appear here with the next release.</p>
          )}
        </article>
        <a className="link" href="https://github.com/misty-step/liminal/releases">
          All releases on GitHub
        </a>
      </main>
    </div>
  );
}
