"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { assignReviewer } from "@/app/actions/submissions";

export function AssignSelect({ submissionId, current, reviewers, compact = false }: { submissionId: string; current: string | null; reviewers: { id: string; name: string }[]; compact?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          try {
            await assignReviewer(fd);
            toast.success("Assignee updated");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <input type="hidden" name="submissionId" value={submissionId} />
      {!compact && <label htmlFor={`assignee-${submissionId}`}>Assignee</label>}
      <select
        id={`assignee-${submissionId}`}
        aria-label="Assignee"
        name="assigneeId"
        defaultValue={current ?? ""}
        disabled={pending}
        onChange={() => ref.current?.requestSubmit()}
        className="h-7 rounded-md border bg-card px-2 text-xs text-foreground"
      >
        <option value="">Unassigned</option>
        {reviewers.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </form>
  );
}
