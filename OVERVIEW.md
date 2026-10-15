# ClearPath Review: Overview

**Live:** https://clearpath-sup22.vercel.app (no login; pick a role) · **Demo script + setup:** [README](README.md)

## In one minute

- **Problem:** compliance reviews all of ClearPath's marketing through Excel + email: no queue, lost versions, no audit trail, and no visibility when affiliates change pages after approval. Growth is bottlenecked on review.
- **Product:** "pull requests for marketing content" with an AI pre-reviewer. Submitters get cited findings in seconds and fix them before review. Reviewers work a prioritized queue with issues already highlighted. **The AI never approves; a human always decides.**
- **Principle:** the AI proposes, code verifies, humans decide. Each finding must cite an applicable rule and quote text that really exists, or it's discarded. Submitted content is treated as untrusted input.
- **Results** (real model, 22 labeled samples): recall **80% → 100%** with AI, precision 94%, **0%** clean ads flagged HIGH/CRITICAL, **100%** injection resistance, **~$0.007 and ~6.5s per review**.

## What it does

- **Submit** text, HTML, a URL, or an image (paste/drag; the AI reads text in images). Channel decides which of the 18 rules apply.
- **Review page:**
  - highlighted findings with citation and fix
  - accept/dismiss with a reason; reviewers can add their own findings by selecting text
  - risk score with a "why" breakdown
  - comments, version diffs
- **Decisions:** approval is blocked by open CRITICAL findings unless overridden with an audited reason.
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

## With more time / at company scale

- **Security:** SSO, object storage with malware scanning, immutable audit storage, zero-data-retention with the model provider, PII redaction.
- **AI quality:** grow evals from real reviews and dismissals; gate every prompt/model/rule change on them; learn from dismissed findings; a rule-authoring assistant that turns regulations into tested rules.
- **Product:** scheduled monitoring and re-review when rules change; integrations (HubSpot, Braze, ad platforms); Slack alerts and SLAs; per-state rules; video/PDF support.

## What was built (24 hours, with Claude Code as pair programmer)

- **Base:** full workflow, AI pipeline, monitoring, evals, AI Ops and audit, deployed on Vercel + Neon. Every acceptance criterion was verified on the live URL.
- **Iterations:**
  - image support with paste and drag & drop
  - compliant rewrite
  - reviewer-added findings
  - assignment everywhere
  - dark mode
  - CI with an eval gate
  - landing page with a custom WebGL gradient
- **Numbers:** 18 rules · 22 eval samples · 49 tests · ~$0.60 total API spend.
