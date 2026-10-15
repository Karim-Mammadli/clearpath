import { describe, expect, it } from "vitest";
import { locateQuote, resolveSeverity, verifyLlmFindings } from "@/lib/review/verify";
import type { LlmFindingT } from "@/lib/review/schema";

const rules = [
  { code: "UDAAP-GUARANTEE", severity: "CRITICAL" as const },
  { code: "UDAAP-SUBSTANTIATION", severity: "MEDIUM" as const },
];
const f = (over: Partial<LlmFindingT>): LlmFindingT => ({
  rule_code: "UDAAP-GUARANTEE",
  quote: "approval is guaranteed",
  missing_element: false,
  explanation: "x",
  suggested_fix: "y",
  severity: "CRITICAL",
  confidence: 0.9,
  ...over,
});

const text = "Need cash?  Approval   is guaranteed — no credit check!\nApproval is guaranteed.";

describe("locateQuote", () => {
  it("exact match", () => {
    const loc = locateQuote(text, "no credit check");
    expect(loc).toMatchObject({ exact: true });
    expect(text.slice(loc!.start, loc!.end)).toBe("no credit check");
  });

  it("whitespace- and case-normalized match maps back to original offsets", () => {
    const loc = locateQuote(text, "approval is GUARANTEED — no credit");
    expect(loc?.exact).toBe(false);
    expect(text.slice(loc!.start, loc!.end)).toBe("Approval   is guaranteed — no credit");
  });

  it("folds typographic quotes and dashes", () => {
    const t = "You’re approved – today";
    const loc = locateQuote(t, "You're approved - today");
    expect(t.slice(loc!.start, loc!.end)).toBe(t);
  });

  it("returns null when the quote is not in the text", () => {
    expect(locateQuote(text, "Lowest rates in America")).toBeNull();
  });

  it("multiple occurrences: picks the first one not overlapping an existing span", () => {
    const first = locateQuote(text, "Approval is guaranteed")!;
    expect(first.start).toBe(text.lastIndexOf("Approval is guaranteed")); // exact match beats normalized
    const again = locateQuote("aa X aa X", "X", [{ start: 3, end: 4 }]);
    expect(again?.start).toBe(8);
  });
});

describe("verifyLlmFindings", () => {
  it("keeps grounded findings with server-computed offsets", () => {
    const { verified, discarded } = verifyLlmFindings(text, [f({ quote: "no credit check" })], rules);
    expect(discarded).toEqual([]);
    expect(verified[0]).toMatchObject({ ruleCode: "UDAAP-GUARANTEE", source: "LLM", quote: "no credit check" });
    expect(text.slice(verified[0].startOffset, verified[0].endOffset)).toBe("no credit check");
  });

  it("discards findings for rules that are not applicable / don't exist", () => {
    const { verified, discarded } = verifyLlmFindings(text, [f({ rule_code: "MADE-UP-RULE" })], rules);
    expect(verified).toEqual([]);
    expect(discarded).toEqual([{ ruleCode: "MADE-UP-RULE", quote: "approval is guaranteed", reason: "unknown_rule" }]);
  });

  it("discards hallucinated quotes", () => {
    const { verified, discarded } = verifyLlmFindings(text, [f({ quote: "Lowest rates in America" })], rules);
    expect(verified).toEqual([]);
    expect(discarded[0].reason).toBe("quote_not_found");
  });

  it("two findings of the same rule with the same quote land on different occurrences", () => {
    const { verified } = verifyLlmFindings(text, [f({ quote: "Approval is guaranteed" }), f({ quote: "approval is guaranteed" })], rules);
    expect(verified).toHaveLength(2);
    expect(verified[0].startOffset).not.toBe(verified[1].startOffset);
  });
});

describe("resolveSeverity", () => {
  it("the model cannot escalate beyond the rule", () => {
    expect(resolveSeverity("MEDIUM", "CRITICAL", 0.99)).toBe("MEDIUM");
  });
  it("the model can lower severity only when unsure", () => {
    expect(resolveSeverity("HIGH", "LOW", 0.3)).toBe("LOW");
    expect(resolveSeverity("HIGH", "LOW", 0.8)).toBe("HIGH");
  });
});
