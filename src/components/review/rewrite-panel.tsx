"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { generateCompliantRewrite, type RewriteResult } from "@/app/actions/rewrite";
import { resubmit, type FormState } from "@/app/actions/submissions";
import { SeverityBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { findPlaceholders } from "@/lib/review/placeholders";

function SubmitRewrite() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Submitting & re-checking…" : "Submit as new version"}
    </Button>
  );
}

export function RewritePanel({ submissionId, canSubmitVersion }: { submissionId: string; canSubmitVersion: boolean }) {
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [pending, start] = useTransition();
  const [state, action] = useActionState<FormState, FormData>(resubmit, undefined);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The AI rewrites the copy to fix every open finding, using approved ClearPath facts (address, NMLS #, standard disclaimers) and clearly marked{" "}
        <code className="rounded bg-muted px-1">[PLACEHOLDERS]</code> instead of inventing rates or terms. The rewrite is then automatically re-checked by the full pipeline before
        anyone can submit it.
      </p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setResult(await generateCompliantRewrite(submissionId)))}>
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {pending ? "Rewriting and re-checking… (~20–40s)" : result ? "Regenerate rewrite" : "Generate compliant rewrite"}
      </Button>

      {result && !result.ok && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.error}</div>}

      {result?.ok && (
        <div className="space-y-3">
          {result.check.passes ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="size-4" /> Rewrite passes all checks
              {result.check.mode !== "live" && <span className="font-normal">({result.check.mode === "mock" ? "mock AI" : "rule-based checks only"})</span>}
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4" /> Re-check found {result.check.findings.length} remaining issue(s) · risk {result.check.riskScore}
              </div>
              <ul className="mt-1 space-y-1">
                {result.check.findings.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <SeverityBadge severity={f.severity} /> <span className="font-mono font-semibold">{f.ruleCode}</span>
                    <span className="text-amber-900/80">{f.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.changes.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {result.changes.map((c, i) => (
                <li key={i}>
                  <span className="font-mono font-semibold text-foreground">{c.rule_code}</span> — {c.what_changed}
                </li>
              ))}
            </ul>
          )}
          {result.notes && <p className="text-xs text-muted-foreground">Note: {result.notes}</p>}
          {findPlaceholders(result.rewritten).length > 0 && (
            <p className="rounded-md border border-dashed border-amber-300 px-3 py-2 text-xs text-amber-900">
              Fill in {findPlaceholders(result.rewritten).join(", ")} with the real values. The re-check treats placeholders as missing, so any remaining rate/fee
              findings above usually clear once they&apos;re filled. Submitting with unfilled placeholders is blocked, and the full pipeline runs again on submit.
            </p>
          )}

          {canSubmitVersion ? (
            <form action={action} className="space-y-2">
              <input type="hidden" name="submissionId" value={submissionId} />
              <input type="hidden" name="fromRewrite" value="1" />
              <label className="block text-xs text-muted-foreground">Fill any [PLACEHOLDERS] and edit before submitting:</label>
              <textarea key={result.rewritten} name="content" defaultValue={result.rewritten} rows={10} className="w-full rounded-md border bg-card p-3 font-mono text-sm" />
              {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
              <SubmitRewrite />
            </form>
          ) : (
            <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">{result.rewritten}</pre>
          )}
        </div>
      )}
    </div>
  );
}
