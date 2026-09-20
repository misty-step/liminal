/**
 * Liminal candidate QA journeys — runs ON the ephemeral QA VM against the
 * locally built candidate. Captures mobile + desktop screenshots of every
 * meaningful state and asserts the expected feedback for each journey.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/home/exedev/shots";
mkdirSync(OUT, { recursive: true });

const ANSWERS: Record<string, { win: string; near: string; loss: string[] }> = {
  "The Pocket Relic": { win: "pebble", near: "nail", loss: ["boulder", "sponge", "glass shard", "nail", "geode"] },
  "The Kitchen Well": { win: "mug", near: "colander", loss: ["colander", "sieve", "basket", "sponge", "funnel"] },
  "Hidden Measures": { win: "windmill", near: "cupcake", loss: ["cupcake", "inchworm", "graveyard", "kilogram", "amphora"] },
  "Silent Partners": { win: "comb", near: "knife", loss: ["knife", "gnome", "hourglass", "listen", "wristwatch"] },
};

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function puzzleTitle(page: import("playwright").Page): Promise<string> {
  return (
    await page.evaluate(() => {
      const h2 = document.querySelector("h2.title");
      return h2?.childNodes[0]?.textContent?.trim() ?? "";
    })
  ) || "";
}

async function guess(page: import("playwright").Page, text: string) {
  await page.fill("#guess", text);
  await page.click(".guess-form button[type=submit]");
  await page.waitForTimeout(350);
}

async function openDrawer(page: import("playwright").Page, title: string) {
  await page.click(`.tabs button:text("Practice")`);
  await page.waitForTimeout(150);
  await page.click(`.cabinet-grid button:has-text("${title}")`);
  await page.waitForTimeout(150);
}

const browser = await chromium.launch();

// ---------- Desktop journeys ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/01-desktop-daily.png`, fullPage: true });
  const title = await puzzleTitle(page);
  const spec = ANSWERS[title];
  check("daily puzzle is a deck drawer", Boolean(spec), title);

  await guess(page, spec.near);
  const closeMarks = await page.locator(".history .marks .state.close").count();
  check("near miss shows exactly one Close", closeMarks === 1, `close marks=${closeMarks}`);
  await page.screenshot({ path: `${OUT}/02-desktop-near-miss.png`, fullPage: true });

  const before = await page.locator(".history li").count();
  await guess(page, "sundial");
  const notice = await page.locator(".notice").innerText().catch(() => "");
  const after = await page.locator(".history li").count();
  check(
    "judge outage is honest and consumes no guess",
    notice.includes("unavailable") && before === after,
    `notice="${notice.slice(0, 60)}" guesses ${before}->${after}`,
  );
  await page.screenshot({ path: `${OUT}/03-desktop-judge-outage.png`, fullPage: true });

  await guess(page, spec.win);
  const reveal = await page.locator(".reveal h3").innerText().catch(() => "");
  check("verified answer opens the drawer", reveal.toLowerCase().includes("drawer open"), reveal);
  await page.screenshot({ path: `${OUT}/04-desktop-win.png`, fullPage: true });

  await page.reload({ waitUntil: "networkidle" });
  const persisted = await page.locator(".history li").count();
  const revealAfter = await page.locator(".reveal h3").innerText().catch(() => "");
  check(
    "progress survives refresh",
    persisted >= 2 && revealAfter.toLowerCase().includes("drawer open"),
    `history=${persisted}`,
  );
  await page.screenshot({ path: `${OUT}/05-desktop-refresh.png`, fullPage: true });

  await page.click("button.link:text('Report an answer')");
  await page.waitForTimeout(150);
  await page.fill("#report-answer", spec.win);
  await page.fill("#report-note", "QA journey: report path check.");
  await page.screenshot({ path: `${OUT}/06-desktop-report.png`, fullPage: true });
  await page.click(".report button[type=submit]");
  await page.waitForTimeout(400);
  const reportStatus = await page.locator(".report .teaser").last().innerText().catch(() => "");
  check("answer report is filed", reportStatus.includes("Thanks"), reportStatus);
  await page.screenshot({ path: `${OUT}/07-desktop-report-filed.png`, fullPage: true });
  await context.close();
}

// ---------- Echo rejection (fresh context) ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const conditionText = await page.evaluate(() => {
    return document.querySelector(".conditions .condition-text")?.textContent?.trim() ?? "";
  });
  await guess(page, conditionText);
  const notice = await page.locator(".notice").innerText().catch(() => "");
  const rows = await page.locator(".history li").count();
  const rejected = notice.toLowerCase().includes("repeats");
  check("clue echo is rejected without consuming a guess", rejected && rows === 0, `rows=${rows}`);
  await page.screenshot({ path: `${OUT}/08-desktop-echo-rejected.png`, fullPage: true });
  await context.close();
}

// ---------- Loss journey on The Pocket Relic ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await openDrawer(page, "The Pocket Relic");
  const title = await puzzleTitle(page);
  check("practice opens the chosen drawer", title === "The Pocket Relic", title);
  for (const answer of ANSWERS["The Pocket Relic"].loss) {
    await guess(page, answer);
  }
  const reveal = await page.locator(".reveal h3").innerText().catch(() => "");
  const pips = await page.locator(".pip.used").count();
  check("five guesses close the drawer", reveal.includes("stays closed") && pips === 5, `${reveal} pips=${pips}`);
  await page.screenshot({ path: `${OUT}/09-desktop-loss.png`, fullPage: true });

  await page.click(".tabs button:text('Practice')");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/10-desktop-cabinet.png`, fullPage: true });
  await context.close();
}

// ---------- Mobile journeys ----------
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/11-mobile-daily.png`, fullPage: true });
  const title = await puzzleTitle(page);
  const spec = ANSWERS[title];
  await guess(page, spec.near);
  await page.screenshot({ path: `${OUT}/12-mobile-near-miss.png`, fullPage: true });
  await guess(page, spec.win);
  await page.screenshot({ path: `${OUT}/13-mobile-win.png`, fullPage: true });
  const reveal = await page.locator(".reveal h3").innerText().catch(() => "");
  check("mobile win journey", reveal.toLowerCase().includes("drawer open"), reveal);
  await context.close();
}

// ---------- Reduced motion ----------
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/14-mobile-reduced-motion.png`, fullPage: true });
  const transition = await page.evaluate(
    () => getComputedStyle(document.querySelector(".drawer-card")!).transitionDuration,
  );
  check("reduced motion disables transitions", transition === "0s", transition);
  await context.close();
}

await browser.close();

const failed = results.filter((row) => !row.ok);
writeFileSync(`${OUT}/journeys.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
