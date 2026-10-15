import { getCurrentUser, isReviewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditWhere } from "@/lib/audit-query";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Neutralize spreadsheet formula injection (cells opened in Excel).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!isReviewer(user)) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const events = await db.auditEvent.findMany({ where: auditWhere(sp), orderBy: { createdAt: "asc" }, include: { actor: true } });
  const header = ["timestamp", "actor", "actor_role", "action", "entity_type", "entity_id", "metadata"];
  const lines = events.map((e) =>
    [e.createdAt.toISOString(), e.actor?.name ?? "System", e.actor?.role ?? "", e.action, e.entityType, e.entityId, e.metadata].map(csvCell).join(","),
  );
  const body = [header.join(","), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="clearpath-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
