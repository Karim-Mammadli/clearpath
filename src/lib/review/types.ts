import type { SeverityCode } from "@/lib/domain";

/** A finding produced by the engine before it is persisted. Offsets index into contentText. */
export type CandidateFinding = {
  ruleCode: string;
  source: "DETERMINISTIC" | "LLM";
  severity: SeverityCode;
  quote: string;
  startOffset: number;
  endOffset: number;
  /** "Required element missing" findings: the span is an anchor, not offending text. */
  missing: boolean;
  explanation: string;
  suggestedFix: string | null;
  confidence: number | null;
};

export type Span = { start: number; end: number; text: string };

export type DiscardedFinding = {
  ruleCode: string;
  quote: string;
  reason: "unknown_rule" | "quote_not_found" | "quote_too_short";
};
