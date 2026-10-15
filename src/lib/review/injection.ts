import { HIDDEN_MARKER } from "@/lib/extract";
import { findAll } from "./text";
import type { CandidateFinding } from "./types";

/**
 * Heuristic prompt-injection / hidden-content scan (layer 1 of the defense in AI_REVIEW.md §5).
 * Runs on the extracted text, which includes the labeled hidden-content section.
 * High precision by design: phrases a legitimate marketing asset has no reason to contain.
 */
export const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bignore\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding)?\s*(?:instructions|rules|guidelines|prompts?)\b/i, label: "instruction override" },
  { re: /\bdisregard\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above)?\s*(?:instructions|rules|guidelines)\b/i, label: "instruction override" },
  { re: /\byou\s+are\s+(?:now\s+)?(?:an?|the)\s+(?:ai|assistant|reviewer|language model|llm|compliance (?:bot|ai))\b/i, label: "role reassignment" },
  { re: /\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+|any\s+)?(?:ai|llm|gpt|chatgpt|reviewers?|ai\s+(?:compliance\s+)?reviewers?|compliance\s+(?:bot|ai|reviewers?))\b/i, label: "message addressed to the AI/reviewer" },
  { re: /\breturn\s+(?:no|zero|an?\s+empty(?:\s+list\s+of)?|0)\s+(?:findings|issues|violations|results)\b/i, label: "requests empty output" },
  { re: /\bmark\s+(?:this|it|the\s+\w+)?\s*(?:content\s+|page\s+)?as\s+(?:compliant|approved|safe|clean)\b/i, label: "requests approval" },
  { re: /\bpre-?(?:cleared|approved|reviewed)\s+by\s+(?:clearpath\s+)?(?:legal|compliance)\b/i, label: "claims prior clearance" },
  { re: /\bsystem\s*prompt\b/i, label: "system prompt reference" },
  { re: /^\s*(?:system|assistant)\s*:/im, label: "fake chat role" },
  { re: /<\/?\s*marketing_content\b/i, label: "delimiter spoofing" },
];

export type InjectionScan = {
  suspected: boolean;
  findings: CandidateFinding[];
  hiddenContent: boolean;
};

export function scanForInjection(text: string, meta?: { hiddenText: string[]; comments: string[]; zeroWidthCount: number }): InjectionScan {
  const findings: CandidateFinding[] = [];

  // Collect pattern hits, then group hits on the same line into one finding (one attempt = one finding).
  const hits = INJECTION_PATTERNS.flatMap(({ re, label }) => findAll(re, text).map((s) => ({ ...s, label }))).sort(
    (a, b) => a.start - b.start,
  );
  const groups: { start: number; end: number; labels: Set<string> }[] = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    if (last && (h.start < last.end || !text.slice(last.end, h.start).includes("\n"))) {
      last.end = Math.max(last.end, h.end);
      last.labels.add(h.label);
    } else {
      groups.push({ start: h.start, end: h.end, labels: new Set([h.label]) });
    }
  }
  for (const g of groups) {
    findings.push({
      ruleCode: "SEC-INJECTION",
      source: "DETERMINISTIC",
      severity: "CRITICAL",
      quote: text.slice(g.start, g.end),
      startOffset: g.start,
      endOffset: g.end,
      missing: false,
      explanation: `Text directed at an AI system or reviewer (${[...g.labels].join(", ")}). Content is untrusted data; this instruction was not followed. Treat as a security incident and verify the submitter.`,
      suggestedFix: "Remove all instructions aimed at reviewers or AI systems.",
      confidence: null,
    });
  }

  const markerIdx = text.indexOf(HIDDEN_MARKER);
  const hiddenContent =
    markerIdx >= 0 || (meta ? meta.hiddenText.length + meta.comments.length + meta.zeroWidthCount > 0 : false);
  if (markerIdx >= 0) {
    const parts: string[] = [];
    if (meta?.hiddenText.length) parts.push(`${meta.hiddenText.length} hidden element(s)`);
    if (meta?.comments.length) parts.push(`${meta.comments.length} HTML comment(s)`);
    if (meta?.zeroWidthCount) parts.push(`${meta.zeroWidthCount} invisible character(s)`);
    findings.push({
      ruleCode: "SEC-INJECTION",
      source: "DETERMINISTIC",
      severity: "CRITICAL",
      quote: HIDDEN_MARKER,
      startOffset: markerIdx,
      endOffset: markerIdx + HIDDEN_MARKER.length,
      missing: false,
      explanation: `Content includes text consumers cannot see${parts.length ? ` (${parts.join(", ")})` : ""}. Hidden text is where injection attempts and deceptive tricks live; it is shown below for the reviewer.`,
      suggestedFix: "Remove hidden text, HTML comments and invisible characters from the asset.",
      confidence: null,
    });
  }

  return { suspected: findings.length > 0, findings, hiddenContent };
}
