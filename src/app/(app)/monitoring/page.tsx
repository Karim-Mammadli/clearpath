import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { resetAffiliateDemo, simulateAffiliateEdit } from "@/app/actions/monitoring";
import { StatusBadge } from "@/components/badges";
import { CheckAllButton, CheckNowButton } from "@/components/monitor-controls";
import { PageHeader, Panel } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { isAdmin, isReviewer, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const maxDuration = 120; // drift triggers a full re-review

export default async function MonitoringPage() {
  const user = await requireRole(isReviewer);
  const [monitored, pages] = await Promise.all([
    db.monitoredUrl.findMany({ include: { submission: { include: { affiliate: true } } }, orderBy: { lastCheckedAt: "desc" } }),
    db.demoAffiliatePage.findMany({ orderBy: { slug: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliate monitoring"
        description={
          <>
            Approved affiliate and landing pages are re-fetched and compared with the approved version. If the live page drifts, it is captured as a new version, re-reviewed by the same pipeline, and
            flagged in the queue. Approval is a point-in-time decision; this closes the &ldquo;approved once, then changed&rdquo; gap. (v1: on demand; scheduled checks are future work.)
          </>
        }
        actions={<CheckAllButton />}
      />
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Submission</th>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">Monitor</th>
              <th className="px-3 py-2 font-medium">Submission status</th>
              <th className="px-3 py-2 font-medium">Last checked</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {monitored.map((m) => (
              <tr key={m.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/submissions/${m.submissionId}`} className="font-medium hover:underline">
                    {m.submission.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">{m.submission.affiliate?.name ?? "First-party"}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <a href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-indigo-700 hover:underline">
                    {m.url} <ExternalLink className="size-3" />
                  </a>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">approved #{m.approvedHash.slice(0, 10)} · live #{(m.lastHash ?? "—").slice(0, 10)}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${m.status === "OK" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{m.status}</span>
                  {m.lastError && <div className="mt-1 text-xs text-red-700">{m.lastError}</div>}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={m.submission.status} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{m.lastCheckedAt ? m.lastCheckedAt.toLocaleString("en-US") : "Never"}</td>
                <td className="px-3 py-2">
                  <CheckNowButton monitoredId={m.id} />
                </td>
              </tr>
            ))}
            {monitored.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No monitored URLs. Approving an affiliate/landing page submitted by URL starts monitoring it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Panel title="Demo affiliate pages">
        <p className="mb-3 text-sm text-muted-foreground">
          Hosted inside this app so the demo doesn&apos;t depend on external sites. {isAdmin(user) ? "Use “Simulate affiliate edit” to change a live page after approval, then “Check now”." : "Switch to the Admin role to simulate an affiliate edit."}
        </p>
        <div className="space-y-2">
          {pages.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div>
                <a href={`/demo/affiliates/${p.slug}`} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-indigo-700 hover:underline">
                  /demo/affiliates/{p.slug}
                </a>
                <div className="text-xs text-muted-foreground">
                  {p.title} · serving: <span className="font-medium">{p.showChanged ? "edited version" : "original version"}</span>
                </div>
              </div>
              {isAdmin(user) && p.changedHtml && (
                <div className="flex gap-2">
                  {!p.showChanged ? (
                    <form action={simulateAffiliateEdit}>
                      <input type="hidden" name="slug" value={p.slug} />
                      <Button size="sm" variant="destructive">
                        Simulate affiliate edit
                      </Button>
                    </form>
                  ) : (
                    <form action={resetAffiliateDemo}>
                      <input type="hidden" name="slug" value={p.slug} />
                      <Button size="sm" variant="outline">
                        Reset demo
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
