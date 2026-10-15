import { SEVERITY_RANK } from "@/lib/domain";
import type { CandidateFinding } from "./types";

/**
 * Merge deterministic + verified LLM findings (AI_REVIEW.md §7).
 * Same rule_code and overlapping spans → keep the deterministic one (exact, explainable),
 * attaching the LLM explanation/fix if it is richer. An LLM "missing element" finding for a rule the
 * deterministic layer already flagged is treated as a duplicate regardless of span (its anchor is arbitrary).
 */
export function mergeFindings(deterministic: CandidateFinding[], llm: CandidateFinding[]): CandidateFinding[] {
  const out = deterministic.map((f) => ({ ...f }));
  for (const f of llm) {
    const dup = out.find(
      (d) =>
        d.ruleCode === f.ruleCode &&
        ((d.startOffset < f.endOffset && f.startOffset < d.endOffset) || f.missing),
    );
    if (!dup) {
      out.push(f);
      continue;
    }
    if (dup.source === "DETERMINISTIC") {
      if (f.explanation.length > dup.explanation.length) dup.explanation = f.explanation;
      if (f.suggestedFix && (!dup.suggestedFix || f.suggestedFix.length > dup.suggestedFix.length)) dup.suggestedFix = f.suggestedFix;
      if (dup.confidence === null && f.confidence !== null) dup.confidence = f.confidence;
    }
  }
  return out.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.startOffset - b.startOffset,
  );
}
