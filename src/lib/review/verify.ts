import { SEVERITY_RANK, type SeverityCode } from "@/lib/domain";
import type { CandidateFinding, DiscardedFinding } from "./types";
import type { LlmFindingT } from "./schema";

/**
 * Grounding verification (AI_REVIEW.md §6). The LLM proposes; this code decides what is shown.
 * - rule_code must be in the applicable rule set
 * - quote must exist in the content (exact, then whitespace/case-normalized)
 * - offsets are computed here, never taken from the model
 * - the model can lower severity only when unsure, never escalate beyond the rule
 */

type RuleLike = { code: string; severity: SeverityCode };

const FOLD: Record<string, string> = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-" };

function foldChar(c: string): string {
  return (FOLD[c] ?? c).toLowerCase();
}

/** Normalized text (collapsed whitespace, folded case/quotes/dashes) + map back to original offsets. */
export function normalizeWithMap(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (!inSpace && norm.length > 0) {
        norm += " ";
        map.push(i);
      }
      inSpace = true;
      continue;
    }
    inSpace = false;
    norm += foldChar(c);
    map.push(i);
  }
  return { norm, map };
}

function normalizeQuote(q: string): string {
  return normalizeWithMap(q).norm.trim();
}

/** Locates `quote` in `text`, skipping occurrences that overlap `avoid` spans. */
export function locateQuote(
  text: string,
  quote: string,
  avoid: { start: number; end: number }[] = [],
): { start: number; end: number; exact: boolean } | null {
  const overlaps = (s: number, e: number) => avoid.some((a) => s < a.end && a.start < e);
  const q = quote.trim();
  if (!q) return null;

  const exact: { start: number; end: number }[] = [];
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) exact.push({ start: i, end: i + q.length });
  if (exact.length) {
    const pick = exact.find((s) => !overlaps(s.start, s.end)) ?? exact[0];
    return { ...pick, exact: true };
  }

  const { norm, map } = normalizeWithMap(text);
  const nq = normalizeQuote(q);
  if (!nq) return null;
  const found: { start: number; end: number }[] = [];
  for (let i = norm.indexOf(nq); i >= 0; i = norm.indexOf(nq, i + 1)) {
    found.push({ start: map[i], end: map[i + nq.length - 1] + 1 });
  }
  if (!found.length) return null;
  const pick = found.find((s) => !overlaps(s.start, s.end)) ?? found[0];
  return { ...pick, exact: false };
}

export function resolveSeverity(ruleSeverity: SeverityCode, modelSeverity: SeverityCode, confidence: number): SeverityCode {
  if (SEVERITY_RANK[modelSeverity] < SEVERITY_RANK[ruleSeverity] && confidence < 0.5) return modelSeverity;
  return ruleSeverity;
}

export function verifyLlmFindings(
  text: string,
  findings: LlmFindingT[],
  applicableRules: RuleLike[],
): { verified: CandidateFinding[]; discarded: DiscardedFinding[] } {
  const rules = new Map(applicableRules.map((r) => [r.code, r]));
  const verified: CandidateFinding[] = [];
  const discarded: DiscardedFinding[] = [];

  for (const f of findings) {
    const rule = rules.get(f.rule_code);
    if (!rule) {
      discarded.push({ ruleCode: f.rule_code, quote: f.quote, reason: "unknown_rule" });
      continue;
    }
    if (f.quote.trim().length < 3) {
      discarded.push({ ruleCode: f.rule_code, quote: f.quote, reason: "quote_too_short" });
      continue;
    }
    const sameRule = verified.filter((v) => v.ruleCode === f.rule_code).map((v) => ({ start: v.startOffset, end: v.endOffset }));
    const loc = locateQuote(text, f.quote, sameRule);
    if (!loc) {
      discarded.push({ ruleCode: f.rule_code, quote: f.quote, reason: "quote_not_found" });
      continue;
    }
    verified.push({
      ruleCode: f.rule_code,
      source: "LLM",
      severity: resolveSeverity(rule.severity, f.severity, f.confidence),
      quote: text.slice(loc.start, loc.end),
      startOffset: loc.start,
      endOffset: loc.end,
      missing: f.missing_element,
      explanation: f.explanation,
      suggestedFix: f.suggested_fix || null,
      confidence: f.confidence,
    });
  }
  return { verified, discarded };
}
