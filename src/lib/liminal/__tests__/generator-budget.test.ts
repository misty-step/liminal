import { afterEach, describe, expect, it, vi } from "vitest";
import { Budget, BudgetExceeded, chatJson } from "../../../../scripts/generator/openrouter";

const reply = (usage: unknown) =>
  new Response(JSON.stringify({ usage, choices: [{ message: { content: '{"ok": true}' } }] }), {
    status: 200,
  });

const call = (budget: Budget) =>
  chatJson({
    apiKey: "generator",
    model: "cheap",
    system: "s",
    user: "u",
    schemaName: "ok",
    schema: {},
    budget,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

// The nightly run is bounded by provider-reported spend, never by trust.
describe("generator spend cap (US-008)", () => {
  it("meters reported cost and refuses further calls once the cap is reached", async () => {
    const fetchMock = vi.fn(async () => reply({ cost: 0.6 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = new Budget(1);
    await call(budget);
    await call(budget);
    expect(budget.spent).toBeCloseTo(1.2);
    await expect(call(budget)).rejects.toBeInstanceOf(BudgetExceeded);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops the run when the provider reports no cost, instead of spending unmetered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(undefined)),
    );
    await expect(call(new Budget(1))).rejects.toBeInstanceOf(BudgetExceeded);
  });
});
