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
  // Brand assets: src/app/icon.svg, favicon.ico, apple-icon.png (Next.js file conventions),
  // public/icon-192.png + icon-512.png (web manifest), sidebar mark in src/components/brand-mark.tsx.
  disclaimer:
    "Demo application. Rules are simplified summaries for demonstration and are not legal advice.",
};

