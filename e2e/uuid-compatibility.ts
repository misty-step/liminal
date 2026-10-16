/** Local-build regression: bun run e2e/uuid-compatibility.ts (never production). */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.BASE ?? "http://127.0.0.1:43175";
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Local only");
const out = process.env.OUT ?? "content/uuid-compatibility";
mkdirSync(out, { recursive: true });
const response = await fetch(`${base}/api/today`);
assert(response.ok, `Local puzzle API: ${response.status}`);
const { puzzle } = await response.json();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const results: object[] = [];

try {
  for (const scenario of [
    "fallback-desktop",
    "fallback-mobile",
    "storage-denied",
    "entropy-denied",
    "fetch-throws",
    "fetch-rejects",
  ]) {
    const context = await browser.newContext({
      viewport:
        scenario === "fallback-mobile" ? { width: 390, height: 844 } : { width: 1280, height: 860 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const events: unknown[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Never write legacy analytics or send test traffic to production sinks.
    await page.route("https://**/*", (route) => route.abort("blockedbyclient"));
    await page.route("**/api/events", async (route) => {
      events.push(route.request().postDataJSON());
      await route.abort("blockedbyclient");
    });
    await context.addInitScript((scenario) => {
      Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
      if (scenario === "storage-denied") {
        Object.defineProperty(window, "sessionStorage", {
          get() {
            throw new Error("Storage denied");
          },
        });
      }
      if (scenario === "entropy-denied") {
        Object.defineProperty(crypto, "getRandomValues", {
          value() {
            throw new Error("Entropy denied");
          },
        });
      }
      if (scenario.startsWith("fetch-")) {
        const original = window.fetch.bind(window);
        window.fetch = (...args) => {
          if (String(args[0]).includes("posthog.com") || args[0] === "/api/events") {
            if (scenario === "fetch-throws") throw new Error("Fetch denied");
            return Promise.reject(new Error("Network unavailable"));
          }
          return original(...args);
        };
      }
    }, scenario);
    try {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${out}/${scenario}-mount.png`, fullPage: true });
      assert.equal(await page.evaluate(() => typeof crypto.randomUUID), "undefined");
      assert.equal(await page.getByText("The board stopped.").count(), 0, "No global error");
      assert.deepEqual(errors, [], "Mount must not throw");
      await page.locator("dialog.howto button[type=submit]").click();
      await page.locator("dialog.howto").waitFor({ state: "hidden" });
      assert(await page.locator("#guess").isEnabled(), "Puzzle is playable");
      await page.screenshot({ path: `${out}/${scenario}-playable.png`, fullPage: true });
      const answers = [
        puzzle.judgments.pairs.c1.answers[0],
        puzzle.judgments.pairs.c2.answers[0],
        puzzle.judgments.pairs.c3.answers[0],
        puzzle.judgments.center.answers[0],
      ];
      for (const [index, answer] of answers.entries()) {
        await page.locator("#guess").fill(answer);
        await page.locator(".guess button[type=submit]").click();
        await page.locator(".board .word-layer .word").nth(index).waitFor();
      }
      assert.equal(await page.locator("h2.end-title").innerText(), "Filled in 4 guesses");
      await page.waitForFunction(() => {
        const end = document.querySelector("section.end");
        return end && getComputedStyle(end).opacity === "1";
      });
      await page.screenshot({ path: `${out}/${scenario}-complete.png`, fullPage: true });
      if (scenario.startsWith("fallback-")) {
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator("h2.end-title").innerText(), "Filled in 4 guesses");
      }
      assert.equal(events.length, 0, "New clients do not use the retired collector");
      assert.deepEqual(errors, [], "Gameplay and reload must not throw");
      results.push({ scenario, ok: true, events: events.length, errors });
      console.log(
        `PASS ${scenario}: Filled in 4 guesses; ${events.length} captured events; no page errors`,
      );
    } catch (error) {
      results.push({ scenario, ok: false, events: events.length, errors, failure: String(error) });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
