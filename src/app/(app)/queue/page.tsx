import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/page-header";
import { SubmissionTable } from "@/components/submission-table";
import { isReviewer, requireRole } from "@/lib/auth";
import { ROUTING } from "@/lib/config";
import { db } from "@/lib/db";
import { CHANNELS, PRODUCTS, RISK_LEVELS, label } from "@/lib/domain";
import { listSubmissions } from "@/lib/queries";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "needs", label: "Needs review", where: { status: { in: ["IN_REVIEW", "DRIFT_DETECTED"] } } },
  { id: "changes", label: "Changes requested", where: { status: "CHANGES_REQUESTED" } },
  { id: "approved", label: "Approved", where: { status: "APPROVED" } },
  { id: "drift", label: "Drift alerts", where: { status: "DRIFT_DETECTED" } },
  { id: "all", label: "All", where: {} },
] as const;

type SP = { tab?: string; risk?: string; product?: string; channel?: string; affiliate?: string; assignee?: string; mine?: string };

export default async function QueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole(isReviewer);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab) ?? TABS[0];

  const where: Prisma.SubmissionWhereInput = { ...(tab.where as Prisma.SubmissionWhereInput) };
  if (sp.product && (PRODUCTS as readonly string[]).includes(sp.product)) where.product = sp.product as Prisma.SubmissionWhereInput["product"];
  if (sp.channel && (CHANNELS as readonly string[]).includes(sp.channel)) where.channel = sp.channel as Prisma.SubmissionWhereInput["channel"];
  if (sp.affiliate === "none") where.affiliateId = null;
  else if (sp.affiliate) where.affiliateId = sp.affiliate;
  const assignee = sp.assignee ?? (sp.mine === "1" ? "me" : "");
  if (assignee === "me") where.assignedReviewerId = user.id;
  else if (assignee === "none") where.assignedReviewerId = null;
  else if (assignee) where.assignedReviewerId = assignee;

  const [rowsAll, affiliates, counts, reviewers] = await Promise.all([
    listSubmissions(where, [{ priorityScore: "desc" }, { createdAt: "asc" }]),
    db.affiliate.findMany({ orderBy: { name: "asc" } }),
    Promise.all(TABS.map((t) => db.submission.count({ where: t.where as Prisma.SubmissionWhereInput }))),
    db.user.findMany({ where: { role: { in: ["REVIEWER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const rows = sp.risk && (RISK_LEVELS as readonly string[]).includes(sp.risk) ? rowsAll.filter((r) => r.riskLevel === sp.risk) : rowsAll;

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/queue?${p.toString()}`;
  };
  const sel = "h-8 rounded-md border bg-card px-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Review queue"
        description={
          <>
            Sorted by priority = risk score + launch urgency + age in queue + affiliate source + drift. New submissions are auto-assigned:{" "}
            {ROUTING.map((r) => r.label).join("; ")}; otherwise to the least-loaded reviewer. Reassign from any submission page.
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1 border-b">
        {TABS.map((t, i) => (
          <Link
            key={t.id}
            href={qs({ tab: t.id })}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", t.id === tab.id ? "border-zinc-900 font-medium" : "border-transparent text-muted-foreground hover:text-zinc-900")}
          >
            {t.label} <span className="ml-1 rounded bg-zinc-100 px-1.5 text-xs tabular-nums">{counts[i]}</span>
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2" action="/queue">
        <input type="hidden" name="tab" value={tab.id} />
        <select name="risk" defaultValue={sp.risk ?? ""} className={sel}>
          <option value="">Any risk</option>
          {RISK_LEVELS.map((r) => (
            <option key={r} value={r}>
              {r === "CLEAR" ? "Clear (fast lane)" : r.charAt(0) + r.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <select name="product" defaultValue={sp.product ?? ""} className={sel}>
          <option value="">Any product</option>
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={sp.channel ?? ""} className={sel}>
          <option value="">Any channel</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        <select name="affiliate" defaultValue={sp.affiliate ?? ""} className={sel}>
          <option value="">Any source</option>
          <option value="none">First-party only</option>
          {affiliates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="assignee" defaultValue={assignee} className={sel}>
          <option value="">Any assignee</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {reviewers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="h-8 rounded-md border bg-primary px-3 text-sm text-primary-foreground">Apply</button>
        <Link href={`/queue?tab=${tab.id}`} className="text-xs text-muted-foreground hover:underline">
          Reset
        </Link>
      </form>
      <SubmissionTable rows={rows} showPriority empty="Queue is empty for these filters." />
    </div>
  );
}
