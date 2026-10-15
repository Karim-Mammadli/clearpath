import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { LLM } from "@/lib/config";
import { db } from "@/lib/db";
import type { SeverityCode } from "@/lib/domain";
import type { ExtractionMeta } from "@/lib/extract";
import { aiMode, type LlmCallLog } from "@/lib/llm/client";
import { runReviewEngine, type EngineRule } from "./engine";
import type { LlmDeps } from "./llm-review";
import { computePriority, computeRisk } from "./scoring";

/** DB-side orchestration of a full review of one SubmissionVersion. */

export async function loadRules(): Promise<{ rules: EngineRule[]; ruleSetVersion: number }> {
  const [rules, rsv] = await Promise.all([
    db.rule.findMany({ orderBy: { code: "asc" } }),
    db.ruleSetVersion.findFirst({ orderBy: { version: "desc" } }),
  ]);
  return {
    rules: rules.map((r) => ({ ...r, severity: r.severity as SeverityCode })),
    ruleSetVersion: rsv?.version ?? 1,
  };
}

/** Spend cap + global hourly rate limit for live calls (protects the public demo's API budget). */
export async function checkLlmBudget(): Promise<string | null> {
  const [spent, lastHour] = await Promise.all([
    db.llmCall.aggregate({ _sum: { costUsd: true }, where: { model: { not: "mock" } } }),
    db.llmCall.count({ where: { model: { not: "mock" }, createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  if ((spent._sum.costUsd ?? 0) >= LLM.budgetUsd) return `LLM spend cap reached ($${LLM.budgetUsd.toFixed(2)})`;
  if (lastHour >= LLM.perUserHourlyLimit * 3) return "LLM hourly rate limit reached";
  return null;
}

export function dbLlmDeps(versionId: string | null, overrides: Partial<LlmDeps> = {}): LlmDeps {
  return {
    mode: aiMode(),
    log: async (l: LlmCallLog) => {
      await db.llmCall.create({
        data: {
          purpose: l.purpose,
          model: l.model,
          promptVersion: l.promptVersion,
          inputTokens: l.usage.inputTokens,
          cachedInputTokens: l.usage.cachedInputTokens,
          outputTokens: l.usage.outputTokens,
          reasoningTokens: l.usage.reasoningTokens,
          costUsd: l.costUsd,
          latencyMs: l.latencyMs,
          success: l.success,
          error: l.error,
          submissionVersionId: versionId,
        },
      });
    },
    checkBudget: checkLlmBudget,
    getCached: async (cacheKey) => {
      const hit = await db.aiReview.findFirst({
        where: { cacheKey, status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        select: { rawLlmOutput: true },
      });
      return hit?.rawLlmOutput ?? null;
    },
    ...overrides,
  };
}

export async function reviewVersion(
  versionId: string,
  opts: { actorId?: string | null; deps?: Partial<LlmDeps>; at?: Date } = {},
) {
  const version = await db.submissionVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { submission: true },
  });
  const sub = version.submission;
  const { rules, ruleSetVersion } = await loadRules();

  const result = await runReviewEngine(
    {
      contentText: version.contentText,
      extractionMeta: (version.extractionMeta as ExtractionMeta | null) ?? null,
      product: sub.product,
      channel: sub.channel,
      isAffiliate: !!sub.affiliateId,
      rules,
      ruleSetVersion,
    },
    dbLlmDeps(versionId, opts.deps),
  );

  // Findings dismissed on the previous version with an identical rule + quote stay dismissed (and say so).
  const prevDismissed = await db.finding.findMany({
    where: { version: { submissionId: sub.id, versionNumber: version.versionNumber - 1 }, decision: "DISMISSED" },
    select: { ruleCode: true, quote: true, dismissReason: true, dismissNote: true },
  });

  const at = opts.at ?? new Date();
  const review = await db.aiReview.create({
    data: {
      versionId,
      status: result.status,
      mode: result.mode,
      riskScore: result.risk.score,
      riskLevel: result.risk.level,
      scoreBreakdown: result.risk as unknown as Prisma.InputJsonValue,
      summary: result.summary,
      model: result.model,
      promptVersion: result.promptVersion,
      ruleSetVersion: result.ruleSetVersion,
      cacheKey: result.cacheKey,
      cacheHit: result.cacheHit,
      discardedFindings: result.discarded.length,
      discarded: result.discarded as unknown as Prisma.InputJsonValue,
      injectionSuspected: result.injectionSuspected,
      statusNote: result.statusNote,
      latencyMs: result.latencyMs,
      rawLlmOutput: (result.rawLlmOutput ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: at,
      findings: {
        create: result.findings.map((f) => {
          const prev = prevDismissed.find((p) => p.ruleCode === f.ruleCode && p.quote === f.quote);
          return {
            versionId,
            ruleCode: f.ruleCode,
            source: f.source,
            severity: f.severity,
            quote: f.quote,
            startOffset: f.startOffset,
            endOffset: f.endOffset,
            missing: f.missing,
            explanation: f.explanation,
            suggestedFix: f.suggestedFix,
            confidence: f.confidence,
            createdAt: at,
            ...(prev
              ? { decision: "DISMISSED" as const, previouslyDismissed: true, dismissReason: prev.dismissReason, dismissNote: prev.dismissNote }
              : {}),
          };
        }),
      },
    },
  });

  await writeAudit({
    actorId: opts.actorId ?? null,
    action: "AI_REVIEW_COMPLETED",
    entityType: "SubmissionVersion",
    entityId: versionId,
    metadata: {
      submissionId: sub.id,
      aiReviewId: review.id,
      status: result.status,
      mode: result.mode,
      riskScore: result.risk.score,
      findings: result.findings.length,
      discarded: result.discarded.length,
      injectionSuspected: result.injectionSuspected,
      cacheHit: result.cacheHit,
    },
    createdAt: at,
  });

  await refreshPriority(sub.id, at);
  return { review, result };
}

/** Current risk of a submission = score of its current version's non-dismissed findings. */
export async function currentRisk(submissionId: string) {
  const sub = await db.submission.findUniqueOrThrow({ where: { id: submissionId } });
  const version = await db.submissionVersion.findFirst({
    where: { submissionId, versionNumber: sub.currentVersionNumber },
    include: { findings: true, aiReviews: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const injection = version?.aiReviews[0]?.injectionSuspected ?? false;
  return computeRisk(
    (version?.findings ?? []).map((f) => ({ severity: f.severity as SeverityCode, decision: f.decision })),
    injection,
  );
}

export async function refreshPriority(submissionId: string, now = new Date()) {
  const sub = await db.submission.findUniqueOrThrow({ where: { id: submissionId } });
  const risk = await currentRisk(submissionId);
  const priorityScore = computePriority({
    riskScore: risk.score,
    launchDate: sub.launchDate,
    createdAt: sub.createdAt,
    isAffiliate: !!sub.affiliateId,
    drift: sub.status === "DRIFT_DETECTED",
    now,
  });
  await db.submission.update({ where: { id: submissionId }, data: { priorityScore } });
  return priorityScore;
}
