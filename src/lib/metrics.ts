import { db } from "@/lib/db";

const DAY = 86_400_000;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export async function dashboardMetrics() {
  const now = Date.now();
  const [subs, decisions, findings, affiliates] = await Promise.all([
    db.submission.findMany({ include: { versions: { select: { versionNumber: true, createdAt: true, id: true } } } }),
    db.decision.findMany({ orderBy: { createdAt: "asc" } }),
    db.finding.findMany({
      select: { ruleCode: true, source: true, decision: true, versionId: true, version: { select: { submissionId: true, versionNumber: true, createdAt: true, submission: { select: { affiliateId: true, firstOpenedByReviewerAt: true, currentVersionNumber: true } } } } },
    }),
    db.affiliate.findMany(),
  ]);

  const weekAgo = now - 7 * DAY;
  const submissionsThisWeek = subs.filter((s) => s.createdAt.getTime() >= weekAgo).length;
  const awaitingReview = subs.filter((s) => s.status === "IN_REVIEW" || s.status === "DRIFT_DETECTED").length;
  const openDrift = subs.filter((s) => s.status === "DRIFT_DETECTED").length;

  // Time to first decision, first-pass approval.
  const firstDecision = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) if (!firstDecision.has(d.submissionId)) firstDecision.set(d.submissionId, d);
  const ttd: number[] = [];
  let firstPassApproved = 0;
  for (const s of subs) {
    const d = firstDecision.get(s.id);
    if (!d) continue;
    ttd.push(d.createdAt.getTime() - s.createdAt.getTime());
    if (d.outcome === "APPROVED") firstPassApproved++;
  }

  // Issues caught by the AI pre-check and fixed by the submitter before a reviewer opened the item:
  // findings on superseded versions that were created before the reviewer's first open.
  let caughtEarly = 0;
  for (const f of findings) {
    const v = f.version;
    const superseded = v.versionNumber < v.submission.currentVersionNumber;
    const opened = v.submission.firstOpenedByReviewerAt;
    if (superseded && (!opened || opened.getTime() > v.createdAt.getTime())) {
      // only counts if the issue no longer appears on a later version (approximation: superseded)
      caughtEarly++;
    }
  }

  // Top violated rules (non-dismissed), affiliates with most findings.
  const ruleCounts = new Map<string, number>();
  const affCounts = new Map<string, number>();
  for (const f of findings) {
    if (f.decision === "DISMISSED") continue;
    ruleCounts.set(f.ruleCode, (ruleCounts.get(f.ruleCode) ?? 0) + 1);
    const a = f.version.submission.affiliateId;
    if (a) affCounts.set(a, (affCounts.get(a) ?? 0) + 1);
  }
  const topRules = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rule, count]) => ({ rule, count }));
  const topAffiliates = [...affCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ name: affiliates.find((x) => x.id === id)?.name ?? id, count }));

  // AI precision proxy per source = accepted / (accepted + dismissed).
  const precision: Record<string, { accepted: number; dismissed: number; pending: number }> = {};
  for (const f of findings) {
    const p = (precision[f.source] ??= { accepted: 0, dismissed: 0, pending: 0 });
    if (f.decision === "ACCEPTED") p.accepted++;
    else if (f.decision === "DISMISSED") p.dismissed++;
    else p.pending++;
  }

  // Decisions per week (last 5 weeks).
  const weeks: { week: string; APPROVED: number; CHANGES_REQUESTED: number; REJECTED: number }[] = [];
  for (let i = 4; i >= 0; i--) {
    const start = now - (i + 1) * 7 * DAY;
    const end = now - i * 7 * DAY;
    const inWeek = decisions.filter((d) => d.createdAt.getTime() >= start && d.createdAt.getTime() < end);
    weeks.push({
      week: i === 0 ? "This week" : `${i}w ago`,
      APPROVED: inWeek.filter((d) => d.outcome === "APPROVED").length,
      CHANGES_REQUESTED: inWeek.filter((d) => d.outcome === "CHANGES_REQUESTED").length,
      REJECTED: inWeek.filter((d) => d.outcome === "REJECTED").length,
    });
  }

  return {
    submissionsThisWeek,
    awaitingReview,
    openDrift,
    medianTimeToDecisionMs: median(ttd),
    firstPassApprovalRate: firstDecision.size ? firstPassApproved / firstDecision.size : null,
    caughtEarly,
    totalFindings: findings.length,
    topRules,
    topAffiliates,
    precision,
    weeks,
  };
}
