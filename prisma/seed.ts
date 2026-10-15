import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { extractContent } from "@/lib/extract";
import { computeCostUsd, type LlmUsage } from "@/lib/llm/client";
import { refreshPriority, reviewVersion } from "@/lib/review/pipeline";
import { RULE_CATALOG } from "@/lib/rules/catalog";
import { getSample, type Sample } from "@/lib/samples";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Seeds rules, users, affiliates, demo affiliate pages and ~17 submissions with precomputed AI
 * reviews, so the demo works (and looks alive) without an API key.
 *
 * AI reviews: if prisma/seed-data/llm-replay.json exists (recorded real model output from
 * `npm run eval -- --record`), it is replayed; otherwise the clearly-labeled mock fixtures are used.
 * Offsets are always recomputed by verify.ts at seed time, never hard-coded.
 */

const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (d: number, h = 0) => new Date(now - d * DAY - h * 3_600_000);
const inDays = (d: number) => new Date(now + d * DAY);

type Replay = Record<string, { review: unknown; usage: LlmUsage; latencyMs: number; model: string }>;
const replayPath = path.join(__dirname, "seed-data", "llm-replay.json");
const replay: Replay | null = existsSync(replayPath) ? JSON.parse(readFileSync(replayPath, "utf8")) : null;

const USERS = [
  { id: "u_maya", name: "Maya Chen", email: "maya.chen@clearpath.example", role: "MARKETER", team: "Growth" },
  { id: "u_diego", name: "Diego Ruiz", email: "diego.ruiz@clearpath.example", role: "MARKETER", team: "Lifecycle" },
  { id: "u_jordan", name: "Jordan Blake", email: "jordan@loanfinderhub.example", role: "AFFILIATE", team: null, affiliateId: "aff_lfh" },
  { id: "u_priya", name: "Priya Nair", email: "priya@creditcompass.example", role: "AFFILIATE", team: null, affiliateId: "aff_cc" },
  { id: "u_sam", name: "Sam Okafor", email: "sam.okafor@clearpath.example", role: "REVIEWER", team: "Compliance" },
  { id: "u_elena", name: "Elena Petrova", email: "elena.petrova@clearpath.example", role: "REVIEWER", team: "Compliance" },
  { id: "u_alex", name: "Alex Morgan", email: "alex.morgan@clearpath.example", role: "ADMIN", team: "Compliance lead" },
] as const;

async function reset() {
  // Order matters (FKs). Seed is the only place rows are deleted, including audit events.
  await db.auditEvent.deleteMany();
  await db.llmCall.deleteMany();
  await db.finding.deleteMany();
  await db.aiReview.deleteMany();
  await db.comment.deleteMany();
  await db.decision.deleteMany();
  await db.monitoredUrl.deleteMany();
  await db.submissionVersion.deleteMany();
  await db.submission.deleteMany();
  await db.user.deleteMany();
  await db.affiliate.deleteMany();
  await db.rule.deleteMany();
  await db.ruleSetVersion.deleteMany();
  await db.demoAffiliatePage.deleteMany();
}

async function addVersion(submissionId: string, versionNumber: number, raw: string, createdById: string | null, at: Date, source: "SUBMITTER" | "MONITOR" = "SUBMITTER") {
  const ex = extractContent(raw);
  const v = await db.submissionVersion.create({
    data: {
      submissionId,
      versionNumber,
      contentText: ex.text,
      contentHash: createHash("sha256").update(ex.text).digest("hex"),
      source,
      createdById,
      extractionMeta: ex.meta as unknown as Prisma.InputJsonValue,
      createdAt: at,
    },
  });
  await writeAudit({ actorId: createdById, action: versionNumber === 1 ? "SUBMISSION_CREATED" : "VERSION_CREATED", entityType: "Submission", entityId: submissionId, metadata: { versionNumber, source }, createdAt: at });

  const rec = replay?.[sampleIdFor(raw) ?? ""];
  if (rec) {
    const { review } = await reviewVersion(v.id, {
      at: new Date(at.getTime() + 15_000),
      deps: { mode: "live", getCached: async () => rec.review, log: async () => {} },
    });
    await db.aiReview.update({ where: { id: review.id }, data: { cacheHit: false, latencyMs: rec.latencyMs, model: rec.model } });
    await db.llmCall.create({
      data: {
        purpose: "REVIEW",
        model: rec.model,
        promptVersion: "reviewer.v1",
        inputTokens: rec.usage.inputTokens,
        cachedInputTokens: rec.usage.cachedInputTokens,
        outputTokens: rec.usage.outputTokens,
        reasoningTokens: rec.usage.reasoningTokens,
        costUsd: computeCostUsd(rec.usage),
        latencyMs: rec.latencyMs,
        success: true,
        submissionVersionId: v.id,
        createdAt: new Date(at.getTime() + 14_000),
      },
    });
  } else {
    await reviewVersion(v.id, { at: new Date(at.getTime() + 15_000), deps: { mode: "mock" } });
  }
  return v;
}

const sampleByContent = new Map<string, string>();
function sampleIdFor(raw: string) {
  return sampleByContent.get(raw);
}

async function createSubmission(opts: {
  sample: Sample;
  title?: string;
  submitterId: string;
  at: Date;
  launchDate?: Date | null;
  sourceUrl?: string;
  assignedReviewerId?: string;
  notes?: string;
}) {
  const s = opts.sample;
  const sub = await db.submission.create({
    data: {
      title: opts.title ?? s.title,
      product: s.product,
      channel: s.channel,
      status: "IN_REVIEW",
      submitterId: opts.submitterId,
      affiliateId: s.affiliateSlug === "loanfinderhub" ? "aff_lfh" : s.affiliateSlug === "creditcompass" ? "aff_cc" : null,
      assignedReviewerId: opts.assignedReviewerId,
      launchDate: opts.launchDate ?? null,
      sourceUrl: opts.sourceUrl,
      notes: opts.notes,
      createdAt: opts.at,
    },
  });
  const v = await addVersion(sub.id, 1, s.content, opts.submitterId, opts.at);
  return { sub, v };
}

async function decide(
  submissionId: string,
  versionId: string,
  reviewerId: string,
  outcome: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
  at: Date,
  reason?: string,
) {
  // Reviewer opened the item shortly before deciding; findings get triaged.
  await db.submission.update({ where: { id: submissionId }, data: { firstOpenedByReviewerAt: new Date(at.getTime() - 20 * 60_000) } });
  const findings = await db.finding.findMany({ where: { versionId, decision: "PENDING" } });
  for (const f of findings) {
    const dismiss = f.source === "LLM" && (f.confidence ?? 1) < 0.6;
    await db.finding.update({
      where: { id: f.id },
      data: dismiss
        ? { decision: "DISMISSED", dismissReason: "FALSE_POSITIVE", dismissNote: "Low-confidence AI finding; acceptable in context.", decidedById: reviewerId, decidedAt: at }
        : { decision: "ACCEPTED", decidedById: reviewerId, decidedAt: at },
    });
    await writeAudit({ actorId: reviewerId, action: dismiss ? "FINDING_DISMISSED" : "FINDING_ACCEPTED", entityType: "Finding", entityId: f.id, metadata: { ruleCode: f.ruleCode, submissionId }, createdAt: at });
  }
  await db.decision.create({ data: { submissionId, versionId, reviewerId, outcome, reason, createdAt: at } });
  await db.submission.update({
    where: { id: submissionId },
    data: { status: outcome, decidedAt: outcome === "CHANGES_REQUESTED" ? null : at, assignedReviewerId: reviewerId },
  });
  await writeAudit({ actorId: reviewerId, action: `DECISION_${outcome}`, entityType: "Submission", entityId: submissionId, metadata: { versionId, reason: reason ?? null }, createdAt: at });
}

async function comment(submissionId: string, versionId: string | null, authorId: string, body: string, at: Date) {
  await db.comment.create({ data: { submissionId, versionId, authorId, body, createdAt: at } });
  await writeAudit({ actorId: authorId, action: "COMMENT_ADDED", entityType: "Submission", entityId: submissionId, metadata: { body: body.slice(0, 200) }, createdAt: at });
}

async function main() {
  const { SAMPLES } = await import("@/lib/samples");
  for (const s of SAMPLES) sampleByContent.set(s.content, s.id);

  console.log(`Seeding (AI reviews: ${replay ? "replayed real model output" : "mock fixtures"})…`);
  await reset();

  await db.affiliate.createMany({
    data: [
      { id: "aff_lfh", name: "LoanFinderHub", website: "loanfinderhub.example", slug: "loanfinderhub" },
      { id: "aff_cc", name: "CreditCompass", website: "creditcompass.example", slug: "creditcompass" },
    ],
  });
  await db.user.createMany({ data: USERS.map((u) => ({ ...u })) });
  await db.rule.createMany({ data: RULE_CATALOG.map((r) => ({ ...r })) });
  await db.ruleSetVersion.create({ data: { version: 1, changeNote: "Initial rule library (18 rules) from docs/RULES.md", createdAt: daysAgo(30) } });

  await db.demoAffiliatePage.createMany({
    data: [
      { slug: "loanfinderhub-best-loans", title: "LoanFinderHub — Best Personal Loans of 2026", approvedHtml: getSample("S8").content },
      { slug: "creditcompass-rewards-review", title: "CreditCompass — ClearPath Rewards Card Review", approvedHtml: getSample("S13a").content, changedHtml: getSample("S13b").content },
    ],
  });

  // --- Historic, decided items (dashboard analytics) ---
  const s12 = await createSubmission({ sample: getSample("S12"), submitterId: "u_maya", at: daysAgo(27, 3) });
  await decide(s12.sub.id, s12.v.id, "u_elena", "APPROVED", daysAgo(26, 20));

  const x7 = await createSubmission({ sample: getSample("X7"), title: "Trustpilot rating landing page", submitterId: "u_maya", at: daysAgo(24, 5) });
  await decide(x7.sub.id, x7.v.id, "u_sam", "APPROVED", daysAgo(23, 22));

  const x6 = await createSubmission({ sample: getSample("X6"), title: "Mortgage prequal display banner", submitterId: "u_diego", at: daysAgo(22, 4) });
  await decide(x6.sub.id, x6.v.id, "u_elena", "REJECTED", daysAgo(20, 1), "Banner retired; mortgage team will resubmit with Equal Housing logo.");

  const x5 = await createSubmission({ sample: getSample("X5"), title: "CreditCompass Instagram post — Rewards Card", submitterId: "u_priya", at: daysAgo(19, 6) });
  await decide(x5.sub.id, x5.v.id, "u_sam", "APPROVED", daysAgo(18, 2));

  const s13 = await createSubmission({
    sample: getSample("S13a"),
    title: "CreditCompass — Rewards Card review page",
    submitterId: "u_priya",
    at: daysAgo(15, 2),
    sourceUrl: "/demo/affiliates/creditcompass-rewards-review",
  });
  await decide(s13.sub.id, s13.v.id, "u_elena", "APPROVED", daysAgo(14, 20));
  await db.monitoredUrl.create({
    data: {
      submissionId: s13.sub.id,
      url: "/demo/affiliates/creditcompass-rewards-review",
      approvedHash: s13.v.contentHash,
      lastHash: s13.v.contentHash,
      lastCheckedAt: daysAgo(1, 3),
      status: "OK",
    },
  });

  const x8 = await createSubmission({ sample: getSample("X8"), title: "SMS — pre-selected offer", submitterId: "u_diego", at: daysAgo(12, 2) });
  await decide(x8.sub.id, x8.v.id, "u_sam", "REJECTED", daysAgo(11, 21), '"Pre-selected" requires a prescreened firm offer; this list was not prescreened.');

  const s12b = await createSubmission({ sample: getSample("S4"), submitterId: "u_maya", at: daysAgo(9, 4) });
  await decide(s12b.sub.id, s12b.v.id, "u_sam", "APPROVED", daysAgo(8, 23));

  // Shift-left: the submitter fixed the AI-flagged issues before a reviewer ever opened it.
  const sl = await createSubmission({ sample: getSample("S3"), title: "Rewards Card launch post", submitterId: "u_maya", at: daysAgo(6, 5) });
  await db.submission.update({ where: { id: sl.sub.id }, data: { currentVersionNumber: 2 } });
  const sl2 = await addVersion(sl.sub.id, 2, getSample("S4").content, "u_maya", daysAgo(6, 4));
  await decide(sl.sub.id, sl2.id, "u_sam", "APPROVED", daysAgo(5, 22));

  const s7 = await createSubmission({ sample: getSample("S7"), submitterId: "u_diego", at: daysAgo(8, 1) });
  await comment(s7.sub.id, s7.v.id, "u_elena", "No STOP language and \"pre-approved\" without a prescreen list. Rejecting — please use the approved SMS template.", daysAgo(7, 21));
  await decide(s7.sub.id, s7.v.id, "u_elena", "REJECTED", daysAgo(7, 21), "Pre-approved claim without prescreened firm offer; missing TCPA opt-out.");

  const s11 = await createSubmission({ sample: getSample("S11"), submitterId: "u_diego", at: daysAgo(4, 2) });
  await decide(s11.sub.id, s11.v.id, "u_elena", "APPROVED", daysAgo(3, 22));

  const x2 = await createSubmission({ sample: getSample("X2"), title: "Rewards Card offer email", submitterId: "u_maya", at: daysAgo(3, 1), launchDate: inDays(6) });
  await comment(x2.sub.id, x2.v.id, "u_sam", "Promo terms look good. Please add our postal address to the footer.", daysAgo(2, 20));
  await decide(x2.sub.id, x2.v.id, "u_sam", "CHANGES_REQUESTED", daysAgo(2, 20));

  // --- S1 → changes requested, then fixed v2 (= S2) awaiting review: shows diff + resolved findings ---
  const s1 = await createSubmission({ sample: getSample("S1"), title: "Spring personal loan email", submitterId: "u_diego", at: daysAgo(2, 6), launchDate: inDays(2), assignedReviewerId: "u_sam" });
  await comment(s1.sub.id, s1.v.id, "u_sam", "Guaranteed approval and the \"You're APPROVED\" subject line can't go out. Please add the APR example, footer address and unsubscribe link.", daysAgo(2, 2));
  await decide(s1.sub.id, s1.v.id, "u_sam", "CHANGES_REQUESTED", daysAgo(2, 2));
  await comment(s1.sub.id, null, "u_diego", "Updated with the standard APR example, footer and soft-pull language. Thanks!", daysAgo(1, 4));
  await db.submission.update({ where: { id: s1.sub.id }, data: { status: "IN_REVIEW", currentVersionNumber: 2 } });
  await addVersion(s1.sub.id, 2, getSample("S2").content, "u_diego", daysAgo(1, 4));

  // --- Open queue ---
  await createSubmission({ sample: getSample("S8"), submitterId: "u_jordan", at: daysAgo(0, 5), sourceUrl: "/demo/affiliates/loanfinderhub-best-loans", notes: "Updated comparison page for Q4." });
  await createSubmission({ sample: getSample("S3"), submitterId: "u_maya", at: daysAgo(1, 2), launchDate: inDays(1), notes: "Needs to go live with the Friday campaign." });
  await createSubmission({ sample: getSample("S5"), submitterId: "u_diego", at: daysAgo(3, 3), launchDate: inDays(5), assignedReviewerId: "u_elena" });
  await createSubmission({ sample: getSample("S6"), submitterId: "u_priya", at: daysAgo(1, 7) });
  await createSubmission({ sample: getSample("S9"), submitterId: "u_maya", at: daysAgo(2, 1), launchDate: inDays(10) });
  await createSubmission({ sample: getSample("S10"), submitterId: "u_diego", at: daysAgo(0, 9) });

  for (const sub of await db.submission.findMany({ select: { id: true } })) await refreshPriority(sub.id);

  const counts = { submissions: await db.submission.count(), findings: await db.finding.count(), audit: await db.auditEvent.count() };
  console.log("Seeded", counts);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
