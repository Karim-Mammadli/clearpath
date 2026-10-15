"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { resubmit, type FormState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";

function Go() {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Re-running checks…" : "Submit new version"}
      </Button>
      {pending && <span className="text-xs text-muted-foreground">Running rule-based checks and the AI pre-reviewer…</span>}
    </div>
  );
}

export function ResubmitForm({ submissionId, initial }: { submissionId: string; initial: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(resubmit, undefined);
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit &amp; resubmit
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <textarea name="content" defaultValue={initial} rows={12} className="w-full rounded-md border bg-white p-3 font-mono text-sm" />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <Go />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
