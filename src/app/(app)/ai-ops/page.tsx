import Link from "next/link";
import { PageHeader, Panel, Stat } from "@/components/page-header";
import { isAdmin, requireRole } from "@/lib/auth";
import { LLM, REVIEW } from "@/lib/config";
import { db } from "@/lib/db";
import { aiMode } from "@/lib/llm/client";
import type { DiscardedFinding } from "@/lib/review/types";

function pct(n: number, d: number) {
  return d ? `${Math.round((100 * n) / d)}%` : "—";
}
function quantile(xs: number[], q: number) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(3)}`;

export default async function AiOpsPage() {
  await requireRole(isAdmin);
  const [calls, reviews, findings] = await Promise.all([
    db.llmCall.findMany({ orderBy: { createdAt: "desc" }, include: { submissionVersion: { select: { submissionId: true, versionNumber: true } } } }),
    db.aiReview.findMany({ orderBy: { createdAt: "desc" }, include: { version: { select: { submissionId: true, versionNumber: true, submission: { select: { title: true } } } } } }),
    db.finding.findMany({ select: { ruleCode: true, source: true, decision: true } }),
  ]);

  const live = calls.filter((c) => c.model !== "mock");
  const reviewCalls = live.filter((c) => c.purpose === "REVIEW" || c.purpose === "EVAL");
  const totalCost = live.reduce((s, c) => s + c.costUsd, 0);
  const lat = reviewCalls.filter((c) => c.success).map((c) => c.latencyMs);
  const p50 = quantile(lat, 0.5);
  const p95 = quantile(lat, 0.95);
  const repairs = live.filter((c) => c.purpose === "REPAIR").length;
  const failed = live.filter((c) => !c.success).length;
  const cacheHits = reviews.filter((r) => r.cacheHit).length;
  const partial = reviews.filter((r) => r.status === "PARTIAL").length;
  const injections = reviews.filter((r) => r.injectionSuspected).length;
  const discardedTotal = reviews.reduce((s, r) => s + r.discardedFindings, 0);
  const llmFindings = findings.filter((f) => f.source === "LLM").length;
  const inTokens = live.reduce((s, c) => s + c.inputTokens, 0);
  const cachedTokens = live.reduce((s, c) => s + c.cachedInputTokens, 0);

  const byRule = new Map<string, { LLM: [number, number]; DETERMINISTIC: [number, number] }>();
  for (const f of findings) {
    if (f.source === "REVIEWER" || f.decision === "PENDING") continue;
    const r = byRule.get(f.ruleCode) ?? { LLM: [0, 0], DETERMINISTIC: [0, 0] };
    r[f.source][f.decision === "ACCEPTED" ? 0 : 1]++;
    byRule.set(f.ruleCode, r);
  }
  const discardedList = reviews.flatMap((r) => ((r.discarded as DiscardedFinding[] | null) ?? []).map((d) => ({ ...d, review: r })));

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Ops"
        description={
          <>
            Every LLM call is logged with model, prompt version, tokens, cost and latency. Current mode: <strong>{aiMode()}</strong> · model <strong>{LLM.model}</strong> · reasoning effort{" "}
            <strong>{LLM.reasoningEffort}</strong> · prompt <strong>{REVIEW.promptVersion}</strong> · timeout {LLM.timeoutMs / 1000}s.
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="LLM calls (live)" value={live.length} hint={`${calls.length - live.length} mock calls (cost $0)`} />
        <Stat label="Total spend" value={usd(totalCost)} hint={`Spend cap ${usd(LLM.budgetUsd)} → then rule-based only`} />
        <Stat label="Avg cost / review" value={reviewCalls.length ? usd(reviewCalls.reduce((s, c) => s + c.costUsd, 0) / reviewCalls.length) : "—"} />
        <Stat label="Latency p50 / p95" value={p50 === null ? "—" : `${(p50 / 1000).toFixed(1)}s / ${((p95 ?? 0) / 1000).toFixed(1)}s`} />
        <Stat label="Review cache hit rate" value={pct(cacheHits, reviews.length)} hint={`${cacheHits} of ${reviews.length} reviews reused ($0)`} />
        <Stat label="Provider prompt-cache tokens" value={pct(cachedTokens, inTokens)} hint="Static instructions + rules first" />
        <Stat label="Schema repairs / failed calls" value={`${repairs} / ${failed}`} hint={`${partial} review(s) fell back to rule-based only`} />
        <Stat label="Ungrounded AI findings discarded" value={discardedTotal} hint={`${pct(discardedTotal, discardedTotal + llmFindings)} of AI findings failed verification`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Precision proxy by rule (reviewer accepted / decided)">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Rule</th>
                <th className="py-1 text-right font-medium">AI</th>
                <th className="py-1 text-right font-medium">Rule-based</th>
              </tr>
            </thead>
            <tbody>
              {[...byRule.entries()].sort().map(([code, r]) => (
                <tr key={code} className="border-t">
                  <td className="py-1 font-mono text-xs">{code}</td>
                  <td className="py-1 text-right tabular-nums">{r.LLM[0] + r.LLM[1] ? `${pct(r.LLM[0], r.LLM[0] + r.LLM[1])} (${r.LLM[0] + r.LLM[1]})` : "—"}</td>
                  <td className="py-1 text-right tabular-nums">
                    {r.DETERMINISTIC[0] + r.DETERMINISTIC[1] ? `${pct(r.DETERMINISTIC[0], r.DETERMINISTIC[0] + r.DETERMINISTIC[1])} (${r.DETERMINISTIC[0] + r.DETERMINISTIC[1]})` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Dismissals require a reason; low accept rates flag rules that need tuning. {injections} review(s) flagged suspected prompt injection.</p>
        </Panel>
        <Panel title="Discarded (ungrounded) AI findings">
          {discardedList.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {discardedList.slice(0, 20).map((d, i) => (
                <li key={i} className="border-b pb-2 last:border-0">
                  <span className="rounded bg-amber-50 px-1.5 text-xs font-medium text-amber-800">{d.reason}</span> <span className="font-mono text-xs">{d.ruleCode}</span>
                  <div className="font-mono text-xs text-zinc-600">&ldquo;{d.quote}&rdquo;</div>
                  <Link href={`/submissions/${d.review.version.submissionId}?v=${d.review.version.versionNumber}`} className="text-xs text-indigo-700 hover:underline">
                    {d.review.version.submission.title} v{d.review.version.versionNumber}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">The model must quote text that exists verbatim (whitespace/case-normalized) and cite an applicable rule. Anything else is dropped before a human sees it.</p>
        </Panel>
      </div>

      <Panel title={`LLM call log (${calls.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Time</th>
                <th className="py-1 pr-2 font-medium">Purpose</th>
                <th className="py-1 pr-2 font-medium">Model</th>
                <th className="py-1 pr-2 font-medium">Prompt</th>
                <th className="py-1 pr-2 text-right font-medium">In</th>
                <th className="py-1 pr-2 text-right font-medium">Cached</th>
                <th className="py-1 pr-2 text-right font-medium">Out (reasoning)</th>
                <th className="py-1 pr-2 text-right font-medium">Cost</th>
                <th className="py-1 pr-2 text-right font-medium">Latency</th>
                <th className="py-1 pr-2 font-medium">Result</th>
                <th className="py-1 font-medium">Submission</th>
              </tr>
            </thead>
            <tbody>
              {calls.slice(0, 150).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-1 pr-2 whitespace-nowrap text-muted-foreground">{c.createdAt.toLocaleString("en-US")}</td>
                  <td className="py-1 pr-2">{c.purpose}</td>
                  <td className="py-1 pr-2">{c.model === "mock" ? <span className="text-fuchsia-700">mock</span> : c.model}</td>
                  <td className="py-1 pr-2">{c.promptVersion}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{c.inputTokens.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{c.cachedInputTokens.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {c.outputTokens.toLocaleString()} ({c.reasoningTokens.toLocaleString()})
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{usd(c.costUsd)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{(c.latencyMs / 1000).toFixed(1)}s</td>
                  <td className="py-1 pr-2">{c.success ? <span className="text-emerald-700">ok</span> : <span className="text-red-700" title={c.error ?? ""}>error</span>}</td>
                  <td className="py-1">
                    {c.submissionVersion ? (
                      <Link href={`/submissions/${c.submissionVersion.submissionId}?v=${c.submissionVersion.versionNumber}`} className="text-indigo-700 hover:underline">
                        v{c.submissionVersion.versionNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
