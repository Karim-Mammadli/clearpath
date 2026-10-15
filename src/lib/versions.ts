import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { extractContent } from "@/lib/extract";
import { reviewVersion } from "@/lib/review/pipeline";

export function contentHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** Creates the next SubmissionVersion from raw content (text or HTML) and runs the review pipeline. */
export async function createVersionAndReview(opts: {
  submissionId: string;
  versionNumber: number;
  raw: string;
  createdById: string | null;
  source: "SUBMITTER" | "REWRITE" | "MONITOR";
}) {
  const ex = extractContent(opts.raw);
  const version = await db.submissionVersion.create({
    data: {
      submissionId: opts.submissionId,
      versionNumber: opts.versionNumber,
      contentText: ex.text,
      contentHash: contentHash(ex.text),
      source: opts.source,
      createdById: opts.createdById,
      extractionMeta: ex.meta as unknown as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    actorId: opts.createdById,
    action: opts.versionNumber === 1 ? "SUBMISSION_CREATED" : "VERSION_CREATED",
    entityType: "Submission",
    entityId: opts.submissionId,
    metadata: { versionNumber: opts.versionNumber, source: opts.source, versionId: version.id },
  });
  const { review } = await reviewVersion(version.id, { actorId: opts.createdById });
  return { version, review };
}

/** Next version number (max + 1; robust to the demo reset pointing "current" at an older version). */
export async function nextVersionNumber(submissionId: string) {
  const agg = await db.submissionVersion.aggregate({ where: { submissionId }, _max: { versionNumber: true } });
  return (agg._max.versionNumber ?? 0) + 1;
}
