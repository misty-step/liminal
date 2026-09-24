import { MAX_ANSWER_LENGTH } from "./types";

/**
 * A puzzle id's shape. Puzzles also come from the runtime schedule, so request
 * parsing checks shape only; routes resolve the id and refuse unknown ones.
 */
const PUZZLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RuntimeEnvironment = "production" | "staging" | "test";
export type ProductEventName =
  | "session_start"
  | "puzzle_open"
  | "guess_judged"
  | "guess_refused"
  | "puzzle_complete"
  | "report_submitted";

type Scalar = string | number | boolean;
type EventProps = Record<string, Scalar>;

export interface ProductEventInput {
  eventId: string;
  eventName: ProductEventName;
  sessionId: string;
  props: EventProps;
}

export interface ProductEvent {
  event_id: string;
  event_name: ProductEventName;
  game: "liminal";
  environment: RuntimeEnvironment;
  occurred_at: string;
  session_id: string;
  actor_id: null;
  schema_version: 1;
  props: EventProps;
}

export class RuntimeEnvironmentError extends Error {
  constructor() {
    super("LIMINAL_ENVIRONMENT is invalid");
    this.name = "RuntimeEnvironmentError";
  }
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: "bad-request" };
type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "bad-request" | "payload-too-large" };

const badRequest = { ok: false, reason: "bad-request" } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) return null;
  return trimmed;
}

export async function readJsonPayload(request: Request, maxBytes: number): Promise<BodyResult> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" || !request.body || maxBytes < 1) return badRequest;

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) return badRequest;
    if (parsedLength > maxBytes) return { ok: false, reason: "payload-too-large" };
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "payload-too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return badRequest;
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) };
  } catch {
    return badRequest;
  }
}

export function clientKey(request: Request): string {
  const candidate =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return candidate && /^[0-9a-f:.]{2,64}$/i.test(candidate) ? candidate : "unknown";
}

export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }): {
  isLimited(key: string, now: number): boolean;
} {
  const { limit, windowMs, maxKeys = 10_000 } = options;
  if (limit < 1 || windowMs < 1 || maxKeys < 1) throw new Error("invalid rate-limit options");
  const buckets = new Map<string, { count: number; startedAt: number }>();

  return {
    isLimited(key, now) {
      const current = buckets.get(key);
      if (current && now - current.startedAt < windowMs) {
        if (current.count >= limit) return true;
        current.count += 1;
        return false;
      }
      if (current) buckets.delete(key);

      if (buckets.size >= maxKeys) {
        for (const [candidate, bucket] of buckets) {
          if (now - bucket.startedAt >= windowMs) buckets.delete(candidate);
        }
        if (buckets.size >= maxKeys) return true;
      }
      buckets.set(key, { count: 1, startedAt: now });
      return false;
    },
  };
}

export function parseJudgePayload(
  input: unknown,
): ParseResult<{ puzzleId: string; answer: string }> {
  if (!isRecord(input) || !hasOnlyKeys(input, ["puzzleId", "answer"])) return badRequest;
  const puzzleId = boundedText(input.puzzleId, 64);
  const answer = boundedText(input.answer, MAX_ANSWER_LENGTH);
  if (!puzzleId || !answer || !isPuzzleId(puzzleId)) return badRequest;
  return { ok: true, value: { puzzleId, answer } };
}

export function parseReportPayload(
  input: unknown,
): ParseResult<{ puzzleId: string; answer: string; note: string }> {
  if (!isRecord(input) || !hasOnlyKeys(input, ["puzzleId", "answer", "note"])) {
    return badRequest;
  }
  const puzzleId = boundedText(input.puzzleId, 64);
  const answer = boundedText(input.answer, MAX_ANSWER_LENGTH);
  const note = boundedText(input.note, 500, true);
  if (!puzzleId || !answer || note === null || !isPuzzleId(puzzleId)) return badRequest;
  return { ok: true, value: { puzzleId, answer, note } };
}

const eventNames = new Set<ProductEventName>([
  "session_start",
  "puzzle_open",
  "guess_judged",
  "guess_refused",
  "puzzle_complete",
  "report_submitted",
]);
const modes = new Set(["today", "practice"]);
// There is no guess limit; this only bounds what an event may claim.
const MAX_REPORTED_GUESSES = 1000;
const results = new Set(["inside", "close", "outside"]);
const sources = new Set(["authored", "live"]);
const refusalReasons = new Set(["outage", "ratelimit", "calibration", "rejection"]);

function isPuzzleId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && PUZZLE_ID.test(value);
}

function propsMatch(
  eventName: ProductEventName,
  props: Record<string, unknown>,
): props is EventProps {
  switch (eventName) {
    case "session_start":
      return (
        hasOnlyKeys(props, ["mode", "new_visitor"]) &&
        typeof props.mode === "string" &&
        modes.has(props.mode) &&
        typeof props.new_visitor === "boolean"
      );
    case "puzzle_open":
      return (
        hasOnlyKeys(props, ["puzzle_id", "mode"]) &&
        isPuzzleId(props.puzzle_id) &&
        typeof props.mode === "string" &&
        modes.has(props.mode)
      );
    case "guess_judged":
      return (
        hasOnlyKeys(props, ["puzzle_id", "result", "source"]) &&
        isPuzzleId(props.puzzle_id) &&
        typeof props.result === "string" &&
        results.has(props.result) &&
        typeof props.source === "string" &&
        sources.has(props.source)
      );
    case "guess_refused":
      return (
        hasOnlyKeys(props, ["puzzle_id", "reason"]) &&
        isPuzzleId(props.puzzle_id) &&
        typeof props.reason === "string" &&
        refusalReasons.has(props.reason)
      );
    case "puzzle_complete":
      return (
        hasOnlyKeys(props, ["puzzle_id", "solved", "guesses_used"]) &&
        isPuzzleId(props.puzzle_id) &&
        typeof props.solved === "boolean" &&
        Number.isInteger(props.guesses_used) &&
        typeof props.guesses_used === "number" &&
        props.guesses_used >= 1 &&
        props.guesses_used <= MAX_REPORTED_GUESSES
      );
    case "report_submitted":
      return hasOnlyKeys(props, ["puzzle_id"]) && isPuzzleId(props.puzzle_id);
  }
}

export function parseProductEventPayload(input: unknown): ParseResult<ProductEventInput> {
  if (!isRecord(input) || !hasOnlyKeys(input, ["eventId", "eventName", "sessionId", "props"])) {
    return badRequest;
  }
  if (
    typeof input.eventId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.eventId,
    )
  ) {
    return badRequest;
  }
  if (typeof input.eventName !== "string" || !eventNames.has(input.eventName as ProductEventName)) {
    return badRequest;
  }
  if (typeof input.sessionId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(input.sessionId)) {
    return badRequest;
  }
  if (!isRecord(input.props)) return badRequest;
  const eventName = input.eventName as ProductEventName;
  if (!propsMatch(eventName, input.props)) return badRequest;
  return {
    ok: true,
    value: { eventId: input.eventId, eventName, sessionId: input.sessionId, props: input.props },
  };
}

export function createProductEvent(
  input: ProductEventInput,
  options: { environment: RuntimeEnvironment; occurredAt: string },
): ProductEvent {
  return {
    event_id: input.eventId,
    event_name: input.eventName,
    game: "liminal",
    environment: options.environment,
    occurred_at: options.occurredAt,
    session_id: input.sessionId,
    actor_id: null,
    schema_version: 1,
    props: input.props,
  };
}

export function runtimeEnvironment(value: string | undefined): RuntimeEnvironment | null {
  if (value === undefined || value === "" || value === "development") return null;
  if (value === "production" || value === "staging" || value === "test") return value;
  throw new RuntimeEnvironmentError();
}
