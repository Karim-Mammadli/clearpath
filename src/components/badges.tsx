import { cn } from "@/lib/utils";
import { label } from "@/lib/domain";

const base = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";

export const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "border-red-200 bg-red-50 text-red-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  LOW: "border-sky-200 bg-sky-50 text-sky-700",
  CLEAR: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** Inline highlight colors for findings in content. */
export const HIGHLIGHT_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-100 decoration-red-500",
  HIGH: "bg-orange-100 decoration-orange-500",
  MEDIUM: "bg-amber-100 decoration-amber-500",
  LOW: "bg-sky-100 decoration-sky-500",
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return <span className={cn(base, SEVERITY_STYLES[severity], className)}>{severity}</span>;
}

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  return (
    <span className={cn(base, SEVERITY_STYLES[level])}>
      {level === "CLEAR" ? "Clear" : level.charAt(0) + level.slice(1).toLowerCase()}
      {score !== undefined && <span className="tabular-nums opacity-70">· {score}</span>}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  IN_REVIEW: "border-blue-200 bg-blue-50 text-blue-700",
  CHANGES_REQUESTED: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-zinc-300 bg-zinc-100 text-zinc-700",
  DRIFT_DETECTED: "border-red-300 bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn(base, STATUS_STYLES[status])}>{label(status)}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    DETERMINISTIC: "border-zinc-300 bg-white text-zinc-700",
    LLM: "border-violet-200 bg-violet-50 text-violet-700",
    REVIEWER: "border-teal-200 bg-teal-50 text-teal-700",
  };
  const text: Record<string, string> = { DETERMINISTIC: "Rule-based", LLM: "AI", REVIEWER: "Reviewer" };
  return <span className={cn(base, styles[source])}>{text[source] ?? source}</span>;
}

export function ModeBadge({ mode }: { mode: string }) {
  if (mode === "mock") return <span className={cn(base, "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700")}>Mock AI</span>;
  if (mode === "deterministic-only") return <span className={cn(base, "border-amber-300 bg-amber-50 text-amber-800")}>Rule-based only</span>;
  return <span className={cn(base, "border-violet-200 bg-violet-50 text-violet-700")}>Live AI</span>;
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn(base, "border-zinc-200 bg-zinc-50 text-zinc-700", className)}>{children}</span>;
}
