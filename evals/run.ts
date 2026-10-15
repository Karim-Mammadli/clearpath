import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LLM, REVIEW } from "@/lib/config";
import { extractContent } from "@/lib/extract";
import { aiMode, type LlmCallLog, type LlmUsage } from "@/lib/llm/client";
import { runReviewEngine, type EngineResult } from "@/lib/review/engine";
import { RULE_CATALOG } from "@/lib/rules/catalog";
import { SAMPLES, type Sample } from "@/lib/samples";

/**
 * Eval harness: `npm run eval [-- --mode live|mock] [--record]`
 * Runs the exact production engine (no DB) over the labeled dataset in two configurations:
 *   - deterministic-only (rule-based checks + injection heuristics)
 *   - hybrid (rule-based + LLM + grounding verification)
 * Scoring is by rule-code presence per sample. `acceptable_extra` codes are not false positives.
 * --record saves the hybrid run's raw LLM output to prisma/seed-data/llm-replay.json so the seed
 * can replay real model output (no extra API spend).
 */

const args = process.argv.slice(2);
const hybridMode = (args.includes("--mode") ? args[args.indexOf("--mode") + 1] : aiMode() === "live" ? "live" : "mock") as "live" | "mock";
const record = args.includes("--record");
const ROOT = path.join(__dirname, "..");

type SampleResult = {
  id: string;
  synthetic: boolean;
  expected: string[];
  acceptableExtra: string[];
  predicted: string[];
  tp: string[];
  fp: string[];
  fn: string[];
  highOrCriticalOnClean: boolean;
  injectionResisted: boolean | null;
  status: string;
  costUsd: number;
  latencyMs: number;
  discarded: number;
};

async function runSample(s: Sample, mode: "off" | "live" | "mock") {
  const ex = extractContent(s.content);
  const logs: LlmCallLog[] = [];
  const started = Date.now();
  const r = await runReviewEngine(
    { contentText: ex.text, extractionMeta: ex.meta, product: s.product, channel: s.channel, isAffiliate: s.source === "AFFILIATE", rules: RULE_CATALOG, ruleSetVersion: 1 },
    { mode, purpose: "EVAL", log: async (l) => void logs.push(l), checkBudget: async () => null },
  );
  return { r, logs, latencyMs: Date.now() - started };
}

function score(s: Sample, r: EngineResult, costUsd: number, latencyMs: number): SampleResult {
  const predicted = [...new Set(r.findings.map((f) => f.ruleCode))].sort();
  const tp = predicted.filter((c) => s.expected.includes(c));
  const fp = predicted.filter((c) => !s.expected.includes(c) && !s.acceptableExtra.includes(c));
  const fn = s.expected.filter((c) => !predicted.includes(c));
  const nonInjectionExpected = s.expected.filter((c) => c !== "SEC-INJECTION");
  return {
    id: s.id,
    synthetic: s.synthetic,
    expected: s.expected,
    acceptableExtra: s.acceptableExtra,
    predicted,
    tp,
    fp,
    fn,
    highOrCriticalOnClean: s.isClean && r.findings.some((f) => f.severity === "HIGH" || f.severity === "CRITICAL"),
    injectionResisted: s.isInjection ? predicted.includes("SEC-INJECTION") && nonInjectionExpected.every((c) => predicted.includes(c)) : null,
    status: `${r.status}/${r.mode}`,
    costUsd,
    latencyMs,
    discarded: r.discarded.length,
  };
}

function aggregate(results: SampleResult[]) {
  const codes = [...new Set(RULE_CATALOG.map((r) => r.code))].sort();
  const perRule = codes.map((code) => {
    let tp = 0, fp = 0, fn = 0, support = 0;
    for (const r of results) {
      if (r.expected.includes(code)) support++;
      if (r.tp.includes(code)) tp++;
      if (r.fp.includes(code)) fp++;
      if (r.fn.includes(code)) fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    const f1 = precision !== null && recall !== null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
    return { rule: code, support, tp, fp, fn, precision, recall, f1 };
  });
  const TP = perRule.reduce((s, r) => s + r.tp, 0);
  const FP = perRule.reduce((s, r) => s + r.fp, 0);
  const FN = perRule.reduce((s, r) => s + r.fn, 0);
  const precision = TP + FP ? TP / (TP + FP) : 0;
  const recall = TP + FN ? TP / (TP + FN) : 0;
  const clean = results.filter((r) => r.expected.length === 0);
  const inj = results.filter((r) => r.injectionResisted !== null);
  return {
    micro: { tp: TP, fp: FP, fn: FN, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 },
    cleanFalsePositiveRate: clean.length ? clean.filter((r) => r.highOrCriticalOnClean).length / clean.length : 0,
    cleanSamples: clean.length,
    injectionResistance: inj.length ? inj.filter((r) => r.injectionResisted).length / inj.length : null,
    injectionSamples: inj.length,
    avgCostUsd: results.reduce((s, r) => s + r.costUsd, 0) / results.length,
    totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
    avgLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0) / results.length,
    discardedFindings: results.reduce((s, r) => s + r.discarded, 0),
    perRule: perRule.filter((r) => r.support + r.fp > 0),
  };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

(async () => {
  const dataset = SAMPLES.map((s) => ({
    id: s.id, title: s.title, product: s.product, channel: s.channel, source: s.source, content: s.content,
    expected_rule_codes: s.expected, acceptable_extra: s.acceptableExtra, is_clean: s.isClean, is_injection: s.isInjection, synthetic: s.synthetic,
  }));
  writeFileSync(path.join(ROOT, "evals", "dataset.json"), JSON.stringify(dataset, null, 2) + "\n");

  console.log(`Running ${SAMPLES.length} samples: deterministic-only + hybrid (${hybridMode})…`);
  const det = await pool(SAMPLES, 8, async (s) => {
    const { r, latencyMs } = await runSample(s, "off");
    return score(s, r, 0, latencyMs);
  });

  const replay: Record<string, { review: unknown; usage: LlmUsage; latencyMs: number; model: string }> = {};
  const hyb = await pool(SAMPLES, 4, async (s) => {
    const { r, logs, latencyMs } = await runSample(s, hybridMode);
    const cost = logs.reduce((a, l) => a + l.costUsd, 0);
    const main = logs.find((l) => l.purpose === "EVAL");
    if (record && r.rawLlmOutput && main) replay[s.id] = { review: r.rawLlmOutput, usage: main.usage, latencyMs: main.latencyMs, model: main.model };
    process.stdout.write(`  ${s.id.padEnd(5)} ${r.status.padEnd(8)} ${[...new Set(r.findings.map((f) => f.ruleCode))].join(",")}\n`);
    return score(s, r, cost, latencyMs);
  });

  const result = {
    generatedAt: new Date().toISOString(),
    model: hybridMode === "live" ? LLM.model : "mock",
    reasoningEffort: LLM.reasoningEffort,
    promptVersion: REVIEW.promptVersion,
    ruleSetVersion: 1,
    samples: SAMPLES.length,
    syntheticSamples: SAMPLES.filter((s) => s.synthetic).length,
    modes: {
      "deterministic-only": { summary: aggregate(det), samples: det },
      hybrid: { summary: aggregate(hyb), samples: hyb },
    },
  };

  const dir = path.join(ROOT, "evals", "results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(result, null, 2) + "\n");
  writeFileSync(path.join(dir, `${result.generatedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(result, null, 2) + "\n");
  if (record) {
    mkdirSync(path.join(ROOT, "prisma", "seed-data"), { recursive: true });
    writeFileSync(path.join(ROOT, "prisma", "seed-data", "llm-replay.json"), JSON.stringify(replay, null, 2) + "\n");
  }

  for (const [name, m] of Object.entries(result.modes)) {
    const s = m.summary;
    console.log(
      `\n${name}: P=${s.micro.precision.toFixed(2)} R=${s.micro.recall.toFixed(2)} F1=${s.micro.f1.toFixed(2)} cleanFP=${(s.cleanFalsePositiveRate * 100).toFixed(0)}% injection=${s.injectionResistance === null ? "n/a" : (s.injectionResistance * 100).toFixed(0) + "%"} cost=$${s.totalCostUsd.toFixed(4)} avgLatency=${(s.avgLatencyMs / 1000).toFixed(1)}s discarded=${s.discardedFindings}`,
    );
    for (const r of m.samples) if (r.fp.length || r.fn.length) console.log(`   ${r.id}: FP=[${r.fp}] FN=[${r.fn}]`);
  }
})();
