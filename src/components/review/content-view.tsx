import { HIGHLIGHT_STYLES } from "@/components/badges";
import { SEVERITY_RANK, type SeverityCode } from "@/lib/domain";
import { HIDDEN_MARKER } from "@/lib/extract";
import { cn } from "@/lib/utils";

type F = { id: string; ruleCode: string; severity: string; startOffset: number; endOffset: number; missing: boolean; decision: string };

/**
 * Content with findings highlighted inline (color = highest severity covering the span).
 * Offsets were computed server-side by verify.ts / deterministic.ts. "Missing element" findings
 * are not highlighted (there's no offending text); they're shown as chips in the findings panel.
 */
export function ContentView({ text, findings }: { text: string; findings: F[] }) {
  const marks = findings.filter((f) => !f.missing && f.decision !== "DISMISSED" && f.endOffset > f.startOffset);
  const bounds = new Set<number>([0, text.length]);
  for (const f of marks) {
    bounds.add(Math.max(0, Math.min(text.length, f.startOffset)));
    bounds.add(Math.max(0, Math.min(text.length, f.endOffset)));
  }
  const pts = [...bounds].sort((a, b) => a - b);
  const hiddenAt = text.indexOf(HIDDEN_MARKER);

  const segments: React.ReactNode[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [s, e] = [pts[i], pts[i + 1]];
    const seg = text.slice(s, e);
    const covering = marks.filter((f) => f.startOffset <= s && f.endOffset >= e);
    const inHidden = hiddenAt >= 0 && s >= hiddenAt;
    if (covering.length === 0) {
      segments.push(
        <span key={s} className={inHidden ? "text-red-800" : undefined}>
          {seg}
        </span>,
      );
      continue;
    }
    const top = covering.reduce((a, b) => (SEVERITY_RANK[b.severity as SeverityCode] > SEVERITY_RANK[a.severity as SeverityCode] ? b : a));
    segments.push(
      <a
        key={s}
        href={`#f-${top.id}`}
        title={covering.map((f) => `${f.ruleCode} (${f.severity})`).join("\n")}
        className={cn("rounded-[3px] underline decoration-2 underline-offset-2 hover:brightness-95", HIGHLIGHT_STYLES[top.severity])}
      >
        {seg}
      </a>,
    );
  }

  return (
    <div className="font-mono text-[13px] leading-6 whitespace-pre-wrap break-words text-zinc-800">
      {hiddenAt >= 0 ? (
        <>
          {segments}
        </>
      ) : (
        segments
      )}
    </div>
  );
}
