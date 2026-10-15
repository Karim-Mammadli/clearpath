import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type Tx = Pick<typeof db, "auditEvent">;

export type AuditAction =
  | "SUBMISSION_CREATED"
  | "VERSION_CREATED"
  | "AI_REVIEW_COMPLETED"
  | "FINDING_ACCEPTED"
  | "FINDING_DISMISSED"
  | "FINDING_REOPENED"
  | "FINDING_ADDED"
  | "COMMENT_ADDED"
  | "DECISION_APPROVED"
  | "DECISION_CHANGES_REQUESTED"
  | "DECISION_REJECTED"
  | "APPROVAL_OVERRIDE"
  | "SUBMISSION_ASSIGNED"
  | "MONITOR_CHECKED"
  | "DRIFT_DETECTED"
  | "AFFILIATE_PAGE_EDIT_SIMULATED"
  | "AFFILIATE_PAGE_RESET"
  | "ROLE_SWITCHED";

/**
 * The ONLY way audit events are created. The table is append-only: nothing in the app
 * updates or deletes AuditEvent rows.
 */
export async function writeAudit(
  event: {
    actorId: string | null;
    action: AuditAction;
    entityType: "Submission" | "SubmissionVersion" | "Finding" | "MonitoredUrl" | "DemoAffiliatePage" | "User";
    entityId: string;
    metadata?: Prisma.InputJsonValue;
    createdAt?: Date;
  },
  tx: Tx = db,
) {
  await tx.auditEvent.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata ?? {},
      ...(event.createdAt ? { createdAt: event.createdAt } : {}),
    },
  });
}
