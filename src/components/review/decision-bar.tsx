"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { decideSubmission, type FormState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";

function Go({ children, variant }: { children: React.ReactNode; variant?: "default" | "outline" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {children}
    </Button>
  );
}

export function DecisionBar({ submissionId, versionNumber, blockingCriticals }: { submissionId: string; versionNumber: number; blockingCriticals: number }) {
  const [state, action] = useActionState<FormState, FormData>(decideSubmission, undefined);
  const [mode, setMode] = useState<null | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED">(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setMode("APPROVED")} variant={mode === "APPROVED" ? "default" : "outline"}>
          Approve
        </Button>
        <Button onClick={() => setMode("CHANGES_REQUESTED")} variant={mode === "CHANGES_REQUESTED" ? "default" : "outline"}>
          Request changes
        </Button>
        <Button onClick={() => setMode("REJECTED")} variant={mode === "REJECTED" ? "default" : "outline"}>
          Reject
        </Button>
      </div>
      {mode && (
        <form action={action} className="space-y-2 rounded-md border bg-zinc-50 p-3">
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="outcome" value={mode} />
          <input type="hidden" name="versionNumber" value={versionNumber} />
          {mode === "APPROVED" && blockingCriticals > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-red-800">
                {blockingCriticals} CRITICAL finding(s) are still pending or accepted. Approval requires an override justification (audited).
              </p>
              <textarea name="overrideNote" required rows={2} className="w-full rounded-md border bg-card p-2 text-sm" placeholder="Why is it acceptable to approve anyway?" />
            </div>
          )}
          {mode !== "APPROVED" && (
            <textarea
              name="reason"
              required={mode === "REJECTED"}
              rows={2}
              className="w-full rounded-md border bg-card p-2 text-sm"
              placeholder={mode === "REJECTED" ? "Reason (required)" : "Message to the submitter (optional)"}
            />
          )}
          <div className="flex gap-2">
            <Go variant={mode === "REJECTED" ? "destructive" : "default"}>
              Confirm {mode === "APPROVED" ? "approval" : mode === "REJECTED" ? "rejection" : "request for changes"}
            </Go>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </form>
      )}
      {state?.ok && !mode && <p className="text-sm text-emerald-700">Decision recorded.</p>}
    </div>
  );
}
