import Link from "next/link";
import { BadgeCheck, CircleSlash, ClipboardList, MessageSquareWarning, Radar, Wand2 } from "lucide-react";
import { SeverityBadge } from "@/components/badges";
import { CopyButton } from "@/components/copy-button";

const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function approvalId(decisionId: string, at: Date) {
  return `CP-${at.getFullYear()}-${decisionId.slice(-6).toUpperCase()}`;
}

/** Shown on approved submissions: the hand-off to launch, with the exact approved copy. */
export function ApprovedPanel(props: {
  decisionId: string;
  approvedAt: Date;
  approvedBy: string;
  versionNumber: number;
  copy: string;
  hasImage: boolean;
  monitoredUrl: string | null;
  overrideNote: string | null;
}) {
  const id = approvalId(props.decisionId, props.approvedAt);
  return (
    <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 size-6 shrink-0 text-emerald-700" />
          <div>
            <h2 className="text-base font-semibold text-emerald-900">Approved: ready to launch</h2>
            <p className="text-sm text-emerald-900/80">
              Approval <span className="font-mono font-semibold">{id}</span> · v{props.versionNumber} · approved by {props.approvedBy} on {fmt(props.approvedAt)}
            </p>
          </div>
        </div>
        <CopyButton text={id} label="Copy approval ID" />
      </div>
      {props.overrideNote && <p className="mt-2 text-xs text-amber-800">Approved with an override: {props.overrideNote}</p>}
      <div className="mt-3 rounded-lg border border-emerald-200 bg-card p-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Approved copy: launch exactly this text{props.hasImage ? " (and the attached image)" : ""}</span>
          <CopyButton text={props.copy} label="Copy text" />
        </div>
        <pre className="max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap text-foreground">{props.copy}</pre>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-emerald-900/80">
        <li>• Reference the approval ID in your campaign tool. Any change to the copy needs a new review.</li>
        {props.monitoredUrl ? (
          <li className="flex items-center gap-1">
            <Radar className="size-3.5" /> Monitoring is active for <span className="font-mono">{props.monitoredUrl}</span>: if the live page changes, it goes back to compliance automatically.
          </li>
        ) : (
          <li>• The approval and every step leading to it are recorded in the audit log.</li>
        )}
      </ul>
    </section>
  );
}

type F = { id: string; ruleCode: string; ruleTitle: string; severity: string; quote: string; missing: boolean; suggestedFix: string | null; decision: string; dismissReason: string | null };

/** Shown after "Request changes" / "Reject": what the reviewer decided, as an actionable checklist. */
export function FeedbackPanel(props: {
  outcome: "CHANGES_REQUESTED" | "REJECTED";
  reviewer: string;
  at: Date;
  message: string | null;
  versionNumber: number;
  findings: F[];
  canAct: boolean;
}) {
  const confirmed = props.findings.filter((f) => f.decision === "ACCEPTED");
  const pending = props.findings.filter((f) => f.decision === "PENDING");
  const waived = props.findings.filter((f) => f.decision === "DISMISSED");
  const toFix = [...confirmed, ...pending];
  const rejected = props.outcome === "REJECTED";
  return (
    <section className={`rounded-xl border p-4 shadow-sm ${rejected ? "border-zinc-300 bg-zinc-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        <MessageSquareWarning className={`mt-0.5 size-6 shrink-0 ${rejected ? "text-zinc-600" : "text-amber-700"}`} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{rejected ? "Rejected by compliance" : "Changes requested"}</h2>
          <p className="text-sm text-muted-foreground">
            {props.reviewer} reviewed v{props.versionNumber} on {fmt(props.at)}
          </p>
          {props.message && <blockquote className="mt-2 border-l-2 border-current/30 pl-3 text-sm italic">&ldquo;{props.message}&rdquo;</blockquote>}
        </div>
      </div>

      {toFix.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <ClipboardList className="size-3.5" /> {rejected ? "Reasons" : "What to fix"} ({toFix.length})
          </div>
          <ul className="space-y-1.5">
            {toFix.map((f) => (
              <li key={f.id} className="rounded-md border bg-card px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-mono font-semibold">{f.ruleCode}</span>
                  <span className="text-muted-foreground">{f.ruleTitle}</span>
                  {f.decision === "ACCEPTED" && <span className="ml-auto text-[11px] font-medium text-emerald-700">Confirmed by reviewer</span>}
                </div>
                {!f.missing && <div className="mt-1 font-mono text-muted-foreground">&ldquo;{f.quote.slice(0, 160)}&rdquo;</div>}
                {f.suggestedFix && <div className="mt-1 text-emerald-800">→ {f.suggestedFix}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {waived.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <CircleSlash className="size-3.5" /> Not required (dismissed by the reviewer): {waived.map((f) => f.ruleCode).join(", ")}
        </p>
      )}
      {props.canAct && !rejected && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href="#rewrite" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90">
            <Wand2 className="size-4" /> Fix with AI rewrite
          </Link>
          <Link href="#resubmit" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 font-medium hover:bg-muted">
            Edit &amp; resubmit
          </Link>
        </div>
      )}
      {rejected && <p className="mt-3 text-xs text-muted-foreground">Rejected submissions are closed. Start a new submission if the campaign is reworked.</p>}
    </section>
  );
}
