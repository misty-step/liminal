import { afterEach, describe, expect, it, vi } from "vitest";
import { type ConceptScore, repairConcepts } from "../../../../scripts/generator/funnel";
import { Budget } from "../../../../scripts/generator/openrouter";

const concept = {
  slug: "shell-water-eat",
  mode: "literal" as const,
  theme: "Common things cross boundaries",
  labels: ["Has a shell", "Found in water", "Eaten by people"] as [string, string, string],
  details: ["", "", ""] as [string, string, string],
};
const candidate: ConceptScore = {
  concept,
  existence: [0.8, 0.8, 0.8, 0.8],
  findability: [0.5, 0.5, 0.125, 0.5],
  score: 0.125,
  kept: false,
  reason: "ordinary guesses miss a region",
  guesses: [
    {
      target: "c1",
      hits: ["oyster"],
      misses: [{ word: "walnut", landing: '{"c1":"inside","c2":"outside","c3":"inside"}' }],
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());

describe("concept repair", () => {
  it("batches only salvageable findability misses and exposes Jev landings", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].content).toContain("walnut");
      expect(body.messages[1].content).toContain("outside");
      return new Response(
        JSON.stringify({
          usage: { cost: 0.001 },
          choices: [
            {
              message: {
                content: JSON.stringify({
                  concepts: [
                    {
                      ...concept,
                      slug: "shell-water-food",
                      labels: ["Has a shell", "Lives in water", "Eaten by people"],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchImpl);
    const repaired = await repairConcepts({
      apiKey: "fake",
      model: "cheap",
      budget: new Budget(1),
      scores: [
        candidate,
        { ...candidate, score: 0, findability: [0, 0.5, 0.5, 0.5] },
        { ...candidate, reason: "a region has nothing real in it" },
      ],
    });
    expect(repaired.map((item) => item.slug)).toEqual(["shell-water-food"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
