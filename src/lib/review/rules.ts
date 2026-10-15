import type { RuleDef } from "@/lib/rules/catalog";

export type RuleContext = {
  product: string;
  channel: string;
  isAffiliate: boolean;
};

/** Rule selection = active AND product match AND channel match AND (not affiliateOnly OR affiliate source). */
export function getApplicableRules<R extends Pick<RuleDef, "products" | "channels" | "affiliateOnly" | "active">>(
  rules: R[],
  ctx: RuleContext,
): R[] {
  return rules.filter(
    (r) =>
      r.active &&
      (r.products.includes("ALL") || r.products.includes(ctx.product)) &&
      (r.channels.includes("ALL") || r.channels.includes(ctx.channel)) &&
      (!r.affiliateOnly || ctx.isAffiliate),
  );
}
