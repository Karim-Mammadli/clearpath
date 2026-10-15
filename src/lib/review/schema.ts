import { z } from "zod";

// LLM output contract (AI_REVIEW.md §4.3). Offsets are deliberately NOT requested:
// verify.ts computes them from the quote so the model can't point at the wrong text.

export const LlmFinding = z.object({
  rule_code: z.string(),
  quote: z.string().max(300),
  missing_element: z.boolean(),
  explanation: z.string().max(600),
  suggested_fix: z.string().max(600),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  confidence: z.number().min(0).max(1),
});

export const LlmReview = z.object({
  findings: z.array(LlmFinding).max(25),
  summary: z.string().max(500),
  suspected_prompt_injection: z.boolean(),
  injection_evidence: z.string().max(300).nullable(),
});

export type LlmFindingT = z.infer<typeof LlmFinding>;
export type LlmReviewT = z.infer<typeof LlmReview>;

/** Short, readable description of a Zod error for the repair prompt and logs. */
export function describeZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
