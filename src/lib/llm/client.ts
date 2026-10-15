import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { LLM } from "@/lib/config";

/**
 * The single place the app talks to an LLM provider. Model/provider can change here.
 * - Responses API + strict JSON-schema structured output generated from Zod
 * - no tools: the model can only return text that we then validate and verify
 * - store: false (marketing drafts are not retained by the provider for later retrieval)
 * - usage → cost (reasoning tokens are billed as output tokens and are included in output_tokens)
 */

export type AiMode = "live" | "mock" | "off";

/** live when an API key is configured, otherwise clearly-labeled mock fixtures. AI_MODE=off|mock overrides (ops kill switch). */
export function aiMode(): AiMode {
  const override = process.env.AI_MODE?.toLowerCase();
  if (override === "off" || override === "mock") return override;
  return process.env.OPENAI_API_KEY ? "live" : "mock";
}

export type LlmUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export const ZERO_USAGE: LlmUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

export function computeCostUsd(u: LlmUsage): number {
  const p = LLM.pricePerMillion;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens);
  return (uncached * p.input + u.cachedInputTokens * p.cachedInput + u.outputTokens * p.output) / 1_000_000;
}

export type LlmPurpose = "REVIEW" | "REPAIR" | "REWRITE" | "EVAL";

export type LlmCallLog = {
  purpose: LlmPurpose;
  model: string;
  promptVersion: string;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  error?: string;
};

export type JsonCallResult =
  | { ok: true; text: string; usage: LlmUsage; latencyMs: number; model: string }
  | { ok: false; error: string; kind: "timeout" | "api" | "incomplete"; usage: LlmUsage; latencyMs: number; model: string };

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    // maxRetries: 1 → one retry with backoff on 429/5xx/connection errors (SDK behavior).
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: LLM.timeoutMs });
  }
  return client;
}

function usageOf(r: { usage?: OpenAI.Responses.ResponseUsage | null }): LlmUsage {
  const u = r.usage;
  if (!u) return ZERO_USAGE;
  return {
    inputTokens: u.input_tokens ?? 0,
    cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** One structured-output call. Returns raw JSON text; the caller validates with Zod (and may repair). */
export async function generateStructured(opts: {
  instructions: string;
  input: string;
  schema: z.ZodType;
  schemaName: string;
  timeoutMs: number;
  promptCacheKey?: string;
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<JsonCallResult> {
  const started = Date.now();
  const model = LLM.model;
  try {
    const res = await getClient().responses.create(
      {
        model,
        instructions: opts.instructions,
        input: opts.input,
        reasoning: { effort: opts.reasoningEffort ?? LLM.reasoningEffort },
        max_output_tokens: LLM.maxOutputTokens,
        text: { format: zodTextFormat(opts.schema, opts.schemaName) },
        store: false,
        prompt_cache_key: opts.promptCacheKey,
      },
      { signal: AbortSignal.timeout(opts.timeoutMs), timeout: opts.timeoutMs },
    );
    const usage = usageOf(res);
    const latencyMs = Date.now() - started;
    if (res.status === "incomplete") {
      return { ok: false, kind: "incomplete", error: `incomplete: ${res.incomplete_details?.reason ?? "unknown"}`, usage, latencyMs, model };
    }
    return { ok: true, text: res.output_text, usage, latencyMs, model };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const name = err instanceof Error ? err.name : "";
    const timeout = name === "TimeoutError" || name === "AbortError" || err instanceof OpenAI.APIConnectionTimeoutError;
    const message = err instanceof OpenAI.APIError ? `${err.status ?? ""} ${err.message}`.trim() : err instanceof Error ? err.message : String(err);
    return { ok: false, kind: timeout ? "timeout" : "api", error: timeout ? `timeout after ${opts.timeoutMs}ms` : message.slice(0, 300), usage: ZERO_USAGE, latencyMs, model };
  }
}
