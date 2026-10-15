import { PageHeader } from "@/components/page-header";
import { SubmitForm } from "@/components/submit-form";
import { canSubmit, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHANNELS, PRODUCTS } from "@/lib/domain";
import { getApplicableRules } from "@/lib/review/rules";
import { SAMPLES } from "@/lib/samples";

export const maxDuration = 120; // the AI pre-check runs inside the submit action

export default async function SubmitPage() {
  const user = await requireRole(canSubmit);
  const rules = await db.rule.findMany({ where: { active: true } });
  const isAffiliate = user.role === "AFFILIATE";

  const rulesByKey: Record<string, { code: string; title: string }[]> = {};
  for (const p of PRODUCTS)
    for (const c of CHANNELS) rulesByKey[`${p}:${c}`] = getApplicableRules(rules, { product: p, channel: c, isAffiliate }).map((r) => ({ code: r.code, title: r.title }));

  const samples = SAMPLES.filter((s) => !s.synthetic && (isAffiliate ? s.source === "AFFILIATE" : s.source === "FIRST_PARTY" || user.role === "ADMIN")).map((s) => ({
    id: s.id,
    title: s.title,
    product: s.product,
    channel: s.channel,
    content: s.content,
  }));
  if (isAffiliate || user.role === "ADMIN") {
    samples.push({ id: "S8-URL", title: "LoanFinderHub page by URL (demo affiliate page)", product: "PERSONAL_LOAN", channel: "AFFILIATE_PAGE", content: "", url: "/demo/affiliates/loanfinderhub-best-loans" } as (typeof samples)[number] & { url: string });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Submit content for review"
        description="Paste content or a landing-page URL. Rule-based checks and the AI pre-reviewer run immediately, so you can fix issues before a compliance reviewer opens it. AI findings are advisory: a human reviewer always makes the decision."
      />
      <div className="rounded-lg border bg-card p-5">
        <SubmitForm samples={samples} rulesByKey={rulesByKey} />
      </div>
    </div>
  );
}
