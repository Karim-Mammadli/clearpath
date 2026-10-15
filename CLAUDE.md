# ClearPath Review — Project Brief for Claude Code

You are building a take-home project for a founding-engineer interview at **PromptArmor** (an AI security / AI risk company). The deliverable is a **deployed URL + GitHub repo**, built in under 24 hours. Reviewers are AI-security engineers: they will judge product thinking, how well AI is used (reliability, grounding, evals, security), and code quality. Build like a senior engineer shipping a real v1, not a hackathon demo.

Read these before writing code, in order:
1. `docs/SPEC.md` — product, users, screens, data model, flows, acceptance criteria
2. `docs/AI_REVIEW.md` — the AI review pipeline design (most important part of the project)
3. `docs/RULES.md` — the compliance rule library to seed
4. `docs/SAMPLES.md` — sample marketing content with expected violations (seed data + eval dataset)

## The problem (short version)

ClearPath Financial (fictional) is a national consumer-finance company: personal loans, credit cards, mortgage prequalification. It markets online through email, SMS, social, display ads, landing pages, and **affiliate partners**. Every piece of marketing must pass compliance review before it goes live (Reg Z/TILA, UDAAP, FCRA, ECOA, CAN-SPAM, TCPA, FTC Endorsement Guides, internal policy). Today the compliance team reviews via **Excel + email**: no queue, no prioritization, versions lost in threads, rules in reviewers' heads, no audit trail, and no visibility when affiliates change pages after approval. This bottlenecks growth.

**Goal: increase the throughput of the compliance marketing team without lowering review quality.**

## The product: ClearPath Review

"Pull requests + an AI pre-reviewer, for marketing content."

1. Marketers / affiliates **submit** content (text or a landing-page URL) through a form instead of email.
2. An **AI pre-check** runs immediately: deterministic checks + an LLM reviewer, grounded in a versioned rule library. Every finding cites a rule and quotes the exact offending text, which is highlighted in the UI, with a suggested fix.
3. Compliance works from a **prioritized queue** (risk + due date) instead of a spreadsheet.
4. On the **review screen**, the reviewer accepts/dismisses each AI finding, comments, and approves or requests changes. **AI never approves anything; a human always decides.**
5. **Resubmissions** show a diff so reviewers only re-check what changed.
6. Everything is written to an append-only **audit log** (exportable to CSV, since they live in Excel today).
7. **Affiliate monitoring**: approved affiliate URLs are re-checked; if the live page drifts from the approved version, it's re-reviewed automatically and compliance is alerted. (This mirrors PromptArmor's own "approved once, then drifts" research on connectors — call this out in the README.)
8. **AI Ops + Evals pages**: every LLM call is logged (model, prompt version, tokens, cost, latency), and an eval harness measures precision/recall per rule against a labeled dataset.

## Tech stack (use exactly this unless blocked)

- **Next.js (latest stable, App Router) + TypeScript (strict)**, server actions / route handlers for the backend
- **Tailwind CSS + shadcn/ui** + lucide-react icons. Clean, professional, light theme, sidebar layout
- **PostgreSQL** via **Prisma** (hosted on Neon or Supabase)
- **Zod** for all input validation and for LLM output schemas
- **OpenAI official `openai` npm SDK**, **Responses API** with **Structured Outputs (JSON schema)**
- **Vitest** for unit tests
- Deploy on **Vercel** (no cron jobs; affiliate monitoring runs from "Check now" buttons)
- Text extraction from URLs: `cheerio` (strip scripts/styles but KEEP and flag hidden text and HTML comments — see AI_REVIEW.md)
- Diffs: `diff` (jsdiff) package

## LLM configuration

**Only secrets are environment variables.** Everything else lives in `src/lib/config.ts` as code constants with comments:

```ts
// src/lib/config.ts
export const LLM = {
  model: "gpt-6.1-sol",          // supports reasoning effort low|medium|high|xhigh|max (NOT none/minimal)
  reasoningEffort: "medium",
  timeoutMs: 90_000,             // stop waiting after 90s, fall back to deterministic-only
  pricePerMillion: { input: 2.0, cachedInput: 0.1, output: 10.0 }, // USD, for the AI Ops cost display only
};
```

Environment variables (secrets only):
```
DATABASE_URL=            # pooled Neon URL (set automatically in Vercel by the Neon integration)
DATABASE_URL_UNPOOLED=   # direct Neon URL for migrations (name must match what the integration created)
OPENAI_API_KEY=          # added later; until then the app uses mock AI (see below)
```

- `.env` is gitignored and never committed. Nothing secret appears in code, README, seed data, logs, or the UI. The OpenAI key is only read server-side.
- Use the Responses API with a JSON-schema structured output generated from Zod. **Verify exact SDK syntax against the installed `openai` package version and https://developers.openai.com docs** before writing the client — do not guess API shapes.
- Wrap all LLM access in one module (`src/lib/llm/client.ts`) so model/provider can change in one place.
- Reasoning tokens are billed as output tokens — include them in cost calculations.
- **Fallbacks:** no `OPENAI_API_KEY` → **mock AI mode** (below). Key present but the call fails/times out → **deterministic-only**: keep rule-based findings, mark the AI review `PARTIAL`, show a clear banner. The deployed demo must never break because of the LLM.

## Building before the OpenAI key arrives

The key may not exist for the first several hours. Do not block on it.

- Implement the real OpenAI client fully (check installed SDK types for syntax), but add `src/lib/llm/mock.ts`: when `OPENAI_API_KEY` is not set, return fixture `LlmReview` JSON. Fixtures for S1–S13 are realistic LLM outputs consistent with the labels in SAMPLES.md (correct rule codes, verbatim quotes, explanations, fixes); include one deliberately ungrounded finding (a quote that isn't in the text) in the S1 fixture so `verify.ts` visibly discards it. Unknown content → empty findings.
- Mock calls are logged in `LlmCall` with `model = "mock"` and cost 0, and the UI shows a "Mock AI" badge, so mock output is never presented as real model output.
- Unit-test the LLM path with mocked responses: schema parse, repair retry, verification, dedupe, injection handling.
- **When the human says the key is ready:** they add `OPENAI_API_KEY` in Vercel and in the local `.env`. Then: (1) run S1, S2, S8 through the real model and show the results, (2) fix prompt issues, (3) run `npm run eval` with the real model and commit `evals/results/latest.json`, (4) regenerate precomputed seed reviews from real model output and reseed, (5) redeploy and spot-check the live URL. Budget ~45 minutes for this; it fits inside the 7:15–9:00 AM blocks if the key is late.
- `medium` reasoning effort adds latency: set `export const maxDuration = 120` on routes that call the LLM, show a progress state ("Checking against 14 rules…"), and use `LLM.timeoutMs` from config.

## Architecture & code organization

```
src/
  app/                    # routes (see SPEC.md for the page list)
  components/             # UI components (shadcn in components/ui)
  lib/
    db.ts                 # Prisma client singleton
    auth.ts               # demo role switcher (cookie-based)
    audit.ts              # writeAudit(): the ONLY way audit events are created
    review/
      pipeline.ts         # orchestrates a full review of a SubmissionVersion
      deterministic.ts    # rule-based checks with exact character offsets
      llm-review.ts       # prompt building + LLM call + parsing
      verify.ts           # grounding verification of LLM findings
      injection.ts        # prompt-injection / hidden-text detection
      scoring.ts          # risk score computed in CODE from findings
      rewrite.ts          # compliant-rewrite generation + self-check
      prompts/            # versioned prompt templates (e.g. reviewer.v1.ts)
    llm/
      client.ts           # single OpenAI client wrapper, logging, cost, retries, caching
    monitor/              # affiliate URL fetch, extract, hash, drift detection
    extract.ts            # HTML -> text with hidden-content detection
prisma/
  schema.prisma
  seed.ts                 # rules, users, affiliates, samples, precomputed reviews
evals/
  dataset.json            # generated from docs/SAMPLES.md
  run.ts                  # `npm run eval`
  results/latest.json
```

## Non-negotiable engineering principles

1. **The LLM proposes, code verifies, humans decide.** The LLM never sets submission status, never computes the risk score, and never approves.
2. **Grounding:** every LLM finding must reference a rule code from the applicable rule set and quote text that exists verbatim in the content. `verify.ts` locates the quote and computes offsets server-side; unverifiable findings are discarded and counted (shown on the AI Ops page as "discarded ungrounded findings").
3. **Submitted content is untrusted input** (especially affiliate content). It goes into a clearly delimited data block, never into instructions. Detect and flag injection attempts as a finding — they must never change the reviewer's behavior. This is a security company; this matters most.
4. **Rules are data, not prompt text.** The prompt is assembled from the active, applicable rules (by product + channel). Rule-set version and prompt version are stored on every AI review so results are reproducible.
5. **Schema-validated outputs** with one repair retry, then graceful failure.
6. **Observability:** every LLM call is logged in `LlmCall` (purpose, model, prompt version, input/cached/output tokens, cost USD, latency, success/error).
7. **Caching:** cache AI reviews by `sha256(content + ruleSetVersion + promptVersion + model)`. Put static prompt content (instructions + rules) first and the submission last so provider prompt caching helps.
8. **Audit everything** through `writeAudit()`; audit table is append-only.
9. **Authorization on the server**, not just hidden buttons: affiliates only see their own submissions; only reviewers/admins can decide.
10. Keep it simple. No microservices, no queues/workers infrastructure — run the pipeline in the request (or `after()`/background-safe pattern) and show a loading state. Prefer boring, readable code.

## Deployment (Vercel + Neon Postgres)

- The human creates: a GitHub repo, a Vercel project imported from it, and a Neon Postgres database added through **Vercel → Storage → Neon** (this injects the database env vars into the Vercel project automatically). For local development the human copies the two database URLs from the Neon/Vercel dashboard into a gitignored `.env` by hand — **no Vercel CLI**. Deploys happen only via `git push` → Vercel auto-deploy. Later the human adds `OPENAI_API_KEY` in both places.
- Prisma with Neon: use the **pooled** URL for the app (`DATABASE_URL`) and the **unpooled/direct** URL for migrations (`directUrl = env("DATABASE_URL_UNPOOLED")` in `schema.prisma`; match whatever variable name the integration actually created).
- Local dev uses the same Neon database (one database is fine for a demo). Run `prisma migrate deploy` + seed against it from the laptop; don't run migrations or seeds during the Vercel build.
- Build command: `prisma generate && next build` (add `postinstall: prisma generate`).
- Routes that run the AI review: set `export const maxDuration = 120`.
- No scheduled jobs. Monitoring is triggered by "Check now" (one URL) and "Check all monitored URLs" buttons, restricted server-side to reviewers/admins. A scheduled daily check is listed as future work in the README.
- Every push to `main` auto-deploys. The production URL (`<project>.vercel.app`) is the deliverable.

## Time-boxed build plan (HARD DEADLINE)

**The live URL + public GitHub repo must be submitted by 9:30 AM PDT, Oct 15 2026 (real deadline 10:00 AM).** Work starts ~11:00 PM PDT Oct 14. Scope is cut to fit; do not add features beyond this list. Keep `main` deployable at every commit. After each milestone: typecheck, lint, tests, commit, push (auto-deploy), confirm the live URL still works.

| Time (PDT) | Milestone | Must be true at the end |
|---|---|---|
| 11:00–11:30 PM | **Setup (human)** | Repo, Vercel project, Neon DB, env vars in place |
| 11:30 PM–12:30 AM | **M0 Scaffold + deploy** | Next.js + Tailwind + shadcn + Prisma schema, seed rules/users/affiliates, role switcher, sidebar layout, **live URL works** |
| 12:30–2:00 AM | **M1 Workflow + M2 Deterministic engine** | Submit → queue → review page → approve/request changes/reject, comments, audit log; deterministic checks with offsets + unit tests |
| 2:00–3:30 AM | **M3 LLM pipeline** | Prompt, structured output, verify, injection defense, dedupe, scoring, LlmCall logging, cache, deterministic-only fallback, mock mode. **Checkpoint: show the human S1, S2, S8 results** (real model if the key exists, otherwise mock + deterministic) |
| 3:30–5:00 AM | **M4 Review UX + resubmission** | Inline highlights, findings panel (accept/dismiss + reason), citations, fixes, injection banner, resubmit → new version + simple line diff, compliant rewrite with auto re-check |
| 5:00–6:15 AM | **M6 Dashboard + AI Ops, M7 Evals** | KPI dashboard (2–3 charts), AI Ops page, `npm run eval` + committed results + `/evals` page |
| 6:15–7:15 AM | **M8 Affiliate monitoring (lite)** | Demo affiliate pages, "Simulate affiliate edit", "Check now", drift → new version → re-review → alert |
| 7:15–8:15 AM | **M9 Seed polish + README** | ~15 seeded submissions with precomputed reviews, README per SPEC §8, ASSUMPTIONS, architecture diagram |
| 8:15–9:00 AM | **Verify on live URL** | Walk every acceptance criterion in SPEC §7 on production; fix only bugs, no new features |
| 9:00–9:30 AM | **Buffer + submit** | Submit URL + repo by 9:30 |

**If a milestone runs >30 min over, cut in this order:** (1) compliant rewrite, (2) affiliate monitoring → keep only demo pages + "Check now", (3) dashboard charts → plain KPI numbers, (4) synthetic eval variants. **Never cut:** M3 grounding/verification, injection defense, AI Ops logging, evals with real numbers, README, a working live URL.

**Simplifications already accepted for the deadline:** rule library is read-only in the UI (with per-rule stats); quote matching is exact + whitespace/case-normalized only (no fuzzy); no low-risk "fast lane" UI (use a risk filter instead); CSV export of audit log only; 6 synthetic eval variants, not 10.

## Quality bar

- TypeScript strict, no `any` unless justified. ESLint clean.
- Unit tests for: deterministic checks, verify.ts (quote matching, offsets, rejection), scoring, injection detection, prompt assembly (rule filtering by product/channel).
- Seeded demo must look alive: ~15 submissions across statuses, channels, products, and affiliates, with precomputed AI reviews stored in the seed (so the demo works even without an API key).
- Loading, empty, and error states on every page. Mobile-tolerant, desktop-first.
- No secrets in the repo; provide `.env.example`.

## Commands (create these scripts)

```
npm run dev          # local dev
npm run build
npm run lint
npm run typecheck
npm run test         # vitest
npm run db:migrate   # prisma migrate dev
npm run db:seed
npm run eval         # run eval harness, write evals/results/latest.json
```

## Working style

- Plan briefly, then build milestone by milestone; don't stop to ask unless genuinely blocked. Record any assumption you make in `docs/ASSUMPTIONS.md` (it feeds the README).
- When unsure about an external API's current shape (OpenAI SDK, Next.js, Prisma), check the installed package types or official docs instead of guessing.
- Disclaimer to include in the app footer and README: rules are simplified for demonstration and are not legal advice.
