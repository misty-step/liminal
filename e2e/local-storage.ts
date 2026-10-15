/** Local build only: BASE=http://127.0.0.1:43185 bun run e2e/local-storage.ts */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { parsePuzzle } from "../src/lib/liminal/puzzleSchema";
import { parseProductEventPayload } from "../src/lib/liminal/runtime";
import { parseProgress } from "../src/lib/liminal/storage";

declare global {
  interface Window {
    __liminalStorageProbe: {
      getterFailures: number;
      readFailures: string[];
      writeFailures: string[];
      unhandled: string[];
    };
  }
}

const base = process.env.BASE ?? "http://127.0.0.1:43185";
const origin = new URL(base).origin;
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Local only");
const out = process.env.OUT ?? "content/local-storage";
mkdirSync(out, { recursive: true });
const response = await fetch(`${base}/api/today`);
assert(response.ok, `Local puzzle API: ${response.status}`);
const payload: unknown = await response.json();
assert(payload && typeof payload === "object" && "puzzle" in payload);
const puzzle = parsePuzzle(payload.puzzle, "local /api/today");
const progressKey = `liminal.v2.puzzle.${puzzle.id}`;
const answers = [
  puzzle.judgments.pairs.c1.answers[0],
  puzzle.judgments.pairs.c2.answers[0],
  puzzle.judgments.pairs.c3.answers[0],
  puzzle.judgments.center.answers[0],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const results: object[] = [];

try {
  for (const scenario of ["denied-getter", "denied-read", "denied-write", "available"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const errors: string[] = [];
    const external: string[] = [];
    const events: unknown[] = [];
    const judgeRequests: string[] = [];
    // Never persist analytics or acknowledge invented delivery. Block non-local traffic.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        external.push(url.origin);
        await route.abort("blockedbyclient");
      } else if (url.pathname === "/api/events") {
        events.push(route.request().postDataJSON());
        await route.abort("blockedbyclient");
      } else if (url.pathname === "/api/judge") {
        judgeRequests.push(url.pathname);
        await route.abort("blockedbyclient");
      } else {
        await route.continue();
      }
    });
    await context.addInitScript((scenario) => {
      const probe: Window["__liminalStorageProbe"] = {
        getterFailures: 0,
        readFailures: [],
        writeFailures: [],
        unhandled: [],
      };
      window.__liminalStorageProbe = probe;
      window.addEventListener("unhandledrejection", (event) => {
        probe.unhandled.push(String(event.reason));
      });
      if (scenario === "denied-getter") {
        Object.defineProperty(window, "localStorage", {
          get() {
            probe.getterFailures += 1;
            throw new DOMException("Storage denied", "SecurityError");
          },
        });
      } else {
        const local = window.localStorage;
        const getItem = Storage.prototype.getItem;
        const setItem = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
          if (this === local && scenario === "denied-read") {
            probe.readFailures.push(key);
            throw new DOMException("Read denied", "SecurityError");
          }
          return getItem.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (this === local && scenario === "denied-write") {
            probe.writeFailures.push(key);
            throw new DOMException("Quota exceeded", "QuotaExceededError");
          }
          return setItem.call(this, key, value);
        };
      }
    }, scenario);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(base, { waitUntil: "networkidle" });
      assert.equal(await page.evaluate(() => typeof crypto.randomUUID), "function");
      await page.locator("dialog.howto[open]").waitFor();
      await page.screenshot({ path: `${out}/${scenario}-mount.png`, fullPage: true });
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.locator("dialog.howto").waitFor({ state: "hidden" });
      assert(await page.locator("#guess").isEnabled());
      // Reopening how-to folds a running clock segment and dismissing it writes a preference.
      await page.getByRole("button", { name: "How to play", exact: true }).click();
      await page.locator("dialog.howto[open]").waitFor();
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.locator("dialog.howto").waitFor({ state: "hidden" });
      for (const [index, answer] of answers.entries()) {
        await page.locator("#guess").fill(answer);
        await page.getByRole("button", { name: "Place", exact: true }).click();
        await page.locator(".board .word-layer .word").nth(index).waitFor();
      }
      assert.equal(await page.locator("h2.end-title").innerText(), "Filled in 4 guesses");
      await page.waitForFunction(() => {
        const end = document.querySelector("section.end");
        return end && getComputedStyle(end).opacity === "1";
      });
      await page.screenshot({ path: `${out}/${scenario}-complete.png`, fullPage: true });
      const probe = await page.evaluate(() => window.__liminalStorageProbe);
      assert.deepEqual(probe.unhandled, []);
      if (scenario === "denied-getter") assert(probe.getterFailures > 0);
      if (scenario === "denied-read") {
        for (const key of [
          "liminal.visited.v1",
          "liminal.howto.v2",
          "liminal.sound.v1",
          progressKey,
        ]) {
          assert(probe.readFailures.includes(key), `Actual denied read: ${key}`);
        }
      }
      if (scenario === "denied-write") {
        for (const key of ["liminal.visited.v1", "liminal.howto.v2", progressKey]) {
          assert(probe.writeFailures.includes(key), `Actual denied write: ${key}`);
        }
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), progressKey), null);
      }
      const sessionEvents = events.flatMap((event) => {
        const parsed = parseProductEventPayload(event);
        assert(parsed.ok, "Captured attempt is a valid envelope, not proof of delivery");
        return parsed.value.eventName === "session_start" ? [parsed.value] : [];
      });
      if (scenario === "denied-getter" || scenario === "denied-read") {
        assert.equal(sessionEvents.length, 0, "No invented first-visit telemetry");
      } else {
        assert.equal(sessionEvents.length, 1);
        assert.equal(sessionEvents[0].props.new_visitor, true);
      }
      let reloadVerified = false;
      if (scenario === "available") {
        const before = await page.evaluate((key) => localStorage.getItem(key), progressKey);
        assert(before);
        const saved = parseProgress(before, puzzle.id);
        assert(saved);
        assert.deepEqual(
          saved.guesses.map((guess) => guess.answer),
          answers,
        );
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator("h2.end-title").innerText(), "Filled in 4 guesses");
        assert.equal(await page.locator("dialog.howto[open]").count(), 0);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), progressKey), before);
        assert.equal(await page.evaluate(() => localStorage.getItem("liminal.visited.v1")), "1");
        assert.equal(await page.evaluate(() => localStorage.getItem("liminal.howto.v2")), "1");
        await page.waitForFunction(() => {
          const end = document.querySelector("section.end");
          return end && getComputedStyle(end).opacity === "1";
        });
        await page.screenshot({ path: `${out}/${scenario}-reload.png`, fullPage: true });
        assert.deepEqual(await page.evaluate(() => window.__liminalStorageProbe.unhandled), []);
        const returning = events.map((event) => parseProductEventPayload(event));
        assert(
          returning.some(
            (event) =>
              event.ok &&
              event.value.eventName === "session_start" &&
              event.value.props.new_visitor === false,
          ),
        );
        reloadVerified = true;
      }
      assert.equal(await page.getByText("The board stopped.", { exact: true }).count(), 0);
      assert.deepEqual(errors, [], "No global error or unhandled page exception");
      assert.deepEqual(judgeRequests, [], "Four authored guesses need no live judge");
      assert.deepEqual(external, [], "No production or other external browser traffic");
      results.push({
        scenario,
        ok: true,
        nativeRandomUUID: true,
        result: "Filled in 4 guesses",
        howtoReopened: true,
        reloadVerified,
        probe,
        errors,
        analyticsPersisted: false,
      });
      console.log(
        `PASS ${scenario}: Filled in 4 guesses; how-to reopened; no errors; reload=${reloadVerified}`,
      );
    } catch (error) {
      await page.screenshot({ path: `${out}/${scenario}-failure.png`, fullPage: true });
      results.push({ scenario, ok: false, errors, failure: String(error) });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  writeFileSync(
    `${out}/results.json`,
    JSON.stringify({ base, puzzleId: puzzle.id, results }, null, 2),
  );
  await browser.close();
}
