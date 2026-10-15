import Link from "next/link";
import { Download } from "lucide-react";
import { auditWhere, type AuditFilter } from "@/lib/audit-query";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { isReviewer, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

type SP = AuditFilter;

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole(isReviewer);
  const sp = await searchParams;
  const [events, actions, users, total] = await Promise.all([
    db.auditEvent.findMany({ where: auditWhere(sp), orderBy: { createdAt: "desc" }, take: 300, include: { actor: true } }),
    db.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.auditEvent.count({ where: auditWhere(sp) }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const sel = "h-8 rounded-md border bg-white px-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Append-only record of every state change: submissions, versions, AI reviews, finding decisions, comments, approvals and overrides, monitoring."
        actions={
          <a href={`/audit/export${qs ? `?${qs}` : ""}`} className={buttonVariants({ variant: "outline" })}>
            <Download /> Export CSV
          </a>
        }
      />
      <form action="/audit" className="mb-4 flex flex-wrap items-center gap-2">
        <select name="action" defaultValue={sp.action ?? ""} className={sel}>
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {a.action}
            </option>
          ))}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""} className={sel}>
          <option value="">All actors</option>
          <option value="system">System</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input name="entity" defaultValue={sp.entity ?? ""} placeholder="Submission / entity id" className={`${sel} w-56`} />
        <button className="h-8 rounded-md border bg-zinc-900 px-3 text-sm text-white">Filter</button>
        <Link href="/audit" className="text-xs text-muted-foreground hover:underline">
          Reset
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">
          Showing {events.length} of {total}
        </span>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const meta = e.metadata as Record<string, unknown>;
              const subId = e.entityType === "Submission" ? e.entityId : typeof meta.submissionId === "string" ? meta.submissionId : null;
              return (
                <tr key={e.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground">{e.createdAt.toLocaleString("en-US")}</td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">{e.actor?.name ?? "System"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.action}</td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                    {subId ? (
                      <Link href={`/submissions/${subId}`} className="text-indigo-700 hover:underline">
                        {e.entityType} {e.entityId.slice(-6)}
                      </Link>
                    ) : (
                      `${e.entityType} ${e.entityId.slice(-6)}`
                    )}
                  </td>
                  <td className="max-w-[28rem] truncate px-3 py-1.5 font-mono text-[11px] text-zinc-600" title={JSON.stringify(meta)}>
                    {JSON.stringify(meta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
