import "dotenv/config";
import { extractContent } from "@/lib/extract";
import type { LlmCallLog } from "@/lib/llm/client";
import { runReviewEngine } from "@/lib/review/engine";
import { generateRewrite } from "@/lib/review/rewrite";
import { getApplicableRules } from "@/lib/review/rules";
import { RULE_CATALOG } from "@/lib/rules/catalog";
import { getSample } from "@/lib/samples";

// Usage: npx tsx scripts/rewrite-check.ts S1   (spends real API credit, ~$0.03)
(async () => {
  const s = getSample(process.argv[2] ?? "S1");
  const ctx = { product: s.product, channel: s.channel, isAffiliate: s.source === "AFFILIATE" };
  const logs: LlmCallLog[] = [];
  const deps = { mode: "live" as const, log: async (l: LlmCallLog) => void logs.push(l), checkBudget: async () => null };
  const ex = extractContent(s.content);
  const before = await runReviewEngine({ contentText: ex.text, extractionMeta: ex.meta, ...ctx, rules: RULE_CATALOG, ruleSetVersion: 1 }, { ...deps, mode: "off" });
  const rw = await generateRewrite({ content: ex.text, product: s.product, channel: s.channel, affiliateName: null, rules: getApplicableRules(RULE_CATALOG, ctx), findings: before.findings }, deps);
  if (!rw.ok) return console.log("FAIL", rw.reason);
  console.log(rw.value.rewritten_text, "\n---", JSON.stringify(rw.value.changes), "\nnotes:", rw.value.notes);
  const ex2 = extractContent(rw.value.rewritten_text);
  const after = await runReviewEngine({ contentText: ex2.text, extractionMeta: ex2.meta, ...ctx, rules: RULE_CATALOG, ruleSetVersion: 1 }, deps);
  console.log("re-check:", after.mode, "risk", after.risk.score, after.findings.map((f) => `${f.ruleCode}(${f.severity}): ${f.explanation.slice(0, 100)}`));
  for (const l of logs) console.log(` ${l.purpose} $${l.costUsd.toFixed(4)} ${l.latencyMs}ms`);
})();
