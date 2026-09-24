/**
 * Liminal candidate QA journeys — runs ON the ephemeral QA VM against the
 * locally built candidate. Captures mobile + desktop screenshots of meaningful
 * states and asserts the expected feedback for each journey.
 *
 * BASE serves the production candidate. Authored answers are evaluated locally,
 * so only the OUTAGE_BASE journey reaches the judge. OUTAGE_BASE may point at a
 * second instance with an unreachable judge or BASE without judge credentials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import type { Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUTAGE_BASE = process.env.OUTAGE_BASE ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "/home/exedev/shots";
mkdirSync(OUT, { recursive: true });

type PairKey = "c1" | "c2" | "c3";
type TargetKey = PairKey | "center";
type PuzzleAnswers = { center: string; pairs: Record<PairKey, readonly string[]> };

// Today's authored answers come from the app itself (/api/today), so the
// journeys work for any scheduled puzzle without calling the judge. The first
// answer per region drives the four-fill journeys; the rest drive no-limit.
async function loadToday(): Promise<{ label: string; answers: PuzzleAnswers }> {
  const response = await fetch(`${BASE}/api/today`);
  if (!response.ok) throw new Error(`/api/today returned ${response.status}`);
  const payload: unknown = await response.json();
  const puzzle = payload && typeof payload === "object" ? Reflect.get(payload, "puzzle") : null;
  const conditions =
    puzzle && typeof puzzle === "object" ? Reflect.get(puzzle, "conditions") : null;
  const judgments = puzzle && typeof puzzle === "object" ? Reflect.get(puzzle, "judgments") : null;
  const words = (region: unknown): string[] => {
    const answers = region && typeof region === "object" ? Reflect.get(region, "answers") : null;
    return Array.isArray(answers) ? answers.filter((a): a is string => typeof a === "string") : [];
  };
  const pairs = judgments && typeof judgments === "object" ? Reflect.get(judgments, "pairs") : null;
  const pair = (key: PairKey) =>
    words(pairs && typeof pairs === "object" ? Reflect.get(pairs, key) : null);
  const label = Array.isArray(conditions) ? String(Reflect.get(conditions[0] ?? {}, "text")) : "";
  const center = words(
    judgments && typeof judgments === "object" ? Reflect.get(judgments, "center") : null,
  )[0];
  if (!label || !center) throw new Error("/api/today returned no authored answers");
  return { label, answers: { center, pairs: { c1: pair("c1"), c2: pair("c2"), c3: pair("c3") } } };
}

const TODAY = await loadToday();

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function puzzleLabel(page: Page): Promise<string> {
  return (await page.locator(".label-c1 .label-main").innerText()).trim();
}

function answersFor(label: string): PuzzleAnswers {
  if (label !== TODAY.label) {
    throw new Error(`Board shows "${label}", /api/today says "${TODAY.label}"`);
  }
  return TODAY.answers;
}

async function dismissHowto(page: Page) {
  await page.locator("dialog.howto button[type=submit]").click();
  await page.locator("dialog.howto").waitFor({ state: "hidden" });
}

async function guess(page: Page, text: string, expectedWords?: number) {
  await page.fill("#guess", text);
  await page.click(".guess button[type=submit]");
  if (expectedWords !== undefined) {
    await page
      .locator(".board .word-layer .word")
      .nth(expectedWords - 1)
      .waitFor();
  }
}

async function guessCount(page: Page): Promise<number> {
  const text = await page.locator(".meter-count").innerText();
  return Number.parseInt(text, 10);
}

async function awaitStatus(page: Page, text: string) {
  await page.waitForFunction(
    (fragment) => document.querySelector("p.status")?.textContent?.includes(fragment),
    text,
  );
  return (await page.locator("p.status").innerText()).trim();
}

async function fillBoard(page: Page, label: string, screenshotPrefix: string) {
  const answers = answersFor(label);
  await page.screenshot({ path: `${OUT}/${screenshotPrefix}-idle.png`, fullPage: true });
  const order: { key: TargetKey; answer: string }[] = [
    { key: "c3", answer: answers.pairs.c3[0] },
    { key: "c2", answer: answers.pairs.c2[0] },
    { key: "c1", answer: answers.pairs.c1[0] },
    { key: "center", answer: answers.center },
  ];
  for (const [index, { key, answer }] of order.entries()) {
    await guess(page, answer, index + 1);
    const filledWord = await page.locator(`.board .word-layer .word.filled.filled-${key}`).count();
    const filledTargets = await page.locator(".target.filled").count();
    check(
      `${screenshotPrefix} fill ${key}`,
      filledWord === 1 && filledTargets === index + 1,
      `word=${filledWord}, targets=${filledTargets}, answer=${answer}`,
    );
    if (index === 0) {
      await page.screenshot({ path: `${OUT}/${screenshotPrefix}-first-fill.png`, fullPage: true });
    }
  }
  await page.locator("h2.end-title").waitFor();
  const title = (await page.locator("h2.end-title").innerText()).trim();
  const clock = (await page.locator("p.end-sub").innerText()).trim();
  check(
    `${screenshotPrefix} completed in four with a time`,
    title === "Filled in 4 guesses" && /^\d+:\d{2} on the clock$/.test(clock),
    `${title} / ${clock}`,
  );
  await page.screenshot({ path: `${OUT}/${screenshotPrefix}-end.png`, fullPage: true });
}

const browser = await chromium.launch();

// ---------- Desktop completion, persistence, report, practice ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissHowto(page);
  const todayLabel = await puzzleLabel(page);
  check("board shows the scheduled puzzle", todayLabel === TODAY.label, todayLabel);
  await fillBoard(page, todayLabel, "desktop");

  await page.reload({ waitUntil: "networkidle" });
  const persistedWords = await page.locator(".board .word-layer .word").count();
  const persistedTitle = (await page.locator("h2.end-title").innerText()).trim();
  check(
    "four fills survive refresh",
    persistedWords === 4 && persistedTitle === "Filled in 4 guesses",
    `words=${persistedWords}, title=${persistedTitle}`,
  );
  await page.screenshot({ path: `${OUT}/desktop-refresh.png`, fullPage: true });

  await page.locator(".board .word-layer .word").first().click();
  const verdicts = await page.locator(".detail .verdicts li").count();
  check("word detail has three verdicts", verdicts === 3, `verdicts=${verdicts}`);
  await page.getByRole("button", { name: "Disagree?" }).click();
  await page.fill("#report-note", "QA journey: region verdict report check.");
  await page.locator("form.report button[type=submit]").click();
  await page.locator(".report-status").waitFor();
  const reportStatus = (await page.locator(".report-status").innerText()).trim();
  check("word verdict report is filed", reportStatus === "Noted. Thanks.", reportStatus);
  await page.screenshot({ path: `${OUT}/desktop-report.png`, fullPage: true });

  // Archive: "Play #N" opens the previous day's puzzle. Puzzle #1 has none.
  const previous = page.getByRole("button", { name: /^Play #\d+$/ });
  if ((await previous.count()) === 0) {
    check("archive opens an earlier puzzle", true, "skipped: today is puzzle #1");
  } else {
    await previous.click();
    await page.getByRole("button", { name: "Back to today" }).waitFor();
    const archiveLabel = await puzzleLabel(page);
    check(
      "archive opens an earlier puzzle",
      archiveLabel !== todayLabel,
      `today=${todayLabel}, archive=${archiveLabel}`,
    );
    await page.screenshot({ path: `${OUT}/desktop-archive.png`, fullPage: true });
    await page.getByRole("button", { name: "Back to today" }).click();
    await page.getByRole("button", { name: "Back to today" }).waitFor({ state: "detached" });
    const returnedLabel = await puzzleLabel(page);
    check("back to today restores daily puzzle", returnedLabel === todayLabel, returnedLabel);
  }
  await context.close();
}

// ---------- Local refusals, fresh progress ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const label = await puzzleLabel(page);
  const answer = answersFor(label).pairs.c3[0];
  await guess(page, label);
  const echo = await awaitStatus(page, "repeats a circle");
  const echoWords = await page.locator(".board .word-layer .word").count();
  const echoDots = await guessCount(page);
  check(
    "circle label echo spends nothing",
    echo.includes("repeats a circle") && echoWords === 0 && echoDots === 0,
    `words=${echoWords}, guesses=${echoDots}, status=${echo}`,
  );
  await page.screenshot({ path: `${OUT}/desktop-echo-refused.png`, fullPage: true });

  await guess(page, answer, 1);
  await guess(page, answer.toUpperCase());
  const repeat = await awaitStatus(page, "already on the board");
  const repeatWords = await page.locator(".board .word-layer .word").count();
  const repeatDots = await guessCount(page);
  check(
    "case-insensitive repeat spends nothing",
    repeat.includes("already on the board") && repeatWords === 1 && repeatDots === 1,
    `words=${repeatWords}, guesses=${repeatDots}, status=${repeat}`,
  );
  await page.screenshot({ path: `${OUT}/desktop-repeat-refused.png`, fullPage: true });
  await context.close();
}

// ---------- No guess limit: many misses, center never filled ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const label = await puzzleLabel(page);
  const { pairs } = answersFor(label);
  const pairAnswers = [...new Set([...pairs.c2, ...pairs.c3, ...pairs.c1])];
  for (const [index, answer] of pairAnswers.entries()) {
    await guess(page, answer, index + 1);
  }
  const count = await guessCount(page);
  const stillPlaying = await page.locator("#guess").isEnabled();
  const ended = await page.locator("section.end").count();
  check(
    "no guess limit: the board stays open until complete",
    count === pairAnswers.length && stillPlaying && ended === 0,
    `guesses=${count}, field enabled=${stillPlaying}, end panels=${ended}`,
  );
  await page.screenshot({ path: `${OUT}/desktop-no-limit.png`, fullPage: true });
  await context.close();
}

// ---------- Judge outage (dedicated instance with an unreachable judge) ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  const page = await context.newPage();
  await page.goto(OUTAGE_BASE, { waitUntil: "networkidle" });
  await guess(page, "sundial");
  const status = await awaitStatus(page, "No guess used");
  const words = await page.locator(".board .word-layer .word").count();
  const usedDots = await guessCount(page);
  check(
    "judge outage is honest and spends nothing",
    status.includes("Couldn’t reach the judge") &&
      status.includes("No guess used") &&
      words === 0 &&
      usedDots === 0,
    `status=${status}, words=${words}, guesses=${usedDots}`,
  );
  await page.screenshot({ path: `${OUT}/desktop-judge-outage.png`, fullPage: true });
  await context.close();
}

// ---------- Thinking-time clock (US-003) ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  const page = await context.newPage();
  // A slow judge that ends in an outage: the wait must not reach the score.
  await page.route("**/api/judge", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ status: "unavailable", reason: "upstream" }),
    });
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Seconds on the clock. Held over a 2.5 s pause means at most 1 s of drift
  // (the steps around the pause still count); running means at least 2 s.
  const clock = async () => {
    const [m, sec] = (await page.locator(".meter-clock").innerText()).trim().split(":");
    return Number(m) * 60 + Number(sec);
  };
  const idle = async () => new Promise((resolve) => setTimeout(resolve, 2500));

  const start = await clock();
  await idle();
  const thinking = await clock();
  check("clock runs while the player thinks", thinking - start >= 2, `${start} -> ${thinking}`);

  await page.fill("#guess", "sundial");
  await page.click(".guess button[type=submit]");
  const status = await awaitStatus(page, "No guess used");
  const afterJudge = await clock();
  check(
    "clock holds while the judge considers a word",
    afterJudge - thinking <= 1 && (await guessCount(page)) === 0,
    `${thinking} -> ${afterJudge}; ${status}`,
  );

  await page.getByRole("button", { name: "How to play" }).click();
  await idle();
  await dismissHowto(page);
  const afterHowto = await clock();
  check(
    "clock holds while the how-to is open",
    afterHowto - afterJudge <= 1,
    `${afterJudge} -> ${afterHowto}`,
  );

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await idle();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const afterHidden = await clock();
  check(
    "clock holds while the tab is hidden",
    afterHidden - afterHowto <= 1,
    `${afterHowto} -> ${afterHidden}`,
  );
  await context.close();
}

// ---------- Mobile completion ----------
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissHowto(page);
  const label = await puzzleLabel(page);
  check("mobile board shows the scheduled puzzle", label === TODAY.label, label);
  await fillBoard(page, label, "mobile");
  await context.close();
}

// ---------- Reduced motion ----------
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const label = await puzzleLabel(page);
  await guess(page, answersFor(label).pairs.c3[0], 1);
  const transition = await page
    .locator(".board .word-layer .word")
    .first()
    .evaluate((word) => {
      return getComputedStyle(word).transitionDuration;
    });
  const durations = transition.split(",").map((value) => {
    const duration = value.trim();
    const seconds = Number.parseFloat(duration);
    return duration.endsWith("ms") ? seconds / 1000 : seconds;
  });
  check(
    "reduced motion minimizes word transitions",
    durations.length > 0 &&
      durations.every((seconds) => Number.isFinite(seconds) && seconds <= 0.001),
    transition,
  );
  await page.screenshot({ path: `${OUT}/mobile-reduced-motion.png`, fullPage: true });
  await context.close();
}

await browser.close();

const failed = results.filter((row) => !row.ok);
writeFileSync(
  `${OUT}/journeys.json`,
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
