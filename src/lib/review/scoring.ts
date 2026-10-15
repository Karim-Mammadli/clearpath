import type { RiskLevelCode, SeverityCode } from "@/lib/domain";

// Risk and priority are computed in code from verified findings (SPEC §5) — never by the LLM.

export const SEVERITY_POINTS: Record<SeverityCode, number> = { CRITICAL: 40, HIGH: 20, MEDIUM: 8, LOW: 3 };
export const INJECTION_FLOOR = 80;

export type ScoreBreakdown = {
  counts: Record<SeverityCode, number>;
  raw: number;
  capped: boolean;
  injectionFloor: boolean;
  score: number;
  level: RiskLevelCode;
  text: string;
};

export function riskLevel(score: number): RiskLevelCode {
  if (score <= 0) return "CLEAR";
  if (score < 20) return "LOW";
  if (score < 50) return "MEDIUM";
  if (score < 80) return "HIGH";
  return "CRITICAL";
}

/** Score from findings that are not dismissed. */
export function computeRisk(
  findings: { severity: SeverityCode; decision?: string }[],
  injectionSuspected: boolean,
): ScoreBreakdown {
  const counts: Record<SeverityCode, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) if (f.decision !== "DISMISSED") counts[f.severity]++;
  const raw = (Object.keys(counts) as SeverityCode[]).reduce((s, k) => s + counts[k] * SEVERITY_POINTS[k], 0);
  let score = Math.min(100, raw);
  const injectionFloor = injectionSuspected && score < INJECTION_FLOOR;
  if (injectionSuspected) score = Math.max(score, INJECTION_FLOOR);

  const parts = (Object.keys(counts) as SeverityCode[])
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${k} × ${SEVERITY_POINTS[k]}`);
  let text = parts.length ? `${parts.join(" + ")} = ${raw}` : "No open findings = 0";
  if (raw > 100) text += " (capped at 100)";
  if (injectionFloor) text += `; prompt injection suspected → minimum ${INJECTION_FLOOR}`;

  return { counts, raw, capped: raw > 100, injectionFloor, score, level: riskLevel(score), text };
}

const DAY = 24 * 60 * 60 * 1000;

/** Queue priority: risk + launch urgency + age in queue + affiliate source + drift. */
export function computePriority(input: {
  riskScore: number;
  launchDate: Date | null;
  createdAt: Date;
  isAffiliate: boolean;
  drift: boolean;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  let p = input.riskScore;
  if (input.launchDate) {
    const days = (input.launchDate.getTime() - now.getTime()) / DAY;
    if (days <= 2) p += 30;
    else if (days <= 7) p += 15;
  }
  p += Math.min(20, Math.floor((now.getTime() - input.createdAt.getTime()) / DAY) * 2);
  if (input.isAffiliate) p += 5;
  if (input.drift) p += 25;
  return p;
}
