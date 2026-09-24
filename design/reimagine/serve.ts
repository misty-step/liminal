/**
 * Prototype server for the reimagine exploration. Serves the static
 * prototypes and the real deck. Authored answers and near misses judge in the
 * browser; any other guess is refused as "offline" unless a judge is named.
 *
 * Live judging is opt-in because a judge persists confident verdicts in its
 * durable first-writer-wins cache. Point it at a local or staging app, not
 * production, for exploration:
 *
 *   bun design/reimagine/serve.ts                                   authored only
 *   LIMINAL_JUDGE_URL=http://localhost:3000/api/judge bun design/reimagine/serve.ts
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { dailyPuzzle, dateKeyUTC } from "../../src/lib/liminal/daily";
import { DECK, DECK_VERSION } from "../../src/lib/liminal/deck";

const PORT = Number(process.env.PORT ?? 4317);
const JUDGE_URL = process.env.LIMINAL_JUDGE_URL;
const ROOT = import.meta.dirname;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function deckPayload() {
  const today = dailyPuzzle(dateKeyUTC(), DECK);
  return JSON.stringify({
    version: DECK_VERSION,
    todayId: today.id,
    dateKey: dateKeyUTC(),
    puzzles: DECK.map(({ id, conditions, judgments }) => ({
      id,
      conditions: conditions.map(({ id: cid, text }) => ({ id: cid, text })),
      // The exploration prototypes predate regions: center answers are their
      // wins, pair answers their single-condition misses.
      answers: judgments.center.answers,
      nearMisses: (["c1", "c2", "c3"] as const).flatMap((fails) =>
        judgments.pairs[fails].answers.map((answer) => ({ answer, fails })),
      ),
    })),
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/deck.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(deckPayload());
    return;
  }

  if (url.pathname === "/api/judge" && req.method === "POST") {
    if (!JUDGE_URL) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "unavailable", reason: "prototype-offline" }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      const upstream = await fetch(JUDGE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: Buffer.concat(chunks).toString("utf8"),
        signal: AbortSignal.timeout(8000),
      });
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(await upstream.text());
    } catch {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "unavailable", reason: "unreachable" }));
    }
    return;
  }

  const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
  const type = TYPES[extname(path)];
  if (!type || path.includes("..")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => {
  console.log(`Liminal prototypes on http://localhost:${PORT}/`);
});
