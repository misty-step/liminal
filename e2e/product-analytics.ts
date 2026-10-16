/** Real built-Worker/PostHog rehearsal. Local-only; no paid judge or production data. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { chromium } from "playwright";
import type { Page, Request } from "playwright";

const base = process.env.BASE ?? "http://127.0.0.1:43185";
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Local only");
const out = process.env.OUT ?? "content/product-analytics";
mkdirSync(out, { recursive: true });
const health = await (await fetch(`${base}/api/health`)).json();
const { puzzle } = await (await fetch(`${base}/api/today`)).json();
const answers = [
  puzzle.judgments.pairs.c1.answers[0],
  puzzle.judgments.pairs.c2.answers[0],
  puzzle.judgments.pairs.c3.answers[0],
  puzzle.judgments.center.answers[0],
];
const canary = "privatecanary-liminal";
type Event = { uuid: string; event: string; properties: Record<string, unknown> };
const events: Event[] = [];
const statuses: number[] = [];
const pending = new WeakMap<Request, Event[]>();
const errors: string[] = [];
let blockedBatches = 0;
let legacyRequests = 0;
let outage = false;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

async function guess(page: Page, word: string, count?: number) {
  await page.locator("#guess").fill(word);
  await page.locator(".guess button[type=submit]").click();
  if (count !== undefined)
    await page
      .locator(".board .word-layer .word")
      .nth(count - 1)
      .waitFor();
}
async function waitForEvents(names: string[]) {
  const deadline = Date.now() + 60000;
  while (!names.every((name) => events.some((event) => event.event === name))) {
    assert(
      Date.now() < deadline,
      `Missing stored-transport candidates: ${names.filter((name) => !events.some((event) => event.event === name))}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem("liminal.howto.v2", "1"));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/events") {
      legacyRequests += 1;
      return route.abort();
    }
    if (url.origin === new URL(base).origin) return route.continue();
    if (url.hostname === "us.i.posthog.com") {
      if (outage && request.method() === "POST") {
        blockedBatches += 1;
        return route.abort("failed");
      }
      return route.continue();
    }
    return route.abort("blockedbyclient");
  });
  context.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).hostname !== "us.i.posthog.com")
      return;
    let bytes = request.postDataBuffer();
    assert(bytes);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
    let text = bytes.toString();
    if (text.startsWith("data="))
      text = Buffer.from(new URLSearchParams(text).get("data") ?? "", "base64").toString();
    const payload = JSON.parse(text);
    const batch = Array.isArray(payload) ? payload : (payload.batch ?? [payload]);
    const safe = batch.map(
      ({ uuid, event, properties: { token: _token, ...properties } }: Event) => ({
        uuid,
        event,
        properties,
      }),
    );
    for (const item of safe) {
      assert(!JSON.stringify(item).includes(canary));
      for (const word of answers) assert(!JSON.stringify(item.properties).includes(word));
      assert.equal(item.properties.app, "liminal");
      assert.equal(item.properties.release, health.revision);
      assert.equal(item.properties.is_synthetic, true);
      assert.equal(item.properties.$ip, "0.0.0.0");
      assert.equal(item.properties.$geoip_disable, true);
      assert(item.properties.$session_id);
    }
    pending.set(request, safe);
  });
  context.on("response", (response) => {
    const batch = pending.get(response.request());
    if (!batch) return;
    statuses.push(response.status());
    if (response.ok()) events.push(...batch);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/?email=${canary}%40example.test#${canary}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#guess:enabled").waitFor();
  await page.screenshot({ path: `${out}/ready.png`, fullPage: true });
  await waitForEvents(["$pageview", "puzzle_open"]);
  outage = true;
  await guess(page, puzzle.conditions[0].text);
  await page.waitForFunction(() =>
    document.querySelector("p.status")?.textContent?.includes("repeats a circle"),
  );
  assert.match(await page.locator(".meter-count").innerText(), /^0 guesses/);
  await guess(page, canary);
  await page.waitForFunction(() =>
    document.querySelector("p.status")?.textContent?.includes("No guess used"),
  );
  for (const [index, answer] of answers.entries()) await guess(page, answer, index + 1);
  assert.equal(await page.locator("h2.end-title").innerText(), "Filled in 4 guesses");
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("section.end") as Element).opacity === "1",
  );
  await page.screenshot({ path: `${out}/complete-during-outage.png`, fullPage: true });
  await page.waitForTimeout(4000);
  assert(blockedBatches > 0, "Real SDK capture transport was denied during play");
  outage = false;
  await page.locator(".board .word-layer .word").first().click();
  await page.getByRole("button", { name: "Disagree?" }).click();
  await page.locator("#report-note").fill(canary);
  await page.locator("form.report button[type=submit]").click();
  await page.getByText("Noted. Thanks.", { exact: true }).waitFor();
  await waitForEvents(["guess_refused", "guess_judged", "puzzle_complete", "report_submitted"]);
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h2.end-title").waitFor();
  await page.waitForTimeout(5000);
  assert.equal(
    new Set(events.filter((event) => event.event === "puzzle_complete").map((event) => event.uuid))
      .size,
    1,
  );
  await page.goto(`${base}/s/${canary}?private=${canary}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  assert(
    events.some((event) => event.event === "$pageview" && event.properties.route === "/s/:code"),
  );
  assert.equal(legacyRequests, 0);
  assert.deepEqual(errors, []);
  await context.close();

  const dnt = await browser.newContext();
  await dnt.addInitScript(() => {
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    localStorage.setItem("liminal.howto.v2", "1");
  });
  let dntRequests = 0;
  await dnt.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith("posthog.com") || url.pathname === "/api/events") dntRequests += 1;
    return url.origin === new URL(base).origin ? route.continue() : route.abort();
  });
  const privatePage = await dnt.newPage();
  await privatePage.goto(base, { waitUntil: "domcontentloaded" });
  await privatePage.locator("#guess:enabled").waitFor();
  for (const [index, answer] of answers.entries()) await guess(privatePage, answer, index + 1);
  assert.equal(await privatePage.locator("h2.end-title").innerText(), "Filled in 4 guesses");
  await privatePage.waitForTimeout(5000);
  assert.equal(dntRequests, 0);
  await dnt.close();
  writeFileSync(
    `${out}/receipt.json`,
    JSON.stringify(
      {
        result: "PASS",
        candidate: health.revision,
        health,
        events,
        statuses,
        blockedBatches,
        legacyRequests,
        dntRequests,
        browserErrors: errors,
        restoredWithoutDuplicateCompletion: true,
        actualReportStoredLocally: true,
        syntheticOnly: true,
        transportAcknowledgmentIsNotStorageProof: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      uniqueAcknowledgedEvents: new Set(events.map((event) => event.uuid)).size,
      blockedBatches,
      dntRequests,
      legacyRequests,
    }),
  );
} finally {
  await browser.close();
}
