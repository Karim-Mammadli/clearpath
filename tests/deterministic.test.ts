import { describe, expect, it } from "vitest";
import { extractContent } from "@/lib/extract";
import { runDeterministicChecks } from "@/lib/review/deterministic";
import { getApplicableRules } from "@/lib/review/rules";
import { RULE_CATALOG } from "@/lib/rules/catalog";
import { getSample } from "@/lib/samples";

function check(text: string, product: string, channel: string, isAffiliate = false) {
  const ctx = { product, channel, isAffiliate };
  return runDeterministicChecks(text, ctx, getApplicableRules(RULE_CATALOG, ctx));
}
const codes = (fs: { ruleCode: string }[]) => [...new Set(fs.map((f) => f.ruleCode))].sort();

describe("deterministic checks", () => {
  it("S1 email: trigger terms, guarantee, CAN-SPAM, disclaimer — with exact offsets", () => {
    const text = extractContent(getSample("S1").content).text;
    const f = check(text, "PERSONAL_LOAN", "EMAIL");
    expect(codes(f)).toEqual(["CANSPAM-EMAIL", "INTERNAL-REQUIRED-DISCLAIMER", "REGZ-CE-TRIGGER", "UDAAP-GUARANTEE"]);
    for (const x of f) expect(text.slice(x.startOffset, x.endOffset)).toBe(x.quote);
    const trigger = f.find((x) => x.ruleCode === "REGZ-CE-TRIGGER")!;
    expect(trigger.quote).toBe("$199/month");
    expect(f.filter((x) => x.ruleCode === "CANSPAM-EMAIL")).toHaveLength(2); // unsubscribe + address
  });

  it("clean samples produce no rule-based findings", () => {
    for (const id of ["S2", "S4", "S11", "S12", "S13a"]) {
      const s = getSample(id);
      const f = check(extractContent(s.content).text, s.product, s.channel, s.source === "AFFILIATE");
      expect(f, id).toEqual([]);
    }
  });

  it("trigger terms with an APR present are not flagged", () => {
    expect(check("Only $199/month. 12.99% APR. Loans subject to credit approval.", "PERSONAL_LOAN", "SOCIAL")).toEqual([]);
  });

  it("promo rate: flags missing intro + go-to rate, accepts compliant wording", () => {
    const bad = check("0% APR for 15 months! Credit cards are subject to credit approval.", "CREDIT_CARD", "SOCIAL");
    expect(codes(bad)).toEqual(["REGZ-PROMO-RATE"]);
    expect(bad[0].explanation).toMatch(/intro/);
    const good = check(
      "Intro 0% APR on purchases for 15 months from account opening, then a variable 19.24%–28.24% APR. Credit cards are subject to credit approval.",
      "CREDIT_CARD",
      "SOCIAL",
    );
    expect(good).toEqual([]);
  });

  it("rate without APR", () => {
    const f = check("Lock in a fixed 3.5% rate today. Subject to credit approval.", "PERSONAL_LOAN", "DISPLAY_AD");
    expect(codes(f)).toEqual(["REGZ-RATE-AS-APR"]);
    expect(f[0].quote).toBe("3.5% rate");
  });

  it("SMS: missing STOP and sender id; URL alone is not sender identification", () => {
    const f = check(getSample("S7").content, "PERSONAL_LOAN", "SMS");
    expect(f.filter((x) => x.ruleCode === "TCPA-SMS").map((x) => x.explanation)).toEqual([
      expect.stringMatching(/opt-out/),
      expect.stringMatching(/sender identification/),
    ]);
    expect(codes(f)).toContain("FCRA-PREAPPROVED");
    expect(codes(f)).not.toContain("INTERNAL-REQUIRED-DISCLAIMER"); // not applicable to SMS
  });

  it("email with unsubscribe but no postal address → one CAN-SPAM finding", () => {
    const f = check(getSample("X2").content, "CREDIT_CARD", "EMAIL");
    expect(f).toHaveLength(1);
    expect(f[0].explanation).toMatch(/postal address/);
    expect(f[0].missing).toBe(true);
  });

  it("mortgage: NMLS and Equal Housing are separate findings", () => {
    const both = check("Prequalify today. Subject to credit approval.", "MORTGAGE_PREQUAL", "LANDING_PAGE");
    expect(both.filter((x) => x.ruleCode === "MORT-NMLS-EHL")).toHaveLength(2);
    const one = check(getSample("X6").content, "MORTGAGE_PREQUAL", "DISPLAY_AD");
    expect(one).toHaveLength(1);
    expect(one[0].explanation).toMatch(/Equal Housing/);
  });

  it("affiliate disclosure rule only applies to affiliate content", () => {
    const text = "I got approved instantly! Loans subject to credit approval.";
    expect(codes(check(text, "PERSONAL_LOAN", "SOCIAL", true))).toContain("FTC-ENDORSE");
    expect(codes(check(text, "PERSONAL_LOAN", "SOCIAL", false))).not.toContain("FTC-ENDORSE");
    expect(check("#ad I'm compensated by ClearPath. Loans subject to credit approval.", "PERSONAL_LOAN", "SOCIAL", true)).toEqual([]);
  });
});
