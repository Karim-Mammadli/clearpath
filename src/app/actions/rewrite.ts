"use server";

import { z } from "zod";
import { canViewSubmission, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SeverityCode } from "@/lib/domain";
import { extractContent } from "@/lib/extract";
import { runReviewEngine } from "@/lib/review/engine";
import { dbLlmDeps, loadRules } from "@/lib/review/pipeline";
import { generateRewrite } from "@/lib/review/rewrite";
import { getApplicableRules } from "@/lib/review/rules";
import { editableText } from "@/lib/versions";

export type RewriteResult =
  | {
      ok: true;
      rewritten: string;
      changes: { rule_code: string; what_changed: string }[];
      notes: string;
      check: {
        passes: boolean;
        riskScore: number;
        riskLevel: string;
        mode: string;
        findings: { ruleCode: string; severity: SeverityCode; quote: string; explanation: string; missing: boolean }[];
      };
    }
  | { ok: false; error: string };

/**
 * Generates a compliant rewrite of the current version, then re-runs the full review pipeline on it
 * (rule-based + AI + verification) so the user sees whether it actually passes before submitting.
 * Nothing is persisted here: the rewrite only becomes a version if a human submits it.
 */
export async function generateCompliantRewrite(submissionId: string): Promise<RewriteResult> {
  const user = await getCurrentUser();
  const id = z.string().min(1).max(64).parse(submissionId);
  const sub = await db.submission.findUnique({ where: { id }, include: { affiliate: true } });
  if (!sub || !canViewSubmission(user, sub)) return { ok: false, error: "Not found." };
  if (sub.status === "APPROVED" || sub.status === "REJECTED") return { ok: false, error: `This submission is already ${sub.status.toLowerCase()}.` };

  const version = await db.submissionVersion.findFirst({
    where: { submissionId: sub.id, versionNumber: sub.currentVersionNumber },
    include: { findings: { where: { decision: { not: "DISMISSED" } } } },
  });
  if (!version) return { ok: false, error: "No version to rewrite." };

  const content = editableText(version.contentText).trim();
  if (!content) return { ok: false, error: "This version has no editable text (image-only). Edit the image and resubmit instead." };

  const { rules, ruleSetVersion } = await loadRules();
  const ctx = { product: sub.product, channel: sub.channel, isAffiliate: !!sub.affiliateId };
  const applicable = getApplicableRules(rules, ctx);
  const deps = dbLlmDeps(version.id);

  const rw = await generateRewrite(
    {
      content,
      product: sub.product,
      channel: sub.channel,
      affiliateName: sub.affiliate?.name ?? null,
      rules: applicable,
      // Image-text and hidden-content findings can't be fixed by rewriting the copy.
      findings: version.findings.filter((f) => f.startOffset < content.length || f.missing),
    },
    deps,
  );
  if (!rw.ok) return { ok: false, error: rw.reason };

  // Self-verification: the exact same engine that reviews submissions.
  const ex = extractContent(rw.value.rewritten_text);
  const check = await runReviewEngine({ contentText: ex.text, extractionMeta: ex.meta, ...ctx, rules, ruleSetVersion }, deps);

  return {
    ok: true,
    rewritten: rw.value.rewritten_text,
    changes: rw.value.changes,
    notes: rw.value.notes,
    check: {
      passes: check.findings.length === 0,
      riskScore: check.risk.score,
      riskLevel: check.risk.level,
      mode: check.mode,
      findings: check.findings.map((f) => ({ ruleCode: f.ruleCode, severity: f.severity, quote: f.quote, explanation: f.explanation, missing: f.missing })),
    },
  };
}
