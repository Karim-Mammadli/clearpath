import { createHash } from "node:crypto";
import { LLM, REVIEW } from "@/lib/config";
import type { SeverityCode } from "@/lib/domain";
import type { ExtractionMeta } from "@/lib/extract";
import { runDeterministicChecks } from "./deterministic";
import { scanForInjection } from "./injection";
import { runLlmReview, type LlmDeps } from "./llm-review";
import { mergeFindings } from "./merge";
import { getApplicableRules } from "./rules";
import { computeRisk, type ScoreBreakdown } from "./scoring";
import type { CandidateFinding, DiscardedFinding } from "./types";
import { verifyLlmFindings } from "./verify";

/**
 * The review engine: pure orchestration with no database access, so the app pipeline and the
 * eval harness run exactly the same code.
 *
 *   rules → deterministic checks ─┐
 *        → injection scan → LLM → verify ─┴→ merge/dedupe → score (code)
 */

export type EngineRule = {
  code: string;
  title: string;
  citation: string;
  products: string[];
  channels: string[];
  severity: SeverityCode;
  checkType: "DETERMINISTIC" | "LLM" | "BOTH";
  guidance: string;
  violatingExamples: string[];
  compliantExamples: string[];
  affiliateOnly: boolean;
  active: boolean;
};

export type EngineInput = {
  contentText: string;
  extractionMeta?: ExtractionMeta | null;
  product: string;
  channel: string;
  isAffiliate: boolean;
  rules: EngineRule[];
  ruleSetVersion: number;
};

export type EngineResult = {
  status: "COMPLETE" | "PARTIAL";
  mode: "live" | "mock" | "deterministic-only";
  statusNote: string | null;
  findings: CandidateFinding[];
  discarded: DiscardedFinding[];
  summary: string;
  injectionSuspected: boolean;
  risk: ScoreBreakdown;
  model: string | null;
  promptVersion: string;
  ruleSetVersion: number;
  cacheKey: string;
  cacheHit: boolean;
  rawLlmOutput: unknown | null;
  latencyMs: number;
  applicableRuleCodes: string[];
};

export function reviewCacheKey(i: Pick<EngineInput, "contentText" | "product" | "channel" | "isAffiliate" | "ruleSetVersion">, model: string): string {
  return createHash("sha256")
    .update([i.contentText, i.product, i.channel, i.isAffiliate ? "aff" : "1p", i.ruleSetVersion, REVIEW.promptVersion, model].join("|"))
    .digest("hex");
}

function fallbackSummary(findings: CandidateFinding[]): string {
  if (findings.length === 0) return "No issues found by rule-based checks.";
  const codes = [...new Set(findings.map((f) => f.ruleCode))];
  return `Rule-based checks found ${findings.length} issue(s): ${codes.join(", ")}.`;
}

export async function runReviewEngine(input: EngineInput, llm: LlmDeps): Promise<EngineResult> {
  const started = Date.now();
  const ctx = { product: input.product, channel: input.channel, isAffiliate: input.isAffiliate };
  const applicable = getApplicableRules(input.rules, ctx);

  // 1. Deterministic layer (cheap, exact offsets) + injection heuristics.
  const deterministic = runDeterministicChecks(input.contentText, ctx, applicable);
  const scan = scanForInjection(input.contentText, input.extractionMeta ?? undefined);
  const detAll = [...deterministic, ...scan.findings];

  // 2. LLM layer (judgment), then grounding verification.
  const model = llm.mode === "mock" ? "mock" : LLM.model;
  const cacheKey = reviewCacheKey(input, model);
  const outcome = await runLlmReview(
    {
      rules: applicable,
      product: input.product,
      channel: input.channel,
      isAffiliate: input.isAffiliate,
      content: input.contentText,
      alreadyDetected: detAll.map((f) => ({ ruleCode: f.ruleCode, quote: f.quote })),
      cacheKey,
    },
    llm,
  );

  let llmFindings: CandidateFinding[] = [];
  let discarded: DiscardedFinding[] = [];
  let summary: string;
  let llmInjection = false;
  if (outcome.status === "ok") {
    const v = verifyLlmFindings(input.contentText, outcome.review.findings, applicable);
    llmFindings = v.verified;
    discarded = v.discarded;
    summary = outcome.review.summary;
    llmInjection = outcome.review.suspected_prompt_injection;
  } else {
    summary = fallbackSummary(detAll);
  }

  // 3. Merge, cross-check, score.
  const findings = mergeFindings(detAll, llmFindings);
  const injectionSuspected = scan.suspected || llmInjection;
  if (outcome.status === "ok" && scan.suspected && outcome.review.findings.length === 0 && deterministic.length > 0) {
    summary = `Possible manipulation: injection heuristics fired and the AI returned zero findings although rule-based checks found ${deterministic.length}. ${summary}`;
  }
  const risk = computeRisk(findings, injectionSuspected);

  return {
    status: outcome.status === "ok" ? "COMPLETE" : "PARTIAL",
    mode: outcome.status !== "ok" ? "deterministic-only" : outcome.model === "mock" ? "mock" : "live",
    statusNote: outcome.status === "ok" ? null : outcome.reason,
    findings,
    discarded,
    summary,
    injectionSuspected,
    risk,
    model: outcome.status === "ok" ? outcome.model : null,
    promptVersion: REVIEW.promptVersion,
    ruleSetVersion: input.ruleSetVersion,
    cacheKey,
    cacheHit: outcome.status === "ok" && outcome.cacheHit,
    rawLlmOutput: outcome.status === "ok" ? outcome.raw : null,
    latencyMs: Date.now() - started,
    applicableRuleCodes: applicable.map((r) => r.code),
  };
}
