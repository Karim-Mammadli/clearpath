import type { Prisma } from "@/generated/prisma/client";

export type AuditFilter = { action?: string; actor?: string; entity?: string };

export function auditWhere(sp: AuditFilter): Prisma.AuditEventWhereInput {
  return {
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.actor ? { actorId: sp.actor === "system" ? null : sp.actor } : {}),
    ...(sp.entity ? { OR: [{ entityId: sp.entity }, { metadata: { path: ["submissionId"], equals: sp.entity } }] } : {}),
  };
}
