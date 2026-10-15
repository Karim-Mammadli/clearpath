import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SeverityCode } from "@/lib/domain";
import { computeRisk } from "@/lib/review/scoring";

/** Submission rows for list views, with current-version risk and open finding counts computed in code. */
export async function listSubmissions(where: Prisma.SubmissionWhereInput, orderBy: Prisma.SubmissionOrderByWithRelationInput[] = [{ updatedAt: "desc" }]) {
  const subs = await db.submission.findMany({
    where,
    orderBy,
    include: {
      submitter: { select: { name: true } },
      affiliate: { select: { name: true } },
      assignedReviewer: { select: { name: true, id: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          findings: { select: { severity: true, decision: true } },
          aiReviews: { orderBy: { createdAt: "desc" }, take: 1, select: { injectionSuspected: true, mode: true, status: true } },
        },
      },
    },
  });
  return subs.map((s) => {
    const v = s.versions[0];
    const findings = v?.findings ?? [];
    const injection = v?.aiReviews[0]?.injectionSuspected ?? false;
    const risk = computeRisk(findings.map((f) => ({ severity: f.severity as SeverityCode, decision: f.decision })), injection);
    return {
      id: s.id,
      title: s.title,
      product: s.product,
      channel: s.channel,
      status: s.status,
      submitter: s.submitter.name,
      affiliate: s.affiliate?.name ?? null,
      assignee: s.assignedReviewer?.name ?? null,
      assigneeId: s.assignedReviewer?.id ?? null,
      version: s.currentVersionNumber,
      launchDate: s.launchDate,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      priorityScore: s.priorityScore,
      openFindings: findings.filter((f) => f.decision !== "DISMISSED").length,
      riskScore: risk.score,
      riskLevel: risk.level,
      injection,
      aiMode: v?.aiReviews[0]?.mode ?? null,
    };
  });
}

export type SubmissionRow = Awaited<ReturnType<typeof listSubmissions>>[number];
