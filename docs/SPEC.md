# ClearPath Review — Product Spec

> Deadline note: CLAUDE.md's "Time-boxed build plan" and its list of accepted simplifications override anything in this spec (e.g. read-only rule library, no fast-lane UI, no fuzzy matching).

## 1. Users & roles

Demo auth: a role switcher in the top bar ("Acting as: …") backed by seeded users and a cookie. No passwords. Document this as an assumption (real version: SSO/SAML).

| Role | Seeded users | Can do |
|---|---|---|
| MARKETER | Maya Chen (Growth), Diego Ruiz (Lifecycle) | Submit content, see own team's submissions, resubmit, view findings, generate rewrites |
| AFFILIATE | Jordan Blake (LoanFinderHub), Priya Nair (CreditCompass blog) | Submit content for own affiliate only, see only own submissions |
| REVIEWER | Sam Okafor, Elena Petrova (Compliance) | Everything in the queue, accept/dismiss findings, comment, decide |
| ADMIN | Alex Morgan (Compliance lead) | Reviewer powers + rule library editing, AI Ops, evals, monitoring, simulate affiliate edits |

## 2. Core flows

### 2.1 Submit
Form fields: title, product (PERSONAL_LOAN | CREDIT_CARD | MORTGAGE_PREQUAL), channel (EMAIL | SMS | SOCIAL | DISPLAY_AD | LANDING_PAGE | AFFILIATE_PAGE), content (textarea) **or** URL (fetched + text extracted server-side), planned launch date (optional), notes for reviewer.
On submit → create Submission + Version 1 → run review pipeline → status `IN_REVIEW` → redirect to the submission page showing AI findings. The submitter sees findings immediately and can fix and resubmit **before** a reviewer ever opens it ("shift-left": this is the biggest throughput win).

### 2.2 Queue (reviewers)
Table: title, product, channel, submitter/affiliate, risk level badge, # open findings, version, status, due/launch date, age, assignee.
Default sort = priority (see §5). Filters: status, product, channel, risk level, affiliate, assigned to me. Tabs: `Needs review`, `Changes requested`, `Approved`, `Drift alerts`, `All`.
**Low-risk fast lane:** items with zero verified findings are grouped; a reviewer can open each quickly and approve with one click (still a human decision, still audited).

### 2.3 Review page
- Left: content with findings highlighted inline (color by severity), hover shows a tooltip. Version selector; "Compare with previous version" toggles a diff view.
- Right: findings list grouped by severity. Each: rule code + title, citation, quoted text, explanation, suggested fix, source badge (Rule-based / AI / Reviewer), confidence (AI only). Buttons: Accept, Dismiss (requires reason: false positive / not applicable / acceptable risk / other + note). Reviewers can add a manual finding by selecting text.
- AI summary + risk score + "why this score" breakdown (computed from findings).
- Banner if suspected prompt injection or hidden text detected.
- Comments thread.
- Decision bar: Approve / Request changes / Reject (reject requires reason). Approve is blocked while any CRITICAL finding is still PENDING or ACCEPTED (reviewer must resolve or explicitly override with a reason — override is audited).
- "Generate compliant rewrite" → AI proposes a rewrite, which is automatically re-checked; shows "Rewrite passes all checks" or remaining issues. Marketer can submit it as the next version.

### 2.4 Resubmission
Submitter edits content → new SubmissionVersion → pipeline runs → reviewer sees diff and per-version findings. Findings dismissed on the previous version with an identical quote+rule are auto-marked "previously dismissed" (still visible).

### 2.5 Affiliate monitoring
For approved AFFILIATE_PAGE / LANDING_PAGE submissions with a URL, create a MonitoredUrl. Checks run when a reviewer clicks "Check now" on one URL or "Check all" on the monitoring page (no scheduled jobs in v1; a daily schedule is future work). Extract text, hash, compare to approved version. On change: create a new version (source = MONITOR), run pipeline, set status `DRIFT_DETECTED`, show in `Drift alerts` tab + dashboard alert, write audit event.
**Demo affiliate pages** are hosted inside the app at `/demo/affiliates/[slug]` and render content from a DB table, so the demo doesn't depend on external sites. Admin has a "Simulate affiliate edit" button that swaps the page to its "changed" content (see SAMPLES.md S13).

### 2.6 Rule library (admin)
List of rules with code, title, citation, products, channels, severity, check type, active toggle. Edit form. Any change bumps the rule-set version (stored on each AI review). Show per-rule stats: times triggered, reviewer accept rate (precision proxy), most recent hits.

### 2.7 Audit log
Filterable table of AuditEvents (actor, action, entity, timestamp, metadata). CSV export button.

## 3. Pages

| Route | Who | Purpose |
|---|---|---|
| `/` | all | Dashboard: KPIs + my items |
| `/submit` | marketer, affiliate, admin | Submit content |
| `/submissions` | marketer/affiliate: own; reviewer: all | My submissions |
| `/queue` | reviewer, admin | Prioritized queue |
| `/submissions/[id]` | per auth | Review page (read-only for submitters, with resubmit + rewrite) |
| `/rules` | admin (reviewers read-only) | Rule library |
| `/monitoring` | reviewer, admin | Monitored URLs, last check, drift status, check now, simulate edit |
| `/ai-ops` | admin | LLM call log, cost, latency, discarded findings, cache hit rate, AI precision |
| `/evals` | admin | Latest eval results |
| `/audit` | reviewer, admin | Audit log + CSV export |
| `/demo/affiliates/[slug]` | public | Fake affiliate pages for monitoring demo |

## 4. Data model (Prisma, adapt as needed)

- **User** { id, name, email, role, affiliateId? }
- **Affiliate** { id, name, website, slug }
- **Submission** { id, title, product, channel, status, submitterId, affiliateId?, assignedReviewerId?, launchDate?, sourceUrl?, currentVersionNumber, priorityScore, createdAt, updatedAt }
  - status: `IN_REVIEW | CHANGES_REQUESTED | APPROVED | REJECTED | DRIFT_DETECTED`
- **SubmissionVersion** { id, submissionId, versionNumber, contentText, contentHash, source (`SUBMITTER | REWRITE | MONITOR`), createdById?, createdAt, extractionMeta Json? (hidden text found, comments found) }
- **AiReview** { id, versionId, status (`COMPLETE | PARTIAL | FAILED`), riskScore, riskLevel, summary, model?, promptVersion, ruleSetVersion, cacheKey, cacheHit, discardedFindings Int, injectionSuspected Boolean, createdAt }
- **Finding** { id, versionId, aiReviewId?, ruleCode, source (`DETERMINISTIC | LLM | REVIEWER`), severity, quote, startOffset, endOffset, explanation, suggestedFix?, confidence?, decision (`PENDING | ACCEPTED | DISMISSED`), dismissReason?, dismissNote?, decidedById?, decidedAt? }
- **Rule** { id, code (unique), title, description, citation, products[], channels[], severity, checkType (`DETERMINISTIC | LLM | BOTH`), guidance, violatingExamples[], compliantExamples[], active, updatedAt }
- **RuleSetVersion** { id, version Int, createdAt, changeNote }
- **Comment** { id, submissionId, versionId?, authorId, body, createdAt }
- **Decision** { id, submissionId, versionId, reviewerId, outcome, reason?, overrideNote?, createdAt }
- **AuditEvent** { id, actorId?, action, entityType, entityId, metadata Json, createdAt } — append-only
- **LlmCall** { id, purpose (`REVIEW | REPAIR | REWRITE | EVAL`), model, promptVersion, inputTokens, cachedInputTokens, outputTokens, costUsd, latencyMs, success, error?, submissionVersionId?, createdAt }
- **MonitoredUrl** { id, submissionId, url, approvedHash, lastHash?, lastCheckedAt?, status (`OK | DRIFT | ERROR`) }
- **DemoAffiliatePage** { id, slug, approvedHtml, changedHtml, showChanged Boolean }

## 5. Priority & risk (computed in code)

Risk score (0–100) from verified, non-dismissed findings: CRITICAL 40, HIGH 20, MEDIUM 8, LOW 3, capped at 100. Injection suspected → minimum 80. Risk level: 0 = CLEAR, 1–19 LOW, 20–49 MEDIUM, 50–79 HIGH, 80+ CRITICAL. Show the breakdown in the UI.

Priority score = risk weight + launch urgency (launch within 2 days +30, within 7 days +15) + age in queue (+2/day, cap 20) + affiliate source (+5) + drift (+25). Queue sorts by priority desc.

## 6. Dashboard KPIs

- Submissions this week; items awaiting review; median time-to-decision; first-pass approval rate; % of issues caught by AI before human review (findings resolved by submitter before reviewer opened); top violated rules; affiliates with most findings; open drift alerts.
- AI precision proxy = accepted / (accepted + dismissed) per source (Rule-based vs AI).
- Seed historic decisions with timestamps so charts look real (use recharts, simple bar/line).

## 7. Acceptance criteria (must be true on the live URL)

1. Switching roles changes what you can see and do; affiliates can't access other affiliates' data (enforced server-side).
2. Submitting SAMPLES.md S1 produces highlighted findings for at least REGZ-CE-TRIGGER, UDAAP-GUARANTEE, CANSPAM-EMAIL within ~20s, each with quote, citation, and fix.
3. Submitting S8 (hidden injection) does NOT produce a clean result; it flags SEC-INJECTION and still reports the real violation.
4. Clean samples (S2, S4, S11, S12) produce no HIGH/CRITICAL findings.
5. Approve is blocked by unresolved CRITICAL findings unless overridden with a reason.
6. Resubmitting shows a diff and new findings.
7. Simulating the S13 affiliate edit and clicking "Check now" flips the submission to DRIFT_DETECTED with new findings and an alert.
8. AI Ops shows every LLM call with tokens, cost, latency; Evals page shows per-rule precision/recall.
9. With `OPENAI_API_KEY` removed, the app still works (deterministic-only mode, banner shown).
10. Every state change appears in the audit log; CSV export works.

## 8. README requirements (this is part of the evaluation)

The README must include:
- One-paragraph problem statement and what the product does; live URL; demo walkthrough (which role to pick, which seeded items to open, 2-minute script).
- **Assumptions** (from docs/ASSUMPTIONS.md): e.g. compliance team size ~5 reviewing ~300 assets/week; text content only in v1 (images via OCR later); AI assists, never approves; demo auth; rules simplified, not legal advice; affiliates submit through the same portal.
- **How it increases throughput:** shift-left self-check for submitters, prioritized queue, AI pre-highlighting, diffs on resubmission, low-risk fast lane, fewer email round-trips, measurable via dashboard KPIs.
- **AI design:** hybrid deterministic + LLM, grounding verification, untrusted-content handling and injection defense, rules-as-data with versioning, schema validation + repair, caching, cost/latency logging, deterministic fallback, human-in-the-loop, feedback loop from dismissals.
- **Eval results** table (copy from evals/results/latest.json) and what you'd improve.
- Architecture diagram (Mermaid).
- Trade-offs and what I'd build next (OCR for image ads, video/audio transcripts, SSO, rule authoring assistant that turns regulatory text into rules, few-shot learning from dismissed findings, Slack/email notifications, integration with marketing tools like HubSpot/Braze, per-state rules, scheduled re-review when rules change).
- Local setup, env vars, commands.
