import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { recording } from "../../docs/reducer/recording";

const out = process.env.OUT;
if (!out) throw new Error("OUT must point to an evidence directory outside the checkout");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("request", (request) => {
      if (!request.url().startsWith("file:")) failures.push(request.url());
    });
    await page.goto(pathToFileURL(resolve("docs/reducer/index.html")).href);
    assert.equal(await page.locator("#position").innerText(), `0 / ${recording.events.length}`);
    for (let i = 1; i <= recording.events.length; i++) {
      await page.locator("#next").click();
      const state: unknown = JSON.parse((await page.locator("#after").textContent()) ?? "");
      assert.ok(state && typeof state === "object");
      const guesses: unknown = Reflect.get(state, "guesses");
      assert.ok(Array.isArray(guesses));
      assert.equal(guesses.length, recording.observed[i - 1].guesses);
      assert.match(
        await page.locator("#score").innerText(),
        new RegExp(`${recording.observed[i - 1].filled}/4 regions`),
      );
      assert.ok((await page.locator("#reason").innerText()).length > 20);
    }
    assert.match(await page.locator("#score").innerText(), /^Complete/);
    assert.equal(await page.locator("#next").isDisabled(), true);
    await page.screenshot({ path: `${out}/replay-${width}.png`, fullPage: true });
    await page.locator("#previous").click();
    assert.ok(!(await page.locator("#score").innerText()).startsWith("Complete"));
    await page.locator("#reset").click();
    assert.equal(await page.locator("#previous").isDisabled(), true);
    await page.locator("#step").focus();
    await page.keyboard.press("End");
    assert.match(await page.locator("#score").innerText(), /^Complete/);
    await page.locator("#reset").click();
    await page.locator("#finish").click();
    assert.match(await page.locator("#score").innerText(), /^Complete/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(failures, []);
    console.log(
      `PASS standalone replay at ${width}px: all steps, back, reset, keyboard scrub, finish; no network or page errors`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
