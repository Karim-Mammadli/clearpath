import { LLM } from "@/lib/config";
import { generateStructured, computeCostUsd, ZERO_USAGE, type AiMode, type LlmCallLog, type LlmPurpose } from "@/lib/llm/client";
import { mockReviewFor } from "@/lib/llm/mock";
import { buildReviewerPrompt, REVIEWER_PROMPT_VERSION } from "./prompts/reviewer.v1";
import { describeZodError, LlmReview, type LlmReviewT } from "./schema";

export type LlmDeps = {
  mode: AiMode;
  /** Persist an LlmCall row (or collect it, in evals). */
  log: (entry: LlmCallLog) => Promise<void>;
  /** Returns a reason string when live calls are not allowed (spend cap, rate limit). */
  checkBudget: () => Promise<string | null>;
  /** Raw LLM output of an earlier review with the same cache key, if any. */
  getCached?: (cacheKey: string) => Promise<unknown | null>;
  purpose?: LlmPurpose;
  timeoutMs?: number;
};

export type LlmReviewOutcome =
  | { status: "ok"; review: LlmReviewT; raw: unknown; model: string; cacheHit: boolean; latencyMs: number }
  | { status: "unavailable"; reason: string; model: string | null; latencyMs: number };

type RuleForPrompt = Parameters<typeof buildReviewerPrompt>[0]["rules"][number];

const REPAIR_INSTRUCTIONS = `You fix JSON so it validates against the provided schema. Keep the meaning of the original. Shorten strings that are too long. Do not add findings. Return JSON only.`;

function parse(text: string): { ok: true; value: LlmReviewT } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  const r = LlmReview.safeParse(json);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: describeZodError(r.error) };
}

export async function runLlmReview(
  input: {
    rules: RuleForPrompt[];
    product: string;
    channel: string;
    isAffiliate: boolean;
    content: string;
    alreadyDetected: { ruleCode: string; quote: string }[];
    cacheKey: string;
  },
  deps: LlmDeps,
): Promise<LlmReviewOutcome> {
  const purpose = deps.purpose ?? "REVIEW";
  if (deps.mode === "off") return { status: "unavailable", reason: "AI review disabled (AI_MODE=off)", model: null, latencyMs: 0 };

  // Cache: identical content + context + rule set + prompt + model → reuse, $0.
  if (deps.getCached) {
    const cached = await deps.getCached(input.cacheKey);
    if (cached) {
      const r = LlmReview.safeParse(cached);
      if (r.success) return { status: "ok", review: r.data, raw: cached, model: deps.mode === "mock" ? "mock" : LLM.model, cacheHit: true, latencyMs: 0 };
    }
  }

  if (deps.mode === "mock") {
    const review = mockReviewFor(input.content);
    await deps.log({ purpose, model: "mock", promptVersion: REVIEWER_PROMPT_VERSION, usage: ZERO_USAGE, costUsd: 0, latencyMs: 0, success: true });
    return { status: "ok", review, raw: review, model: "mock", cacheHit: false, latencyMs: 0 };
  }

  const blocked = await deps.checkBudget();
  if (blocked) return { status: "unavailable", reason: blocked, model: LLM.model, latencyMs: 0 };

  const started = Date.now();
  const deadline = started + (deps.timeoutMs ?? LLM.timeoutMs);
  const prompt = buildReviewerPrompt(input);
  const first = await generateStructured({
    instructions: prompt.instructions,
    input: prompt.input,
    schema: LlmReview,
    schemaName: "compliance_review",
    timeoutMs: deadline - Date.now(),
    promptCacheKey: `${REVIEWER_PROMPT_VERSION}:${input.product}:${input.channel}`,
  });
  await deps.log({
    purpose,
    model: first.model,
    promptVersion: REVIEWER_PROMPT_VERSION,
    usage: first.usage,
    costUsd: computeCostUsd(first.usage),
    latencyMs: first.latencyMs,
    success: first.ok,
    error: first.ok ? undefined : first.error,
  });
  if (!first.ok) return { status: "unavailable", reason: `LLM call failed (${first.error})`, model: first.model, latencyMs: Date.now() - started };

  const parsed = parse(first.text);
  if (parsed.ok) return { status: "ok", review: parsed.value, raw: parsed.value, model: first.model, cacheHit: false, latencyMs: Date.now() - started };

  // One repair attempt: send only the invalid output + validation error (no content), low effort.
  const remaining = deadline - Date.now();
  if (remaining < 5_000) return { status: "unavailable", reason: `Invalid model output (${parsed.error}); no time left to repair`, model: first.model, latencyMs: Date.now() - started };
  const repair = await generateStructured({
    instructions: REPAIR_INSTRUCTIONS,
    input: `Validation error: ${parsed.error}\n\nInvalid output:\n${first.text.slice(0, 20_000)}`,
    schema: LlmReview,
    schemaName: "compliance_review",
    timeoutMs: remaining,
    reasoningEffort: "low",
  });
  const repaired = repair.ok ? parse(repair.text) : null;
  await deps.log({
    purpose: "REPAIR",
    model: repair.model,
    promptVersion: REVIEWER_PROMPT_VERSION,
    usage: repair.usage,
    costUsd: computeCostUsd(repair.usage),
    latencyMs: repair.latencyMs,
    success: !!repaired?.ok,
    error: !repair.ok ? repair.error : repaired && !repaired.ok ? repaired.error : undefined,
  });
  if (repaired?.ok) return { status: "ok", review: repaired.value, raw: repaired.value, model: first.model, cacheHit: false, latencyMs: Date.now() - started };
  return { status: "unavailable", reason: `Model output failed schema validation after one repair (${parsed.error})`, model: first.model, latencyMs: Date.now() - started };
}
