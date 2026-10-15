import "dotenv/config";
import { extractContent } from "@/lib/extract";
import { runReviewEngine } from "@/lib/review/engine";
import { RULE_CATALOG } from "@/lib/rules/catalog";
import { getSample } from "@/lib/samples";
import type { LlmCallLog } from "@/lib/llm/client";

// Usage: npx tsx scripts/live-check.ts S1 S2 S8   (spends real API credit)
(async () => {
  for (const id of process.argv.slice(2)) {
    const s = getSample(id);
    const ex = extractContent(s.content);
    const logs: LlmCallLog[] = [];
    const r = await runReviewEngine(
      { contentText: ex.text, extractionMeta: ex.meta, product: s.product, channel: s.channel, isAffiliate: s.source === "AFFILIATE", rules: RULE_CATALOG, ruleSetVersion: 1 },
      { mode: "live", log: async (l) => { logs.push(l); }, checkBudget: async () => null },
    );
    console.log(`\n=== ${id} (${r.mode}, ${r.status}${r.statusNote ? ": " + r.statusNote : ""}) risk ${r.risk.score} ${r.risk.level} — ${r.risk.text}`);
    console.log(`summary: ${r.summary}`);
    console.log(`injectionSuspected=${r.injectionSuspected} discarded=${JSON.stringify(r.discarded)}`);
    for (const f of r.findings) console.log(` - [${f.source}] ${f.ruleCode} ${f.severity}${f.missing ? " (missing)" : ""} "${f.quote.slice(0, 90)}" @${f.startOffset}-${f.endOffset}${f.confidence !== null ? " conf=" + f.confidence : ""}\n     fix: ${f.suggestedFix?.slice(0, 140)}`);
    for (const l of logs) console.log(` llm: ${l.purpose} ${l.model} in=${l.usage.inputTokens} cached=${l.usage.cachedInputTokens} out=${l.usage.outputTokens} (reasoning ${l.usage.reasoningTokens}) $${l.costUsd.toFixed(4)} ${l.latencyMs}ms ${l.success ? "ok" : "FAIL " + l.error}`);
    console.log(` raw LLM findings: ${JSON.stringify((r.rawLlmOutput as { findings?: unknown[] } | null)?.findings?.map((x) => (x as { rule_code: string }).rule_code))}`);
  }
})();
