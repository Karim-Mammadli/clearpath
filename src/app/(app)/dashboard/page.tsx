import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { DecisionsChart, TopRulesChart } from "@/components/charts";
import { PageHeader, Panel, Stat } from "@/components/page-header";
import { SubmissionTable } from "@/components/submission-table";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, isReviewer, submissionScope } from "@/lib/auth";
import { dashboardMetrics, formatDuration } from "@/lib/metrics";
import { listSubmissions } from "@/lib/queries";
import { db } from "@/lib/db";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await getCurrentUser();
  const { denied } = await searchParams;

  if (!isReviewer(user)) {
    const rows = await listSubmissions(user.role === "AFFILIATE" ? submissionScope(user) : { submitterId: user.id });
    const needsAction = rows.filter((r) => r.status === "CHANGES_REQUESTED" || r.status === "DRIFT_DETECTED");
    return (
      <div className="space-y-6">
        {denied && <DeniedNotice />}
        <PageHeader
          title={`Welcome, ${user.name.split(" ")[0]}`}
          description="Submit marketing content for compliance review. The AI pre-check runs instantly, so you can fix issues before a reviewer ever opens it."
          actions={<Link href="/submit" className={buttonVariants()}>Submit content</Link>}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="My submissions" value={rows.length} />
          <Stat label="In review" value={rows.filter((r) => r.status === "IN_REVIEW").length} />
          <Stat label="Needs my action" value={needsAction.length} />
          <Stat label="Approved" value={rows.filter((r) => r.status === "APPROVED").length} />
        </div>
        <Panel title="My items">
          <SubmissionTable rows={rows} empty="No submissions yet. Submit your first piece of content." />
        </Panel>
      </div>
    );
  }

  const m = await dashboardMetrics();
  const llm = m.precision.LLM;
  const det = m.precision.DETERMINISTIC;
  const pct = (p?: { accepted: number; dismissed: number }) =>
    p && p.accepted + p.dismissed > 0 ? `${Math.round((100 * p.accepted) / (p.accepted + p.dismissed))}%` : "—";
  const open = { status: { in: ["IN_REVIEW", "DRIFT_DETECTED"] as ("IN_REVIEW" | "DRIFT_DETECTED")[] } };
  const [mine, unassigned, reviewers] = await Promise.all([
    listSubmissions({ assignedReviewerId: user.id, ...open }, [{ priorityScore: "desc" }]),
    listSubmissions({ assignedReviewerId: null, ...open }, [{ priorityScore: "desc" }]),
    db.user.findMany({ where: { role: { in: ["REVIEWER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      {denied && <DeniedNotice />}
      <PageHeader
        title="Compliance dashboard"
        description="Throughput and quality of marketing compliance review."
        actions={<Link href="/queue" className={buttonVariants()}>Open review queue</Link>}
      />
      {m.openDrift > 0 && (
        <Link href="/queue?tab=drift" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100">
          <AlertTriangle className="size-4" />
          <span>
            <strong>{m.openDrift}</strong> approved affiliate page{m.openDrift > 1 ? "s have" : " has"} changed since approval. Review drift alerts →
          </span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Submissions this week" value={m.submissionsThisWeek} />
        <Stat label="Awaiting review" value={m.awaitingReview} hint={`${m.openDrift} drift alert(s)`} />
        <Stat label="Median time to first decision" value={formatDuration(m.medianTimeToDecisionMs)} hint="Excel + email baseline: ~3 days (assumed)" />
        <Stat label="First-pass approval rate" value={m.firstPassApprovalRate === null ? "—" : `${Math.round(m.firstPassApprovalRate * 100)}%`} />
        <Stat label="Issues fixed before human review" value={m.caughtEarly} hint="Caught by the AI pre-check and fixed by the submitter (shift-left)" />
        <Stat label="AI finding precision (reviewer-accepted)" value={pct(llm)} hint={llm ? `${llm.accepted} accepted · ${llm.dismissed} dismissed` : undefined} />
        <Stat label="Rule-based precision" value={pct(det)} hint={det ? `${det.accepted} accepted · ${det.dismissed} dismissed` : undefined} />
        <Stat
          label="Affiliates with most findings"
          value={<span className="text-base">{m.topAffiliates[0] ? `${m.topAffiliates[0].name} (${m.topAffiliates[0].count})` : "—"}</span>}
          hint={m.topAffiliates.slice(1).map((a) => `${a.name} (${a.count})`).join(", ") || undefined}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Decisions per week">
          <DecisionsChart data={m.weeks} />
        </Panel>
        <Panel title="Top violated rules (open + accepted findings)">
          {m.topRules.length ? <TopRulesChart data={m.topRules} /> : <p className="text-sm text-muted-foreground">No findings yet.</p>}
        </Panel>
      </div>
      <Panel title="Assigned to me">
        <SubmissionTable rows={mine} showPriority reviewers={reviewers} empty="Nothing assigned to you. Pick items from the queue." />
      </Panel>
      <Panel title={`Unassigned (${unassigned.length}): needs an owner`}>
        <SubmissionTable rows={unassigned} showPriority reviewers={reviewers} empty="Every open item has an owner." />
      </Panel>
    </div>
  );
}

function DeniedNotice() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
      Your current role doesn&apos;t have access to that page.
    </div>
  );
}
