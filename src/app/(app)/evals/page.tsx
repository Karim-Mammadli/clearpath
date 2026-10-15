import latest from "../../../../evals/results/latest.json";
import { PageHeader, Panel, Stat } from "@/components/page-header";
import { isAdmin, requireRole } from "@/lib/auth";

type RuleRow = { rule: string; support: number; tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null };
type Summary = {
  micro: { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number };
  cleanFalsePositiveRate: number;
  cleanSamples: number;
  injectionResistance: number | null;
  injectionSamples: number;
  avgCostUsd: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  discardedFindings: number;
  perRule: RuleRow[];
};
type SampleRow = { id: string; synthetic: boolean; expected: string[]; predicted: string[]; fp: string[]; fn: string[]; status: string; costUsd: number; latencyMs: number; discarded: number };
type Results = {
  generatedAt: string;
  model: string;
  reasoningEffort: string;
  promptVersion: string;
  ruleSetVersion: number;
  samples: number;
  syntheticSamples: number;
  modes: Record<"deterministic-only" | "hybrid", { summary: Summary; samples: SampleRow[] }>;
};

const p = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

export default async function EvalsPage() {
  await requireRole(isAdmin);
  // Committed eval output (produced by `npm run eval`), bundled at build time.
  const data = (latest as unknown as Results | null) ?? null;
  if (!data) {
    return (
      <div>
        <PageHeader title="Evals" />
        <div className="rounded-lg border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">No eval results yet. Run <code>npm run eval</code>.</div>
      </div>
    );
  }
  const det = data.modes["deterministic-only"];
  const hyb = data.modes.hybrid;
  const ruleCodes = [...new Set([...det.summary.perRule.map((r) => r.rule), ...hyb.summary.perRule.map((r) => r.rule)])].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evals"
        description={
          <>
            Labeled dataset of {data.samples} samples ({data.samples - data.syntheticSamples} from the spec + {data.syntheticSamples} hand-labeled synthetic variants), run through the production engine. Hybrid model:{" "}
            <strong>{data.model}</strong> ({data.reasoningEffort}) · prompt {data.promptVersion} · rule set v{data.ruleSetVersion} · run {new Date(data.generatedAt).toLocaleString("en-US")}. Scoring is by rule code per sample;
            &ldquo;acceptable extra&rdquo; codes are not counted as false positives.
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recall (micro)" value={`${p(det.summary.micro.recall)} → ${p(hyb.summary.micro.recall)}`} hint="Rule-based only → hybrid" />
        <Stat label="Precision (micro)" value={`${p(det.summary.micro.precision)} → ${p(hyb.summary.micro.precision)}`} hint="Rule-based only → hybrid" />
        <Stat label="Clean samples with HIGH/CRITICAL" value={`${p(hyb.summary.cleanFalsePositiveRate)}`} hint={`${hyb.summary.cleanSamples} clean samples (hybrid)`} />
        <Stat label="Injection resistance" value={p(hyb.summary.injectionResistance)} hint={`${hyb.summary.injectionSamples} injection samples: flagged AND real violations still found`} />
        <Stat label="F1 (micro)" value={`${p(det.summary.micro.f1)} → ${p(hyb.summary.micro.f1)}`} />
        <Stat label="Avg cost / sample (hybrid)" value={`$${hyb.summary.avgCostUsd.toFixed(4)}`} hint={`Total $${hyb.summary.totalCostUsd.toFixed(3)}`} />
        <Stat label="Avg latency / sample (hybrid)" value={`${(hyb.summary.avgLatencyMs / 1000).toFixed(1)}s`} />
        <Stat label="Ungrounded findings discarded" value={hyb.summary.discardedFindings} />
      </div>

      <Panel title="Per-rule precision / recall">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Rule</th>
                <th className="py-1 pr-3 text-right font-medium">Support</th>
                <th className="py-1 pr-3 text-right font-medium">Rule-based P / R</th>
                <th className="py-1 pr-3 text-right font-medium">Hybrid P / R</th>
                <th className="py-1 pr-3 text-right font-medium">Hybrid F1</th>
                <th className="py-1 text-right font-medium">Hybrid TP / FP / FN</th>
              </tr>
            </thead>
            <tbody>
              {ruleCodes.map((code) => {
                const d = det.summary.perRule.find((r) => r.rule === code);
                const h = hyb.summary.perRule.find((r) => r.rule === code);
                return (
                  <tr key={code} className="border-t">
                    <td className="py-1 pr-3 font-mono text-xs">{code}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{h?.support ?? d?.support ?? 0}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {p(d?.precision)} / {p(d?.recall)}
                    </td>
                    <td className="py-1 pr-3 text-right font-medium tabular-nums">
                      {p(h?.precision)} / {p(h?.recall)}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">{p(h?.f1)}</td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {h?.tp ?? 0} / {h?.fp ?? 0} / {h?.fn ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Per-sample results (hybrid)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Sample</th>
                <th className="py-1 pr-3 font-medium">Expected</th>
                <th className="py-1 pr-3 font-medium">Predicted</th>
                <th className="py-1 pr-3 font-medium">Missed (FN)</th>
                <th className="py-1 pr-3 font-medium">False positives</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {hyb.samples.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="py-1 pr-3 font-medium">
                    {s.id}
                    {s.synthetic && <span className="ml-1 text-[10px] text-muted-foreground">synthetic</span>}
                  </td>
                  <td className="py-1 pr-3 font-mono">{s.expected.join(", ") || "— (clean)"}</td>
                  <td className="py-1 pr-3 font-mono">{s.predicted.join(", ") || "—"}</td>
                  <td className="py-1 pr-3 font-mono text-red-700">{s.fn.join(", ")}</td>
                  <td className="py-1 pr-3 font-mono text-amber-700">{s.fp.join(", ")}</td>
                  <td className="py-1 text-right tabular-nums">${s.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-muted-foreground">
        Caveat: {data.samples} samples is a smoke-level eval; per-rule numbers on 1–3 supporting samples are directional. Next: grow the set from reviewer dismissals and real historic reviews, and gate prompt/rule changes on it in CI.
      </p>
    </div>
  );
}
