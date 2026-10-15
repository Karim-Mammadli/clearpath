import { ROUTING } from "@/lib/config";
import { db } from "@/lib/db";

/** Picks the reviewer for a new submission: first matching routing rule, else least-loaded reviewer. */
export async function routeSubmission(s: { product: string; channel: string; affiliateId: string | null }): Promise<{ reviewerId: string | null; reason: string }> {
  const reviewers = await db.user.findMany({ where: { role: "REVIEWER" }, select: { id: true, name: true } });
  for (const r of ROUTING) {
    const w = r.when;
    if (w.product && w.product !== s.product) continue;
    if (w.channel && w.channel !== s.channel) continue;
    if (w.affiliate !== undefined && w.affiliate !== !!s.affiliateId) continue;
    if (reviewers.some((u) => u.id === r.reviewerId)) return { reviewerId: r.reviewerId, reason: r.label };
  }
  if (reviewers.length === 0) return { reviewerId: null, reason: "No reviewers available" };
  const loads = await Promise.all(
    reviewers.map(async (u) => ({ u, n: await db.submission.count({ where: { assignedReviewerId: u.id, status: { in: ["IN_REVIEW", "DRIFT_DETECTED"] } } }) })),
  );
  loads.sort((a, b) => a.n - b.n);
  return { reviewerId: loads[0].u.id, reason: `Least-loaded reviewer (${loads[0].u.name}, ${loads[0].n} open)` };
}
