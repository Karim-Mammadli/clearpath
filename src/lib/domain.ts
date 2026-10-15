// Shared enums/labels that are safe to import from both server and client code
// (mirrors the Prisma enums without pulling in the Prisma runtime).

export const PRODUCTS = ["PERSONAL_LOAN", "CREDIT_CARD", "MORTGAGE_PREQUAL"] as const;
export type ProductCode = (typeof PRODUCTS)[number];

export const CHANNELS = [
  "EMAIL",
  "SMS",
  "SOCIAL",
  "DISPLAY_AD",
  "LANDING_PAGE",
  "AFFILIATE_PAGE",
] as const;
export type ChannelCode = (typeof CHANNELS)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type SeverityCode = (typeof SEVERITIES)[number];

export const SEVERITY_RANK: Record<SeverityCode, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export const ROLES = ["MARKETER", "AFFILIATE", "REVIEWER", "ADMIN"] as const;
export type RoleCode = (typeof ROLES)[number];

export const STATUSES = [
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "DRIFT_DETECTED",
] as const;
export type StatusCode = (typeof STATUSES)[number];

export const RISK_LEVELS = ["CLEAR", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevelCode = (typeof RISK_LEVELS)[number];

export const DISMISS_REASONS = [
  "FALSE_POSITIVE",
  "NOT_APPLICABLE",
  "ACCEPTABLE_RISK",
  "OTHER",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

export const LABELS: Record<string, string> = {
  PERSONAL_LOAN: "Personal loan",
  CREDIT_CARD: "Credit card",
  MORTGAGE_PREQUAL: "Mortgage prequal",
  EMAIL: "Email",
  SMS: "SMS",
  SOCIAL: "Social",
  DISPLAY_AD: "Display ad",
  LANDING_PAGE: "Landing page",
  AFFILIATE_PAGE: "Affiliate page",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DRIFT_DETECTED: "Drift detected",
  MARKETER: "Marketer",
  AFFILIATE: "Affiliate",
  REVIEWER: "Reviewer",
  ADMIN: "Admin",
  FALSE_POSITIVE: "False positive",
  NOT_APPLICABLE: "Not applicable",
  ACCEPTABLE_RISK: "Acceptable risk",
  OTHER: "Other",
  DETERMINISTIC: "Rule-based",
  LLM: "AI",
  REVIEWER_SOURCE: "Reviewer",
  SUBMITTER: "Submitter",
  REWRITE: "AI rewrite",
  MONITOR: "Monitor",
};

export function label(code: string | null | undefined): string {
  if (!code) return "—";
  return LABELS[code] ?? code;
}
