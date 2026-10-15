# Assumptions

Product, scope and technical assumptions made for v1. These feed the README and are open for discussion.

## Business & users

- **Team size and volume:** ~5 compliance reviewers handle ~300 marketing assets/week across email, SMS, social, display, landing pages and affiliate pages. The bottleneck is reviewer time spent on (a) finding the issues, (b) chasing versions in email threads, and (c) re-reviewing whole assets after small edits.
- **Baseline:** today's Excel + email process takes ~3 days to a first decision (assumed; used as the comparison point on the dashboard).
- **Affiliates submit through the same portal** as internal marketers (with their own accounts, scoped to their own affiliate) instead of emailing PDFs/screenshots.
- **Marketers see their whole team's first-party submissions** (not just their own), so a teammate can pick up a resubmission. Affiliates only ever see their own affiliate's items.
- **AI assists, never approves.** The AI pre-check produces findings and a summary; risk scores are computed in code; only a human reviewer can approve, request changes, or reject. Approving with an unresolved CRITICAL finding needs an audited override reason.
- **Rules are simplified** summaries of Reg Z/TILA, UDAAP, FCRA, ECOA, CAN-SPAM, TCPA, the FTC Endorsement Guides and internal policy. **Not legal advice.** In reality, compliance/legal would own the rule library and its versioning.
- **TCPA consent** (prior express written consent) is assumed to be collected by the consent platform; we only check message content.

## Scope (v1)

- **Text + one optional image per version.** Email/SMS/social copy, ad copy, HTML pages (fetched by URL), and an image creative whose text the AI transcribes for review. Images (≤3MB) are stored in Postgres for v1; production would use object storage with malware scanning. Video and audio are future work.
- **Review routing:** new submissions are auto-assigned by simple rules in `src/lib/config.ts` (`ROUTING`: affiliate and mortgage content → Elena, SMS → Sam), otherwise to the least-loaded reviewer. Any reviewer can reassign. Real version: routing rules managed in the UI, with SLAs and out-of-office handling.
- **Demo auth:** a role switcher backed by seeded users and a cookie (no passwords). Real version: SSO/SAML with role mapping from the IdP. All authorization is still enforced server-side.
- **Rule library is read-only in the UI** (with per-rule stats). Editing rules would bump the rule-set version; the data model already stores the rule-set version on every AI review.
- **Affiliate monitoring runs on demand** ("Check now" / "Check all") rather than on a schedule (Vercel cron is out of scope for the deadline). Monitored URLs are created automatically when an affiliate/landing page submitted by URL is approved.
- **Demo affiliate pages are hosted inside the app** (`/demo/affiliates/*`) so the monitoring demo doesn't depend on external sites. The admin can "Simulate affiliate edit" and "Reset demo".
- **Compliant rewrite** (AI-generated fixed copy) was cut for time. Every finding already carries a concrete suggested fix; the submitter edits and resubmits, and the full pipeline re-runs on the new version.
- **Quote matching** is exact, then whitespace/case/typographic-quote normalized. No fuzzy matching: a quote that isn't really in the text is discarded.

## AI & cost

- **Model:** `gpt-6.1-sol` via the OpenAI Responses API with strict JSON-schema structured output, `medium` reasoning effort. Measured ~6.5s and ~$0.007 per review on the eval set, well inside the "findings within ~20s" target.
- **Budget guard:** the public demo has a hard LLM spend cap (`LLM.budgetUsd`, $3) and an hourly call limit. Past the cap, reviews run rule-based only with a clear banner instead of failing (protects against wallet-draining abuse of a public URL).
- **No API key → Mock AI mode** with clearly labeled fixtures (never presented as real model output). **Key present but the call fails/times out/is over budget → rule-based only** (`PARTIAL` review, banner). `AI_MODE=off` is an ops kill switch that forces rule-based only.
- **Data handling:** requests use `store: false`. Marketing drafts are confidential pre-launch material; a production deployment would add a zero-data-retention agreement with the provider.
- **Hidden content is suspicious by default.** Any hidden HTML element, comment or invisible character raises `SEC-INJECTION` for human attention. On real-world pages (accordions, mobile menus) this will need an allow-list or a lower severity for hidden-but-benign content.
- **Seeded AI reviews replay recorded real model output** (`prisma/seed-data/llm-replay.json`, produced by `npm run eval -- --record`), re-verified by the current code at seed time. The demo looks real without spending API credit on every reseed.
