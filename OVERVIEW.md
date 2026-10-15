# ClearPath Review: Overview

**Live app:** https://clearpath-sup22.vercel.app · **Code:** https://github.com/Karim-Mammadli/clearpath

This page covers what I built, how it works, what I'd do to take it to production, and what got done in the 24-hour window. The [README](README.md) has the 2-minute demo script and setup.

---

## TL;DR

- **Problem:** ClearPath's compliance team reviews all marketing (email, SMS, social, ads, landing pages, affiliate pages) through Excel and email. There's no queue, no prioritization, versions get lost in threads, there's no audit trail, and nobody sees when an affiliate changes a page after approval. Growth is bottlenecked on review.
- **Product:** a review workflow ("pull requests for marketing content") with an AI pre-reviewer. Submitters get findings in seconds and fix issues before a reviewer ever opens the item. Reviewers work a prioritized queue where the problems are already highlighted, cited, and paired with a suggested fix. **The AI never approves anything; a human always decides.**
- **AI design principle:** *the AI proposes, code verifies, humans decide.* Every AI finding must cite an applicable rule and quote text that actually exists in the ad, or it's discarded. Submitted content is treated as untrusted input (prompt-injection defense in depth).
- **Measured, not claimed:** on a 22-sample labeled set with the real model, recall went from 80% (rules only) to **100%** (rules + AI), precision 94%, **0%** of clean ads flagged HIGH/CRITICAL, **100%** injection resistance, at **~$0.007 and ~6.5s per review**.

---

## How it increases throughput

| Today (Excel + email) | ClearPath Review |
|---|---|
| Reviewer reads every asset cold | AI pre-highlights issues with rule, citation, quote and suggested fix; the reviewer accepts or dismisses |
| Issues found only after a reviewer gets to it | **Shift-left:** submitters see findings instantly and fix before review (dashboard counts "issues fixed before human review") |
| First-come, first-served inbox | **Prioritized queue:** risk score + launch urgency + age + affiliate source + drift |
| Re-reading whole assets after edits | **Version diffs** and "N findings resolved since v1"; dismissed findings stay dismissed |
| Back-and-forth email threads | Comments, decisions and versions live on the submission |
| Affiliate pages change silently after approval | **Drift monitoring** re-checks approved pages and routes changes back into the queue |
| No audit trail | Append-only audit log of every state change, exportable to CSV |
| Fixing copy is manual | **Compliant rewrite:** AI rewrites, then the full pipeline re-checks it before anyone can submit |

---

## What the app does

**Roles** (demo role switcher; server-side authorization throughout):
- **Marketer** (internal): submits content, gets findings, fixes and resubmits, generates compliant rewrites.
- **Affiliate** (external partner): same, but sees only their own company's submissions. Anything else returns 404.
- **Reviewer** (compliance): works the queue, triages findings, comments, assigns, decides.
- **Admin** (compliance lead): everything, plus AI Ops, Evals and monitoring controls.

**Features:**
- **Submit** text, HTML, a landing-page URL (fetched server-side with SSRF protection), and/or an **image** (upload, drag & drop or paste; up to 5MB, resized in-browser). The AI transcribes text in images so it's checked like any other copy.
- **Channel-aware rules:** 18 rules (Reg Z/TILA, UDAAP, FCRA, ECOA, CAN-SPAM, TCPA, FTC endorsements, mortgage advertising, internal policy). Product + channel + affiliate source decide which rules apply (e.g. CAN-SPAM only for email, TCPA only for SMS); the submit form shows which apply.
- **Review page:**
  - findings highlighted inline by severity, each with rule, citation, quote, explanation and suggested fix
  - accept / dismiss (a reason is required)
  - reviewers can **select text to add their own finding**
  - risk score with a "why" breakdown
  - injection banner
  - comments with avatars
  - version selector and diff
  - assignment
- **Decision guardrails:** approve / request changes / reject.
  - Approval is blocked while CRITICAL findings are unresolved unless overridden with a reason, and the override is audited.
  - Stale-version and double-decision protection.
- **Compliant rewrite:** fixes every open finding using only approved ClearPath facts (address, NMLS #, standard disclaimers) and `[PLACEHOLDERS]` for anything it doesn't know, then re-runs the full review. Unfilled placeholders can't be submitted.
- **Queue:** priority-sorted, with tabs (needs review, changes requested, approved, drift alerts) and filters (risk, product, channel, affiliate, assignee). Items can be assigned from the queue, dashboard, list or detail page.
- **Affiliate monitoring:** approved pages are re-fetched and hashed. On drift: new version → full re-review → `DRIFT_DETECTED` → alert. The demo includes hosted affiliate pages plus "Simulate affiliate edit".
- **Dashboard:** volume, backlog, median time to decision, first-pass approval rate, issues fixed before review, AI vs rule-based precision (from reviewer decisions), top violated rules, affiliates with most findings.
- **AI Ops:** every LLM call with tokens (cached / reasoning), cost, latency and result; cache hit rate; repairs and fallbacks; ungrounded findings discarded; precision by rule.
- **Evals:** per-rule precision/recall for rules-only vs hybrid, clean-sample false positives, injection resistance, cost and latency.
- **Audit log:** filterable, CSV export (with spreadsheet formula-injection protection).
- **Polish:** landing page, light/dark theme, loading/empty/error states.

---

## How the AI works

```
content → extract (keep + label hidden text, comments, zero-width chars; transcribe images)
        → applicable rules (product × channel × source, versioned)
        → rule-based detectors (exact offsets) ──────────────┐
        → injection heuristics                                ├→ merge/dedupe → risk score (code) → human
        → LLM review (strict JSON schema, no tools) → verify ─┘
```

- **Hybrid.** Cheap regex detectors handle objective rules (missing APR next to a trigger term, "guaranteed approval", missing STOP/unsubscribe/NMLS). The LLM handles judgment calls (discouraging language, unsubstantiated claims, implied government affiliation, deceptive subject lines).
- **Grounding.** A finding must cite a rule that applies to this submission and quote text found in the content (exact, then whitespace/case-normalized). Offsets are computed in code; the model never supplies them. The model can't escalate severity beyond the rule. Ungrounded findings are dropped and counted on AI Ops.
- **Prompt-injection defense in depth.**
  - Hidden content is surfaced, not dropped.
  - A heuristic scan runs independently of the model.
  - Content sits in a nonce-delimited data block, and any fake delimiters inside it are neutralized.
  - Explicit instruction hierarchy.
  - No tools and no write access, so even a manipulated model can only return text that gets verified.
  - Cross-check: "rules found issues but the AI returned nothing" is flagged as possible manipulation.
  - Text hidden in images is caught the same way.
- **Reliability.**
  - Zod schemas sent to the model as strict JSON schemas, with one cheap repair retry.
  - Timeouts.
  - Fallback to rule-based only, with a banner, if the model is unavailable.
  - Labeled mock mode with no API key.
  - The demo never breaks because of the LLM.
- **Cost and abuse controls.**
  - Content-hash cache (identical re-reviews cost $0).
  - Static-first prompts so provider prompt caching kicks in.
  - A hard spend cap plus an hourly limit, so a public demo URL can't drain the API budget.
- **Reproducibility.** Rules are data, and every review stores the rule-set version, prompt version and model.
- **Feedback loop.** Dismissals require a reason, which feeds per-rule accept rates and a "needs tuning" badge.

---

## Key assumptions (full list in [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md))

- **Scale and people:** ~5 reviewers, ~300 assets/week. Affiliates use the same portal as internal marketers.
- **Scope:** text + one optional image per version; video/audio later. Rules are simplified and not legal advice.
- **Auth:** demo role switcher instead of SSO; authorization is still enforced on the server.
- **What's manual in v1:** monitoring runs on demand ("Check now"), the rule library is read-only in the UI, and assignment is manual.

---

## Taking it to production (company level)

**Security and compliance infrastructure**
- SSO/SAML (Okta/Azure AD) with role mapping from the identity provider; affiliate accounts with MFA; per-tenant data isolation.
- Object storage for creatives (S3/GCS) with malware scanning, signed URLs, and retention policies for regulatory record-keeping.
- WORM/immutable storage for the audit log; SIEM export; SOC 2 controls.
- A zero-data-retention agreement with the model provider. PII detection/redaction before content leaves our boundary. Model and prompt changes go through change management.
- SSRF hardening: pin the resolved IP per request (closes the DNS-rebinding gap); egress allow-listing.

**AI quality and governance**
- Grow the eval set from real historic reviews and every reviewer dismissal; span-level (not just rule-level) scoring; multiple runs per sample to measure variance; per-rule confidence thresholds.
- **Gate every prompt, model and rule change on evals in CI** (the gate exists today for the rule-based layer). Shadow-test new models before switching.
- A rule-authoring assistant: compliance pastes regulatory text, gets a draft rule plus labeled test cases, and the rule is only activated after it passes evals.
- Few-shot learning from dismissed findings (negative examples per rule), versioned and eval-gated.
- Online monitoring: precision drift per rule, injection-attempt rate per affiliate, cost and latency SLOs with alerts.

**Product and scale**
- Scheduled monitoring of every approved affiliate URL (plus re-review of approved content when rules change). Background job queue for reviews at volume.
- Integrations where content is created (HubSpot, Braze, Iterable, ad platforms, CMS) so checks run before submission. Slack/email notifications; SLAs and workload balancing; per-state rules (state lending/licensing).
- Video and audio (transcripts plus frame OCR), multi-image carousels, PDFs.
- Editable rule library with approvals and versioning; reviewer analytics; a legal escalation path.

## With one more week

1. Rule editor with eval-gated activation, plus scheduled monitoring jobs.
2. A bigger, more diverse eval set (100+ samples, real-world false-positive cases such as benign hidden accordions) and span-level metrics.
3. Slack notifications and a "my SLA" view for reviewers.
4. SSO, and object storage for images.
5. Mobile-friendly review layout and an accessibility audit.

---

## What was built

All of it was built in the 24-hour window, with Claude Code as a pair programmer, steered by the specs in [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs).

| Phase | Delivered |
|---|---|
| Foundation | Next.js 16 + Prisma 7/Neon + shadcn; data model (15 tables); rule catalog; seed data |
| Review engine | Extraction with hidden-content surfacing; rule-based detectors; injection scan; LLM client (Responses API + structured output); grounding verification; merge/dedupe; scoring; mock mode; spend cap |
| Workflow | Submit (text/URL), queue, review page with highlights, triage, comments, decisions with CRITICAL gate, resubmission diffs, audit log + CSV |
| Ops and quality | AI Ops page, eval harness with real-model results, drift monitoring with demo affiliate pages, 49 unit tests |
| Deploy | Vercel + Neon; fixed build-time DB access and framework preset; verified every acceptance criterion on the live URL |
| Iteration 1 | Image creatives (AI transcription, injection in images), dark mode, assignment everywhere, edge-case guards, realistic seed decisions |
| Iteration 2 | Compliant rewrite with self-verification, placeholder guard, comment avatars, channel rule preview, brand logo |
| Iteration 3 | Image paste / drag & drop, 5MB with in-browser resize, reviewer findings from text selection, GitHub Actions CI with eval gate |
| Iteration 4 | Landing page (custom WebGL gradient, no 3D library), brand-teal design system, UI polish; regression found and fixed (404 status) |

**By the numbers:**
- 18 rules, 22 labeled eval samples, 49 unit tests, CI on every push.
- Real model used throughout, at **~$0.60 total API spend**. Seeded demo reviews replay recorded real model output, so reseeding is free.
- Every acceptance criterion in [docs/SPEC.md](docs/SPEC.md) §7 was re-verified on the production URL after each major change.

## Where to look in the code

- `src/lib/review/engine.ts`: the pipeline (pure; the app and the eval harness run the same code)
- `src/lib/review/verify.ts`: grounding verification
- `src/lib/review/injection.ts` and `src/lib/extract.ts`: injection and hidden-content defense
- `src/lib/review/prompts/reviewer.v1.ts`: the versioned prompt
- `src/lib/llm/client.ts`: single provider wrapper with cost/latency logging
- `evals/run.ts` and `tests/`: evals and unit tests (including a "manipulated model can't clear an injected page" test)
