# ClearPath Review: Overview

**Live:** https://clearpath-sup22.vercel.app (no login; pick a role) · **Demo script + setup:** [README](README.md)

## In one minute

- **Problem:** compliance reviews all of ClearPath's marketing through Excel + email: no queue, lost versions, no audit trail, and no visibility when affiliates change pages after approval. Growth is bottlenecked on review.
- **Product:** "pull requests for marketing content" with an AI pre-reviewer. Submitters get cited findings in seconds and fix them before review. Reviewers work a prioritized queue with issues already highlighted. **The AI never approves; a human always decides.**
- **Principle:** the AI proposes, code verifies, humans decide. Each finding must cite an applicable rule and quote text that really exists, or it's discarded. Submitted content is treated as untrusted input.

## What it does

- **Submit** text, HTML, a URL, or an image (paste/drag; the AI reads text in images). Channel decides which of the 18 rules apply.
- **Review page:**
  - highlighted findings with citation and fix
  - reviewers mark each finding **Confirm issue** or **Not an issue** (reason required) and can add their own by selecting text; this records judgment and never edits the ad
  - risk score with a "why" breakdown
  - comments, version diffs
- **Decisions:** approval is blocked by open CRITICAL findings unless overridden with an audited reason.
- **After a decision:**
  - **Changes requested / rejected:** the submitter gets a feedback panel with the reviewer's message and a "what to fix" checklist of confirmed issues and fixes, plus one-click AI rewrite or resubmit.
  - **Approved:** an **"Approved: ready to launch"** hand-off with an approval ID, approver, and the exact approved copy to launch (any change needs re-review).
- **Compliant rewrite:** the AI fixes the copy, then the full pipeline re-checks it before it can be submitted.
- **Queue** (prioritized, filterable, assignable) and **dashboard** KPIs (time to decision, first-pass rate, issues fixed before review, AI precision).
- **Affiliate drift monitoring:** if an approved page changes, it's re-reviewed and flagged automatically.
- **AI Ops** (every LLM call's cost and latency), **Evals** (per-rule precision/recall), **audit log** with CSV export.
- **Roles** (marketer, affiliate, reviewer, admin) are enforced server-side. Affiliates only see their own work.

## AI design highlights

- **Hybrid:** regex rules for objective checks, the LLM for judgment calls. Offsets are computed in code, never by the model.
- **Prompt-injection defense in depth:**
  - hidden text, comments and zero-width characters are surfaced, not dropped
  - an independent heuristic scan
  - content sits in a nonce-delimited data block
  - the model has no tools and no write access
  - a "possible manipulation" cross-check
  - instructions hidden in images are caught too
- **Reliability:** strict JSON-schema output with one repair retry, timeouts, rule-based fallback with a banner, and a mock mode when there's no key.
- **Cost control:** content-hash cache ($0 re-reviews), prompt caching, a hard spend cap and an hourly limit for the public demo.
- **Reproducible and measured:** versioned rules and prompts stored on every review, plus a CI eval regression gate.

## Technologies

| Area | Used |
|---|---|
| App | Next.js 16 (App Router, Server Components, Server Actions) · React 19 · TypeScript (strict) |
| UI | Tailwind CSS 4 · shadcn/ui (Base UI) · lucide-react · Recharts · next-themes (light/dark) · Sonner · custom WebGL/GLSL shader (landing page) |
| Data | PostgreSQL on Neon (serverless) · Prisma 7 (Neon driver adapter, migrations, seed) |
| AI | OpenAI Responses API (`gpt-6.1-sol`, reasoning effort config) · Structured Outputs from Zod 4 schemas · vision for image transcription |
| Content processing | cheerio (HTML extraction with hidden-content detection) · jsdiff (version diffs) · SSRF-guarded fetch |
| Quality | Vitest (49 unit tests) · eval harness (`npm run eval`) · ESLint · GitHub Actions CI with an eval regression gate |
| Hosting | Vercel (auto-deploy from `main`) · Neon via Vercel Storage |


## With more time / at company scale

- **Security:** SSO, object storage with malware scanning, immutable audit storage, zero-data-retention with the model provider, PII redaction.

## What was built

- **Base:** full workflow, AI pipeline, monitoring, evals, AI Ops and audit, deployed on Vercel + Neon. Every acceptance criterion was verified on the live URL.
- **Iterations:**
  - image support with paste and drag & drop
  - compliant rewrite
  - reviewer-added findings
  - assignment everywhere
  - dark mode
  - CI with an eval gate
  - landing page with a custom WebGL gradient
  - approval hand-off panel and reviewer feedback checklist
