// Non-secret application settings live here as code (reviewed, versioned).
// Only secrets (DATABASE_URL*, OPENAI_API_KEY) are environment variables.

export const LLM = {
  model: "gpt-6.1-sol", // supports reasoning effort low|medium|high|xhigh|max (NOT none/minimal)
  reasoningEffort: "medium" as const,
  timeoutMs: 90_000, // stop waiting after 90s, fall back to deterministic-only
  maxOutputTokens: 6_000, // includes reasoning tokens; bounds the cost of a single call
  pricePerMillion: { input: 2.0, cachedInput: 0.1, output: 10.0 }, // USD, for the AI Ops cost display only
  // Hard spend cap across all logged LLM calls. Once reached, reviews run deterministic-only
  // (with a banner) instead of calling the model. Protects the public demo from wallet abuse.
  budgetUsd: 3.0,
  // Max live LLM reviews a single user can trigger per hour (rewrite/re-run included).
  perUserHourlyLimit: 20,
};

export const REVIEW = {
  promptVersion: "reviewer.v1",
  maxContentChars: 20_000,
  fetchTimeoutMs: 10_000,
  fetchMaxBytes: 2 * 1024 * 1024,
};

export const APP = {
  name: "ClearPath Review",
  company: "ClearPath Financial",
  // Custom logo: put a file in /public (e.g. public/logo.svg or logo.png) and set its path here.
  // null → default shield icon. The browser-tab icon is src/app/favicon.ico (replace the file).
  logoSrc: null as string | null,
  disclaimer:
    "Demo application. Rules are simplified summaries for demonstration and are not legal advice.",
};

/**
 * Review routing: new submissions are auto-assigned by the first matching rule; otherwise to the
 * reviewer with the fewest open items (load balancing). Reviewers can reassign at any time.
 * `reviewerId` refers to seeded users (u_sam = Sam Okafor, u_elena = Elena Petrova).
 */
export const ROUTING: { label: string; when: { product?: string; channel?: string; affiliate?: boolean }; reviewerId: string }[] = [
  { label: "Affiliate content → Elena Petrova (affiliate program specialist)", when: { affiliate: true }, reviewerId: "u_elena" },
  { label: "Mortgage prequal → Elena Petrova (mortgage licensing)", when: { product: "MORTGAGE_PREQUAL" }, reviewerId: "u_elena" },
  { label: "SMS → Sam Okafor (TCPA)", when: { channel: "SMS" }, reviewerId: "u_sam" },
];
