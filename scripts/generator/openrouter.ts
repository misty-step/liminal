/**
 * OpenRouter chat completions with structured JSON output and a hard spend
 * cap. Used by the proposer (drafting puzzles) and the natural-guess player.
 * The judge (Jev) is called separately through src/lib/liminal/typeSafe.ts.
 */

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export class BudgetExceeded extends Error {}

/** OpenRouter refused for credits or key limits: stop the run, keep what is done. */
export class ProviderLimit extends Error {}

/** Tracks spend reported by OpenRouter and refuses calls past the cap. */
export class Budget {
  spent = 0;
  calls = 0;
  constructor(readonly capUsd: number) {}

  assertRoom(): void {
    if (this.spent >= this.capUsd) {
      throw new BudgetExceeded(
        `spend cap reached: $${this.spent.toFixed(4)} of $${this.capUsd.toFixed(2)}`,
      );
    }
  }
}

export interface ChatOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  budget: Budget;
  temperature?: number;
  maxTokens?: number;
  /**
   * Hidden reasoning is most of the cost on thinking models (6.6k of 8k output
   * tokens per Opus draft). Jev filters drafts, so drafting rarely needs it.
   */
  reasoning?: "none" | "low" | "medium" | "high";
}

/** Pull the JSON object out of a reply that may carry fences or prose around it. */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("reply contains no JSON object");
  return JSON.parse(stripped.slice(start, end + 1));
}

/**
 * One structured completion. Open-weight models sometimes return an empty
 * message (all tokens spent reasoning), prose around the JSON, or truncated
 * JSON; each of those is retried once with more room before giving up.
 */
export async function chatJson(options: ChatOptions): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return extractJson(await chatOnce(options, attempt === 1 ? 1 : 2));
    } catch (error) {
      if (error instanceof BudgetExceeded || error instanceof ProviderLimit) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function chatOnce(options: ChatOptions, room: number): Promise<string> {
  options.budget.assertRoom();
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
      "x-title": "Liminal puzzle generator",
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature ?? 0.9,
      // Bound each response so one call can never ask for the provider default
      // (tens of thousands of tokens) against a key's spend limit.
      max_tokens: (options.maxTokens ?? 12_000) * room,
      reasoning:
        (options.reasoning ?? "none") === "none"
          ? { enabled: false }
          : { effort: options.reasoning },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: options.schemaName, strict: true, schema: options.schema },
      },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (response.status === 402 || response.status === 429) {
    throw new ProviderLimit(`OpenRouter ${response.status}: ${raw.slice(0, 200)}`);
  }
  if (!response.ok || !body || typeof body !== "object") {
    throw new Error(`OpenRouter ${response.status}: ${raw.slice(0, 300)}`);
  }
  options.budget.calls += 1;
  const usage = Reflect.get(body, "usage");
  const cost = usage && typeof usage === "object" ? Reflect.get(usage, "cost") : undefined;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
    throw new BudgetExceeded(
      "OpenRouter did not report a valid cost; cannot enforce the spend cap",
    );
  options.budget.spent += cost;

  const choices = Reflect.get(body, "choices");
  const message = Array.isArray(choices) ? Reflect.get(choices[0] ?? {}, "message") : undefined;
  const content =
    message && typeof message === "object" ? Reflect.get(message, "content") : undefined;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned no message content");
  }
  return content;
}
