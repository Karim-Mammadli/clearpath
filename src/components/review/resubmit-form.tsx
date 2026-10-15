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

export function ResubmitForm({ submissionId, initial, hasImage }: { submissionId: string; initial: string; hasImage: boolean }) {
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
      <textarea name="content" defaultValue={initial} rows={12} className="w-full rounded-md border bg-card p-3 font-mono text-sm" />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          {hasImage ? "Replace image" : "Attach image (optional)"}
          <input type="file" name="image" accept="image/png,image/jpeg,image/gif,image/webp" className="text-xs file:mr-2 file:rounded file:border file:bg-card file:px-2 file:py-1" />
        </label>
        {hasImage && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="removeImage" /> Remove current image
          </label>
        )}
      </div>
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
