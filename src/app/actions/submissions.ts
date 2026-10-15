"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canSubmit, canViewSubmission, getCurrentUser, isReviewer, type CurrentUser } from "@/lib/auth";
import { REVIEW } from "@/lib/config";
import { db } from "@/lib/db";
import { CHANNELS, DISMISS_REASONS, PRODUCTS } from "@/lib/domain";
import { FetchBlockedError, safeFetchHtml } from "@/lib/fetch";
import { appOrigin } from "@/lib/origin";
import { refreshPriority } from "@/lib/review/pipeline";
import { createVersionAndReview, nextVersionNumber } from "@/lib/versions";

export type FormState = { error?: string; ok?: boolean } | undefined;

const SubmitSchema = z
  .object({
    title: z.string().trim().min(3, "Title is required").max(140),
    product: z.enum(PRODUCTS),
    channel: z.enum(CHANNELS),
    content: z.string().max(REVIEW.maxContentChars, `Content is limited to ${REVIEW.maxContentChars} characters`).optional(),
    url: z.string().trim().max(2000).optional(),
    launchDate: z.string().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => (v.content?.trim() ?? "") !== "" || (v.url ?? "") !== "", { message: "Paste content or provide a URL" });

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const { html } = await safeFetchHtml(url, await appOrigin());
    return html;
  } catch (e) {
    if (e instanceof FetchBlockedError) throw new Error(`URL blocked: ${e.message}`);
    throw new Error(`Could not fetch URL: ${(e as Error).message}`);
  }
}

export async function createSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!canSubmit(user)) return { error: "Your role cannot submit content." };

  const parsed = SubmitSchema.safeParse({
    title: formData.get("title"),
    product: formData.get("product"),
    channel: formData.get("channel"),
    content: formData.get("content") || undefined,
    url: formData.get("url") || undefined,
    launchDate: formData.get("launchDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  let raw = v.content?.trim() ?? "";
  if (!raw && v.url) {
    try {
      raw = await fetchUrlContent(v.url);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  if (!raw.trim()) return { error: "The content is empty." };
  if (raw.length > REVIEW.maxContentChars * 10) return { error: "Page is too large to review." };

  const launchDate = v.launchDate ? new Date(`${v.launchDate}T12:00:00Z`) : null;
  const sub = await db.submission.create({
    data: {
      title: v.title,
      product: v.product,
      channel: v.channel,
      status: "IN_REVIEW",
      submitterId: user.id,
      affiliateId: user.role === "AFFILIATE" ? user.affiliateId : null,
      launchDate: launchDate && !Number.isNaN(launchDate.getTime()) ? launchDate : null,
      sourceUrl: v.url || null,
      notes: v.notes || null,
    },
  });
  await createVersionAndReview({ submissionId: sub.id, versionNumber: 1, raw, createdById: user.id, source: "SUBMITTER" });
  redirect(`/submissions/${sub.id}?new=1`);
}

async function loadAccessible(user: CurrentUser, submissionId: string) {
  const sub = await db.submission.findUnique({ where: { id: submissionId } });
  if (!sub || !canViewSubmission(user, sub)) throw new Error("Not found");
  return sub;
}

export async function resubmit(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const submissionId = z.string().parse(formData.get("submissionId"));
  const content = z.string().trim().min(1, "Content is empty").max(REVIEW.maxContentChars).safeParse(formData.get("content"));
  if (!content.success) return { error: content.error.issues[0]?.message };
  const sub = await loadAccessible(user, submissionId);
  if (!canSubmit(user)) return { error: "Your role cannot resubmit content." };
  if (sub.status === "APPROVED" || sub.status === "REJECTED") return { error: `This submission is ${sub.status.toLowerCase()}; create a new submission instead.` };

  const next = await nextVersionNumber(sub.id);
  await db.submission.update({ where: { id: sub.id }, data: { currentVersionNumber: next, status: "IN_REVIEW" } });
  await createVersionAndReview({ submissionId: sub.id, versionNumber: next, raw: content.data, createdById: user.id, source: "SUBMITTER" });
  revalidatePath(`/submissions/${sub.id}`);
  redirect(`/submissions/${sub.id}?diff=1`);
}

const FindingDecisionSchema = z.object({
  findingId: z.string(),
  decision: z.enum(["ACCEPTED", "DISMISSED", "PENDING"]),
  dismissReason: z.enum(DISMISS_REASONS).optional(),
  dismissNote: z.string().max(500).optional(),
});

export async function decideFinding(formData: FormData) {
  const user = await getCurrentUser();
  if (!isReviewer(user)) throw new Error("Only reviewers can triage findings");
  const v = FindingDecisionSchema.parse({
    findingId: formData.get("findingId"),
    decision: formData.get("decision"),
    dismissReason: formData.get("dismissReason") || undefined,
    dismissNote: formData.get("dismissNote") || undefined,
  });
  if (v.decision === "DISMISSED" && !v.dismissReason) throw new Error("A dismiss reason is required");
  if (v.decision === "DISMISSED" && v.dismissReason === "OTHER" && !v.dismissNote?.trim()) throw new Error("Add a note for 'Other'");

  const f = await db.finding.findUniqueOrThrow({ where: { id: v.findingId }, include: { version: true } });
  await db.finding.update({
    where: { id: f.id },
    data: {
      decision: v.decision,
      dismissReason: v.decision === "DISMISSED" ? v.dismissReason : null,
      dismissNote: v.decision === "DISMISSED" ? v.dismissNote?.trim() || null : null,
      decidedById: v.decision === "PENDING" ? null : user.id,
      decidedAt: v.decision === "PENDING" ? null : new Date(),
      previouslyDismissed: false,
    },
  });
  await writeAudit({
    actorId: user.id,
    action: v.decision === "ACCEPTED" ? "FINDING_ACCEPTED" : v.decision === "DISMISSED" ? "FINDING_DISMISSED" : "FINDING_REOPENED",
    entityType: "Finding",
    entityId: f.id,
    metadata: { submissionId: f.version.submissionId, ruleCode: f.ruleCode, source: f.source, reason: v.dismissReason ?? null, note: v.dismissNote ?? null },
  });
  await refreshPriority(f.version.submissionId);
  revalidatePath(`/submissions/${f.version.submissionId}`);
}

export async function addComment(formData: FormData) {
  const user = await getCurrentUser();
  const submissionId = z.string().parse(formData.get("submissionId"));
  const body = z.string().trim().min(1).max(4000).parse(formData.get("body"));
  const versionId = (formData.get("versionId") as string) || null;
  await loadAccessible(user, submissionId);
  await db.comment.create({ data: { submissionId, versionId, authorId: user.id, body } });
  await writeAudit({ actorId: user.id, action: "COMMENT_ADDED", entityType: "Submission", entityId: submissionId, metadata: { body: body.slice(0, 200) } });
  revalidatePath(`/submissions/${submissionId}`);
}

export async function assignToMe(formData: FormData) {
  const user = await getCurrentUser();
  if (!isReviewer(user)) throw new Error("Only reviewers can be assigned");
  const submissionId = z.string().parse(formData.get("submissionId"));
  await db.submission.update({ where: { id: submissionId }, data: { assignedReviewerId: user.id } });
  await writeAudit({ actorId: user.id, action: "SUBMISSION_ASSIGNED", entityType: "Submission", entityId: submissionId, metadata: { assignee: user.id } });
  revalidatePath(`/submissions/${submissionId}`);
}

const DecisionSchema = z.object({
  submissionId: z.string(),
  outcome: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  reason: z.string().trim().max(2000).optional(),
  overrideNote: z.string().trim().max(2000).optional(),
});

/** Human decision. AI never calls this. Approval is blocked by unresolved CRITICAL findings unless overridden with a reason. */
export async function decideSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isReviewer(user)) return { error: "Only reviewers can decide." };
  const v = DecisionSchema.parse({
    submissionId: formData.get("submissionId"),
    outcome: formData.get("outcome"),
    reason: formData.get("reason") || undefined,
    overrideNote: formData.get("overrideNote") || undefined,
  });
  const sub = await db.submission.findUniqueOrThrow({ where: { id: v.submissionId } });
  const version = await db.submissionVersion.findFirstOrThrow({
    where: { submissionId: sub.id, versionNumber: sub.currentVersionNumber },
    include: { findings: true },
  });

  if (v.outcome === "REJECTED" && !v.reason) return { error: "A reason is required to reject." };
  const blocking = version.findings.filter((f) => f.severity === "CRITICAL" && f.decision !== "DISMISSED");
  if (v.outcome === "APPROVED" && blocking.length > 0 && !v.overrideNote) {
    return { error: `Approval blocked: ${blocking.length} unresolved CRITICAL finding(s). Dismiss them with a reason, or override with a justification.` };
  }

  await db.decision.create({
    data: { submissionId: sub.id, versionId: version.id, reviewerId: user.id, outcome: v.outcome, reason: v.reason, overrideNote: v.overrideNote },
  });
  await db.submission.update({
    where: { id: sub.id },
    data: { status: v.outcome, decidedAt: v.outcome === "CHANGES_REQUESTED" ? null : new Date(), assignedReviewerId: sub.assignedReviewerId ?? user.id },
  });
  if (v.outcome === "APPROVED" && blocking.length > 0) {
    await writeAudit({ actorId: user.id, action: "APPROVAL_OVERRIDE", entityType: "Submission", entityId: sub.id, metadata: { overrideNote: v.overrideNote ?? null, blockingFindings: blocking.map((f) => f.ruleCode) } });
  }
  await writeAudit({ actorId: user.id, action: `DECISION_${v.outcome}`, entityType: "Submission", entityId: sub.id, metadata: { versionId: version.id, versionNumber: version.versionNumber, reason: v.reason ?? null } });

  // Approving a monitored page re-baselines monitoring on the approved version.
  if (v.outcome === "APPROVED") {
    await db.monitoredUrl.updateMany({ where: { submissionId: sub.id }, data: { approvedHash: version.contentHash, status: "OK" } });
    if (sub.sourceUrl && (sub.channel === "AFFILIATE_PAGE" || sub.channel === "LANDING_PAGE")) {
      const exists = await db.monitoredUrl.findUnique({ where: { submissionId: sub.id } });
      if (!exists) {
        await db.monitoredUrl.create({ data: { submissionId: sub.id, url: sub.sourceUrl, approvedHash: version.contentHash, lastHash: version.contentHash, status: "OK" } });
      }
    }
  }
  await refreshPriority(sub.id);
  revalidatePath(`/submissions/${sub.id}`);
  return { ok: true };
}
