"use client";

import { useRef, useState, useTransition } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { addManualFinding } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";

type RuleOpt = { code: string; title: string; severity: string };

/**
 * Wraps the content view. A reviewer selects text → "Add finding" → picks a rule and explains.
 * Offsets are computed from the DOM selection (the rendered text equals contentText exactly)
 * and re-verified on the server against the stored text, so human findings are grounded too.
 */
export function SelectionFinding({ versionId, rules, enabled, children }: { versionId: string; rules: RuleOpt[]; enabled: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState("");
  const [pending, start] = useTransition();

  function capture() {
    if (!enabled || open) return;
    const s = window.getSelection();
    const root = ref.current;
    if (!s || s.rangeCount === 0 || s.isCollapsed || !root) return setSel(null);
    const r = s.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return setSel(null);
    const pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(r.startContainer, r.startOffset);
    const startOffset = pre.toString().length;
    const quote = r.toString();
    if (quote.trim().length < 3) return setSel(null);
    setSel({ start: startOffset, end: startOffset + quote.length, quote });
  }

  const ruleObj = rules.find((r) => r.code === rule);

  return (
    <div>
      <div ref={ref} onMouseUp={capture} onKeyUp={capture} className={enabled ? "selection:bg-indigo-200 dark:selection:bg-indigo-500/40" : undefined}>
        {children}
      </div>
      {enabled && !sel && !open && <p className="mt-3 text-[11px] text-muted-foreground">Tip: select any text above to add a reviewer finding.</p>}
      {enabled && sel && !open && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <span className="max-w-[28rem] truncate font-mono">&ldquo;{sel.quote}&rdquo;</span>
          <Button type="button" size="xs" onClick={() => setOpen(true)}>
            <MessageSquarePlus /> Add finding
          </Button>
          <button type="button" className="ml-auto text-indigo-900/70 hover:text-indigo-900" onClick={() => setSel(null)} aria-label="Clear selection">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {enabled && sel && open && (
        <form
          action={(fd) =>
            start(async () => {
              try {
                await addManualFinding(fd);
                toast.success("Finding added");
                setOpen(false);
                setSel(null);
                setRule("");
                window.getSelection()?.removeAllRanges();
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
          className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3"
        >
          <input type="hidden" name="versionId" value={versionId} />
          <input type="hidden" name="startOffset" value={sel.start} />
          <input type="hidden" name="endOffset" value={sel.end} />
          <input type="hidden" name="quote" value={sel.quote} />
          <div className="font-mono text-xs text-muted-foreground">&ldquo;{sel.quote.slice(0, 200)}&rdquo;</div>
          <select name="ruleCode" required value={rule} onChange={(e) => setRule(e.target.value)} className="h-8 w-full rounded-md border bg-card px-2 text-sm">
            <option value="" disabled>
              Rule…
            </option>
            {rules.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} — {r.title}
              </option>
            ))}
          </select>
          {ruleObj && <p className="text-[11px] text-muted-foreground">Severity comes from the rule: {ruleObj.severity}</p>}
          <textarea name="explanation" required maxLength={600} rows={2} placeholder="Why this violates the rule (required)" className="w-full rounded-md border bg-card p-2 text-sm" />
          <input name="suggestedFix" maxLength={600} placeholder="Suggested fix (optional)" className="h-8 w-full rounded-md border bg-card px-2 text-sm" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Add finding
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
