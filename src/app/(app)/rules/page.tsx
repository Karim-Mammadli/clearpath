import { SeverityBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { isReviewer, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { label } from "@/lib/domain";

const list = (xs: string[]) => (xs.includes("ALL") ? "All" : xs.map(label).join(", "));

export default async function RulesPage() {
  await requireRole(isReviewer);
  const [rules, rsv, findings] = await Promise.all([
    db.rule.findMany({ orderBy: [{ severity: "desc" }, { code: "asc" }] }),
    db.ruleSetVersion.findFirst({ orderBy: { version: "desc" } }),
    db.finding.findMany({ select: { ruleCode: true, decision: true, createdAt: true, source: true } }),
  ]);
  const stats = new Map<string, { hits: number; accepted: number; dismissed: number; last: Date | null }>();
  for (const f of findings) {
    const s = stats.get(f.ruleCode) ?? { hits: 0, accepted: 0, dismissed: 0, last: null };
    s.hits++;
    if (f.decision === "ACCEPTED") s.accepted++;
    if (f.decision === "DISMISSED") s.dismissed++;
    if (!s.last || f.createdAt > s.last) s.last = f.createdAt;
    stats.set(f.ruleCode, s);
  }

  return (
    <div>
      <PageHeader
        title="Rule library"
        description={
          <>
            Rules are data, not prompt text: the AI prompt is assembled from the active rules that apply to a submission&apos;s product, channel and source. Rule set{" "}
            <strong>v{rsv?.version ?? 1}</strong> ({rsv?.changeNote}). Every AI review stores the rule-set and prompt version it ran with. Read-only in v1. Simplified summaries, not legal advice.
          </>
        }
      />
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Rule</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Check</th>
              <th className="px-3 py-2 font-medium">Applies to</th>
              <th className="px-3 py-2 text-right font-medium">Triggered</th>
              <th className="px-3 py-2 text-right font-medium">Accept rate</th>
              <th className="px-3 py-2 font-medium">Last hit</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const s = stats.get(r.code);
              const decided = (s?.accepted ?? 0) + (s?.dismissed ?? 0);
              const rate = decided ? s!.accepted / decided : null;
              return (
                <tr key={r.code} className="border-b align-top last:border-0">
                  <td className="max-w-md px-3 py-2">
                    <div className="font-mono text-xs font-semibold">{r.code}</div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.citation}</div>
                    <details className="mt-1 text-xs text-zinc-600">
                      <summary className="cursor-pointer text-indigo-700">Guidance &amp; examples</summary>
                      <p className="mt-1">{r.guidance}</p>
                      {r.detector && <p className="mt-1"><span className="font-medium">Rule-based detector:</span> {r.detector}</p>}
                      {r.violatingExamples.map((e) => (
                        <p key={e} className="mt-1 text-red-700">✗ {e}</p>
                      ))}
                      {r.compliantExamples.map((e) => (
                        <p key={e} className="mt-1 text-emerald-700">✓ {e}</p>
                      ))}
                    </details>
                  </td>
                  <td className="px-3 py-2">
                    <SeverityBadge severity={r.severity} />
                  </td>
                  <td className="px-3 py-2 text-xs">{r.checkType === "BOTH" ? "Rule-based + AI" : r.checkType === "LLM" ? "AI" : "Rule-based"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    <div>Products: {list(r.products)}</div>
                    <div>Channels: {list(r.channels)}</div>
                    {r.affiliateOnly && <div className="font-medium">Affiliate content only</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s?.hits ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {rate === null ? "—" : `${Math.round(rate * 100)}%`}
                    {rate !== null && decided >= 3 && rate < 0.6 && <div className="text-[11px] font-medium text-amber-700">Needs tuning</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s?.last ? s.last.toLocaleDateString("en-US") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
