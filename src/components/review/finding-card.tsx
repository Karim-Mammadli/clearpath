"use client";

import { useState, useTransition } from "react";
import { Check, CircleSlash, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { decideFinding } from "@/app/actions/submissions";
import { SeverityBadge, SourceBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { DISMISS_REASONS, label } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type FindingView = {
  id: string;
  ruleCode: string;
  ruleTitle: string;
  citation: string;
  source: string;
  severity: string;
  quote: string;
  missing: boolean;
  explanation: string;
  suggestedFix: string | null;
  confidence: number | null;
  decision: string;
  dismissReason: string | null;
  dismissNote: string | null;
  previouslyDismissed: boolean;
  decidedBy: string | null;
};

export function FindingCard({ f, canDecide }: { f: FindingView; canDecide: boolean }) {
  const [dismissing, setDismissing] = useState(false);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    start(async () => {
      try {
        await decideFinding(fd);
        setDismissing(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const dismissed = f.decision === "DISMISSED";
  return (
    <div id={`f-${f.id}`} className={cn("scroll-mt-20 rounded-lg border bg-card p-3 target:ring-2 target:ring-indigo-400", dismissed && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={f.severity} />
        <span className="font-mono text-xs font-semibold">{f.ruleCode}</span>
        <SourceBadge source={f.source} />
        {f.missing && <span className="rounded border border-dashed border-zinc-400 px-1.5 text-[11px] text-zinc-600">Missing element</span>}
        {f.confidence !== null && f.source === "LLM" && <span className="text-[11px] text-muted-foreground">conf. {Math.round(f.confidence * 100)}%</span>}
        <span className="ml-auto text-[11px] font-medium">
          {f.decision === "ACCEPTED" && <span className="text-emerald-700">Accepted{f.decidedBy ? ` · ${f.decidedBy}` : ""}</span>}
          {dismissed && (
            <span className="text-zinc-600">
              {f.previouslyDismissed ? "Previously dismissed" : "Dismissed"} · {label(f.dismissReason)}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 text-sm font-medium">{f.ruleTitle}</div>
      <div className="text-[11px] text-muted-foreground">{f.citation}</div>
      {!f.missing && (
        <blockquote className="mt-2 border-l-2 border-zinc-300 pl-2 font-mono text-xs text-zinc-700">&ldquo;{f.quote}&rdquo;</blockquote>
      )}
      <p className="mt-2 text-sm text-zinc-700">{f.explanation}</p>
      {f.suggestedFix && (
        <div className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
          <span className="font-semibold">Suggested fix: </span>
          {f.suggestedFix}
        </div>
      )}
      {dismissed && f.dismissNote && <div className="mt-1 text-xs text-zinc-600">Note: {f.dismissNote}</div>}

      {canDecide && (
        <div className="mt-3">
          {f.decision === "PENDING" && !dismissing && (
            <div className="flex gap-2">
              <form action={submit}>
                <input type="hidden" name="findingId" value={f.id} />
                <input type="hidden" name="decision" value="ACCEPTED" />
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  <Check /> Accept
                </Button>
              </form>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDismissing(true)}>
                <CircleSlash /> Dismiss
              </Button>
            </div>
          )}
          {dismissing && (
            <form action={submit} className="space-y-2 rounded-md border bg-zinc-50 p-2">
              <input type="hidden" name="findingId" value={f.id} />
              <input type="hidden" name="decision" value="DISMISSED" />
              <select name="dismissReason" required defaultValue="" className="h-8 w-full rounded-md border bg-card px-2 text-sm">
                <option value="" disabled>
                  Reason (required)…
                </option>
                {DISMISS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </select>
              <input name="dismissNote" placeholder="Note (required for Other)" maxLength={500} className="h-8 w-full rounded-md border bg-card px-2 text-sm" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Confirm dismiss
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setDismissing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {f.decision !== "PENDING" && (
            <form action={submit}>
              <input type="hidden" name="findingId" value={f.id} />
              <input type="hidden" name="decision" value="PENDING" />
              <Button type="submit" size="xs" variant="ghost" disabled={pending}>
                <RotateCcw /> Reopen
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
