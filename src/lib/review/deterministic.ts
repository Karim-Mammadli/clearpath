import type { SeverityCode } from "@/lib/domain";
import { anchorSpan, findAll, findFirst } from "./text";
import type { CandidateFinding, Span } from "./types";

/**
 * Rule-based detectors (AI_REVIEW.md §3). Each is a pure function over the extracted text.
 * They are deliberately conservative (high precision); the LLM covers nuance.
 * Detectors only run for rules that are applicable to the submission (see rules.ts).
 */

type Ctx = { product: string; channel: string; isAffiliate: boolean };
type RuleLike = { code: string; severity: SeverityCode };
type Detector = (text: string, ctx: Ctx, rule: RuleLike) => CandidateFinding[];

const APR = /\bAPRs?\b|annual percentage rate/i;
const APOS = "['’]";

function hit(rule: RuleLike, span: Span, explanation: string, suggestedFix: string): CandidateFinding {
  return {
    ruleCode: rule.code,
    source: "DETERMINISTIC",
    severity: rule.severity,
    quote: span.text,
    startOffset: span.start,
    endOffset: span.end,
    missing: false,
    explanation,
    suggestedFix,
    confidence: null,
  };
}

function missing(rule: RuleLike, text: string, what: string, suggestedFix: string): CandidateFinding {
  const a = anchorSpan(text);
  return {
    ruleCode: rule.code,
    source: "DETERMINISTIC",
    severity: rule.severity,
    quote: a.text,
    startOffset: a.start,
    endOffset: a.end,
    missing: true,
    explanation: `Required element missing: ${what}.`,
    suggestedFix,
    confidence: null,
  };
}

const CE_TRIGGERS: RegExp[] = [
  /\$\s?\d[\d,]*(?:\.\d{2})?\s*(?:\/|per|a|each)\s*(?:mo|month)\b/i, // $199/month
  /\b\d+\s*(?:easy\s+|low\s+|simple\s+)?(?:monthly\s+)?payments\b/i, // 36 easy payments
  /\b(?:for|over|in)\s+\d+\s*(?:-\s*)?(?:months?|years?)\b/i, // for 60 months
  /\b\d+-(?:month|year)\s+(?:term|loan)\b/i, // 30-year loan
  /\bfinance charge of \$\s?\d[\d,]*/i,
  /\b\d+%\s*down\b/i,
  /\$\s?\d[\d,]*\s*down\b/i,
  /\bno money down\b/i,
];

const detectors: Record<string, Detector> = {
  "REGZ-CE-TRIGGER": (text, _ctx, rule) => {
    if (APR.test(text)) return [];
    const spans = CE_TRIGGERS.flatMap((re) => findAll(re, text)).sort((a, b) => a.start - b.start);
    if (spans.length === 0) return [];
    const terms = [...new Set(spans.map((s) => `"${s.text}"`))].join(", ");
    return [
      hit(
        rule,
        spans[0],
        `States closed-end credit trigger term(s) (${terms}) without disclosing the APR and full repayment terms.`,
        'Add a representative example with the APR, e.g. "Example: a $10,000 loan at [APR]% APR for [N] months has [N] monthly payments of $[amount]."',
      ),
    ];
  },

  "REGZ-RATE-AS-APR": (text, _ctx, rule) => {
    if (APR.test(text)) return [];
    const span = findFirst(
      [
        /\b\d+(?:\.\d+)?%\s*(?:fixed\s+|variable\s+|low\s+)?(?:interest\s+)?(?:rate|interest)\b/i,
        /\b(?:rates?|interest(?:\s+rates?)?)\s+(?:as\s+low\s+as|of|from|at|starting\s+at)\s+\d+(?:\.\d+)?%/i,
      ],
      text,
    );
    if (!span) return [];
    return [
      hit(rule, span, "States a rate of finance charge without stating it as an annual percentage rate (APR).", "State the rate as an APR, e.g. \"[X.XX]% APR\", at least as prominently as any other rate."),
    ];
  },

  "REGZ-PROMO-RATE": (text, _ctx, rule) => {
    const promos = [
      ...findAll(/\b0(?:\.0+)?%\s*(?:intro(?:ductory)?\s+)?APR\b/i, text),
      ...findAll(/\b\d+(?:\.\d+)?%\s*(?:intro(?:ductory)?\s+)?APR\s+(?:on\s+\w+(?:\s+\w+)?\s+)?for\s+\d+\s*months?\b/i, text),
    ].sort((a, b) => a.start - b.start);
    if (promos.length === 0) return [];
    const hasGoTo = /\bthen\s+(?:an?\s+)?(?:variable\s+|standard\s+|ongoing\s+)?(?:APR\s+of\s+)?\d+(?:\.\d+)?%/i.test(text);
    const out: CandidateFinding[] = [];
    const seen = new Set<number>();
    for (const p of promos) {
      if (seen.has(p.start)) continue;
      seen.add(p.start);
      const before = text.slice(Math.max(0, p.start - 30), p.end);
      const hasIntro = /\bintro(?:ductory)?\b/i.test(before);
      if (hasIntro && hasGoTo) continue;
      const gaps = [!hasIntro && '"intro"/"introductory" label next to the rate', !hasGoTo && "the APR that applies after the promotional period"].filter(Boolean);
      out.push(
        hit(
          rule,
          p,
          `Promotional rate is missing ${gaps.join(" and ")}.`,
          'Use: "Intro 0% APR on purchases for [N] months from account opening, then a variable [X.XX]%–[Y.YY]% APR."',
        ),
      );
      break; // one finding per asset; the explanation covers the gap
    }
    return out;
  },

  "UDAAP-GUARANTEE": (text, _ctx, rule) =>
    [
      /\bguaranteed\s+(?:approvals?|loans?|credit)\b/i,
      /\bapproval\s+(?:is\s+)?guaranteed\b/i,
      /\beveryone\s+(?:is\s+|gets\s+)?approved\b/i,
      /\bno\s+credit\s+checks?\b/i,
      /\b100%\s+approval\b/i,
      new RegExp(`\\bcan${APOS}?t\\s+be\\s+denied\\b`, "i"),
      new RegExp(`\\byou${APOS}?re\\s+approved\\b`, "i"),
    ]
      .flatMap((re) => findAll(re, text))
      .map((s) =>
        hit(rule, s, `"${s.text}" claims or implies approval is certain. All ClearPath credit is subject to credit approval.`, 'Replace with "Check your rate in minutes. Loans subject to credit approval."'),
      ),

  "FCRA-PREAPPROVED": (text, _ctx, rule) =>
    findAll(/\bpre-?(?:approved|selected)\b/i, text).map((s) =>
      hit(rule, s, `"${s.text}" implies a prescreened firm offer of credit, which requires FCRA prescreen notices.`, 'Use "See if you prequalify — it\'s not a guarantee of approval."'),
    ),

  "CANSPAM-EMAIL": (text, _ctx, rule) => {
    const out: CandidateFinding[] = [];
    if (!/\bunsubscribe\b|\bopt[- ]?out\b|\bmanage\s+(?:your\s+)?(?:email\s+)?preferences\b/i.test(text))
      out.push(missing(rule, text, "unsubscribe / opt-out mechanism", 'Add "Unsubscribe: clearpath.com/unsubscribe" to the footer.'));
    if (!/\b\d{1,6}\s+[A-Za-z0-9.' ]{2,40}?\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway)\b\.?[^\n]{0,80}?\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(text))
      out.push(missing(rule, text, "valid physical postal address", 'Add "ClearPath Financial, 100 Market St, Suite 400, Charlotte, NC 28202" to the footer.'));
    return out;
  },

  "TCPA-SMS": (text, _ctx, rule) => {
    const out: CandidateFinding[] = [];
    if (!/\b(?:reply|text|send)\s+["'“]?STOP\b|\bSTOP\s+to\s+(?:opt[- ]?out|cancel|unsubscribe|end|quit)\b/i.test(text))
      out.push(missing(rule, text, 'opt-out instructions (e.g. "Reply STOP to opt out")', 'End the message with "Reply STOP to opt out, HELP for help. Msg & data rates may apply."'));
    if (!/clearpath(?!\.com)/i.test(text))
      out.push(missing(rule, text, "sender identification (ClearPath)", 'Start the message with "ClearPath Financial:".'));
    return out;
  },

  "MORT-NMLS-EHL": (text, _ctx, rule) => {
    const out: CandidateFinding[] = [];
    if (!/\bNMLS\s*(?:ID\s*)?#?\s*\d+/i.test(text))
      out.push(missing(rule, text, "NMLS ID", 'Add "ClearPath Financial, NMLS #123456."'));
    if (!/\bequal\s+housing\s+(?:lender|opportunity)\b/i.test(text))
      out.push(missing(rule, text, "Equal Housing Lender statement", 'Add "Equal Housing Lender." (or the Equal Housing logo).'));
    return out;
  },

  "INTERNAL-REQUIRED-DISCLAIMER": (text, _ctx, rule) =>
    /\bsubject\s+to\s+credit\s+approval\b/i.test(text)
      ? []
      : [missing(rule, text, 'standard disclaimer "subject to credit approval"', 'Add "Subject to credit approval." near the offer.')],

  "FTC-ENDORSE": (text, _ctx, rule) =>
    /#ad\b|#sponsored\b|\bpaid\s+partnership\b|\badvertising\s+disclosure\b|\breceives?\s+(?:a\s+)?compensation\b|\b(?:we|i)\s+(?:may\s+)?(?:receive|earn)\s+(?:a\s+)?(?:compensation|commission)\b|\bcompensated\s+by\b|\baffiliate\s+link\b/i.test(text)
      ? []
      : [missing(rule, text, 'clear disclosure of the paid/affiliate relationship (e.g. "#ad")', 'Add "#ad — I\'m compensated by ClearPath Financial." at the start of the content.')],
};

export const DETERMINISTIC_RULE_CODES = Object.keys(detectors);

/** Runs the detectors for the applicable rules that have a rule-based check. */
export function runDeterministicChecks(
  text: string,
  ctx: Ctx,
  applicable: { code: string; severity: SeverityCode; checkType: string }[],
): CandidateFinding[] {
  const out: CandidateFinding[] = [];
  for (const rule of applicable) {
    if (rule.checkType === "LLM") continue;
    const d = detectors[rule.code];
    if (d) out.push(...d(text, ctx, rule));
  }
  return out;
}
