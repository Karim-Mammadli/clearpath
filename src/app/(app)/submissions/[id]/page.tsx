import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { addComment } from "@/app/actions/submissions";
import { ModeBadge, Pill, RiskBadge, StatusBadge } from "@/components/badges";
import { Panel } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { AssignSelect } from "@/components/review/assign-select";
import { ContentView } from "@/components/review/content-view";
import { DecisionBar } from "@/components/review/decision-bar";
import { DiffView } from "@/components/review/diff-view";
import { FindingCard, type FindingView } from "@/components/review/finding-card";
import { ResubmitForm } from "@/components/review/resubmit-form";
import { Button } from "@/components/ui/button";
import { canSubmit, canViewSubmission, getCurrentUser, isReviewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { label, SEVERITY_RANK, type SeverityCode } from "@/lib/domain";
import type { ExtractionMeta } from "@/lib/extract";
import { computeRisk } from "@/lib/review/scoring";
import { cn } from "@/lib/utils";
import { editableText } from "@/lib/versions";

export const maxDuration = 120; // resubmission re-runs the AI review inside a server action

const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string; diff?: string; new?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();

  const sub = await db.submission.findUnique({
    where: { id },
    include: {
      submitter: true,
      affiliate: true,
      assignedReviewer: true,
      monitored: true,
      versions: {
        orderBy: { versionNumber: "asc" },
        include: {
          createdBy: true,
          image: { select: { id: true, name: true, mime: true, sizeBytes: true, visual: true, transcript: true } },
          findings: { include: { decidedBy: true } },
          aiReviews: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      comments: { orderBy: { createdAt: "asc" }, include: { author: true } },
      decisions: { orderBy: { createdAt: "asc" }, include: { reviewer: true } },
    },
  });
  if (!sub || !canViewSubmission(user, sub)) notFound();

  const reviewer = isReviewer(user);
  if (reviewer && !sub.firstOpenedByReviewerAt) {
    await db.submission.update({ where: { id }, data: { firstOpenedByReviewerAt: new Date() } });
  }

  const [rules, reviewers] = await Promise.all([
    db.rule.findMany({ select: { code: true, title: true, citation: true } }),
    reviewer ? db.user.findMany({ where: { role: { in: ["REVIEWER", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const ruleMap = new Map(rules.map((r) => [r.code, r]));

  const vNum = Math.min(Math.max(1, Number(sp.v) || sub.currentVersionNumber), sub.versions.length);
  const version = sub.versions.find((v) => v.versionNumber === vNum) ?? sub.versions[sub.versions.length - 1];
  const prev = sub.versions.find((v) => v.versionNumber === version.versionNumber - 1);
  const ai = version.aiReviews[0];
  const showDiff = sp.diff === "1" && !!prev;
  const isCurrent = version.versionNumber === sub.currentVersionNumber;
  const meta = (version.extractionMeta as (ExtractionMeta & { image?: { name: string; transcribed: boolean; note: string | null } | null }) | null) ?? null;

  const findings: FindingView[] = [...version.findings]
    .sort((a, b) => SEVERITY_RANK[b.severity as SeverityCode] - SEVERITY_RANK[a.severity as SeverityCode] || a.startOffset - b.startOffset)
    .map((f) => ({
      id: f.id,
      ruleCode: f.ruleCode,
      ruleTitle: ruleMap.get(f.ruleCode)?.title ?? f.ruleCode,
      citation: ruleMap.get(f.ruleCode)?.citation ?? "",
      source: f.source,
      severity: f.severity,
      quote: f.quote,
      missing: f.missing,
      explanation: f.explanation,
      suggestedFix: f.suggestedFix,
      confidence: f.confidence,
      decision: f.decision,
      dismissReason: f.dismissReason,
      dismissNote: f.dismissNote,
      previouslyDismissed: f.previouslyDismissed,
      decidedBy: f.decidedBy?.name ?? null,
    }));

  const risk = computeRisk(version.findings.map((f) => ({ severity: f.severity as SeverityCode, decision: f.decision })), ai?.injectionSuspected ?? false);
  const blockingCriticals = version.findings.filter((f) => f.severity === "CRITICAL" && f.decision !== "DISMISSED").length;

  // Resolved vs new compared with the previous version (by rule + quote).
  const key = (f: { ruleCode: string; quote: string }) => `${f.ruleCode}|${f.quote}`;
  const prevKeys = new Set(prev?.findings.map(key) ?? []);
  const curKeys = new Set(version.findings.map(key));
  const resolved = prev ? prev.findings.filter((f) => !curKeys.has(key(f))) : [];
  const newCount = prev ? version.findings.filter((f) => !prevKeys.has(key(f))).length : 0;

  const groups = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => ({ sev, items: findings.filter((f) => f.severity === sev) })).filter((g) => g.items.length);
  const canResubmit = canSubmit(user) && isCurrent && (sub.status === "IN_REVIEW" || sub.status === "CHANGES_REQUESTED" || sub.status === "DRIFT_DETECTED");
  const editable = editableText(version.contentText);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href={reviewer ? "/queue" : "/submissions"} className="hover:underline">
              {reviewer ? "Queue" : "My submissions"}
            </Link>{" "}
            / {sub.id.slice(-6)}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{sub.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <StatusBadge status={sub.status} />
            <Pill>{label(sub.product)}</Pill>
            <Pill>{label(sub.channel)}</Pill>
            <Pill>
              {sub.submitter.name}
              {sub.affiliate ? ` · ${sub.affiliate.name} (affiliate)` : ""}
            </Pill>
            {sub.launchDate && <Pill>Launch {sub.launchDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Pill>}
            {sub.sourceUrl && (
              <a href={sub.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline">
                Source page <ExternalLink className="size-3" />
              </a>
            )}
            {sub.monitored && <Pill className={sub.monitored.status === "DRIFT" ? "border-red-200 bg-red-50 text-red-700" : ""}>Monitored · {sub.monitored.status}</Pill>}
          </div>
        </div>
        {reviewer && <AssignSelect submissionId={sub.id} current={sub.assignedReviewerId} reviewers={reviewers} />}
      </div>

      {sp.new && !reviewer && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-900">
          Submitted. The AI pre-check is done — fix any issues below and resubmit now, before a reviewer picks it up.
        </div>
      )}
      {sub.status === "DRIFT_DETECTED" && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <strong>Drift detected.</strong> The live affiliate page no longer matches the approved version. Version {sub.currentVersionNumber} was captured automatically by monitoring and re-reviewed.
            Compare with the approved version below.
          </div>
        </div>
      )}
      {ai?.injectionSuspected && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-600 px-4 py-3 text-sm text-white">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <strong>Suspected prompt injection / hidden content.</strong> This content contains text aimed at AI reviewers or hidden from consumers. It was treated as data and did not change the
            review. Escalate to the compliance lead and verify the submitter.
            {meta && (meta.hiddenText.length > 0 || meta.comments.length > 0 || meta.zeroWidthCount > 0) && (
              <span className="opacity-90">
                {" "}
                (Extraction found {meta.hiddenText.length} hidden element(s), {meta.comments.length} HTML comment(s), {meta.zeroWidthCount} invisible character(s).)
              </span>
            )}
          </div>
        </div>
      )}
      {ai?.status === "PARTIAL" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <strong>AI review unavailable — rule-based checks only.</strong> {ai.statusNote ?? ""} Rule-based findings below are complete; judgment-based rules (e.g. ECOA,
          substantiation) were not AI-checked.
        </div>
      )}

      {meta?.image?.note && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <strong>Image not analyzed.</strong> {meta.image.note}. Review the attached image manually.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Left: content */}
        <div className="space-y-4">
          <Panel
            title={
              <div className="flex flex-wrap items-center gap-2">
                <span>Content</span>
                <div className="flex gap-1">
                  {sub.versions.map((v) => (
                    <Link
                      key={v.id}
                      href={`/submissions/${sub.id}?v=${v.versionNumber}`}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-xs font-normal",
                        v.versionNumber === version.versionNumber ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-zinc-50",
                      )}
                    >
                      v{v.versionNumber}
                      {v.source === "MONITOR" ? " · monitor" : ""}
                    </Link>
                  ))}
                </div>
              </div>
            }
            actions={
              prev && (
                <Link href={`/submissions/${sub.id}?v=${version.versionNumber}${showDiff ? "" : "&diff=1"}`} className="text-xs text-indigo-700 hover:underline">
                  {showDiff ? "Show highlights" : `Compare with v${prev.versionNumber}`}
                </Link>
              )
            }
          >
            <div className="mb-3 text-xs text-muted-foreground">
              v{version.versionNumber} · {label(version.source)} · {version.createdBy?.name ?? "system"} · {fmt(version.createdAt)}
              {!isCurrent && <span className="ml-2 font-medium text-amber-700">(not the current version)</span>}
            </div>
            {showDiff && prev ? <DiffView before={prev.contentText} after={version.contentText} /> : <ContentView text={version.contentText} findings={version.findings} />}
            {prev && (
              <div className="mt-4 rounded-md border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                Since v{prev.versionNumber}: <span className="font-medium text-emerald-700">{resolved.length} finding(s) resolved</span> ·{" "}
                <span className="font-medium text-orange-700">{newCount} new</span>
                {resolved.length > 0 && <span className="text-muted-foreground"> ({[...new Set(resolved.map((f) => f.ruleCode))].join(", ")})</span>}
              </div>
            )}
          </Panel>

          {version.image && (
            <Panel title={`Attached image · ${version.image.name}`}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, sniffed image from our API */}
                <img src={`/api/images/${version.id}`} alt={`Submitted creative: ${version.image.name}`} className="max-h-[480px] w-full rounded-md border object-contain" />
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    The text in this image was transcribed by AI into the content above (section &ldquo;IMAGE TEXT&rdquo;), so rule-based checks, the AI reviewer and grounding all run on it. Compare the
                    transcription against the image before relying on it.
                  </p>
                  {version.image.visual && (
                    <p>
                      <span className="font-medium text-foreground">Visual elements: </span>
                      {version.image.visual}
                    </p>
                  )}
                  <p>
                    {version.image.mime} · {(version.image.sizeBytes / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
            </Panel>
          )}

          {canResubmit && (
            <Panel title="Fix and resubmit">
              <p className="mb-2 text-sm text-muted-foreground">Edit the content and submit a new version. All checks re-run and the reviewer sees a diff.</p>
              <ResubmitForm submissionId={sub.id} initial={editable} hasImage={!!version.image} />
            </Panel>
          )}

          <Panel title={`Comments (${sub.comments.length})`}>
            <div className="space-y-3">
              {sub.comments.map((c) => (
                <div key={c.id} className="flex gap-3 text-sm">
                  <Avatar name={c.author.name} role={c.author.role} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.author.name}</span> · {label(c.author.role)} · {fmt(c.createdAt)}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                </div>
              ))}
              {sub.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              <form action={addComment} className="flex gap-2 pt-2">
                <input type="hidden" name="submissionId" value={sub.id} />
                <input type="hidden" name="versionId" value={version.id} />
                <Avatar name={user.name} role={user.role} />
                <input name="body" required maxLength={4000} placeholder="Add a comment…" className="h-9 flex-1 rounded-md border bg-card px-3 text-sm" />
                <Button type="submit" variant="outline">
                  Comment
                </Button>
              </form>
            </div>
          </Panel>

          {sub.decisions.length > 0 && (
            <Panel title="Decision history">
              <ul className="space-y-2 text-sm">
                {sub.decisions.map((d) => (
                  <li key={d.id}>
                    <StatusBadge status={d.outcome} /> <span className="font-medium">{d.reviewer.name}</span> · v{sub.versions.find((v) => v.id === d.versionId)?.versionNumber} ·{" "}
                    <span className="text-muted-foreground">{fmt(d.createdAt)}</span>
                    {d.reason && <div className="mt-0.5 text-xs text-zinc-600">{d.reason}</div>}
                    {d.overrideNote && <div className="mt-0.5 text-xs text-red-700">Override: {d.overrideNote}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* Right: AI summary + findings + decision */}
        <div className="space-y-4">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-violet-600" /> Pre-review
              </span>
            }
            actions={ai && <ModeBadge mode={ai.mode} />}
          >
            {ai ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-semibold tabular-nums">{risk.score}</div>
                  <div>
                    <RiskBadge level={risk.level} />
                    <div className="mt-1 text-xs text-muted-foreground">Risk score (computed in code from open findings)</div>
                  </div>
                </div>
                <div className="rounded-md bg-zinc-50 px-2 py-1.5 font-mono text-[11px] text-zinc-700">Why: {risk.text}</div>
                <p className="text-sm text-zinc-700">{ai.summary}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>Model: {ai.model ?? "—"}</span>
                  <span>Prompt: {ai.promptVersion}</span>
                  <span>Rule set: v{ai.ruleSetVersion}</span>
                  {ai.cacheHit && <span className="text-emerald-700">Cache hit ($0)</span>}
                  {ai.latencyMs !== null && <span>{(ai.latencyMs / 1000).toFixed(1)}s</span>}
                  {ai.discardedFindings > 0 && (
                    <span className="text-amber-700" title={JSON.stringify(ai.discarded)}>
                      {ai.discardedFindings} ungrounded AI finding(s) discarded
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">AI findings are advisory. A human reviewer makes every decision.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No review yet.</p>
            )}
          </Panel>

          {reviewer && isCurrent && sub.status !== "APPROVED" && sub.status !== "REJECTED" && (
            <Panel title="Decision">
              <DecisionBar submissionId={sub.id} versionNumber={version.versionNumber} blockingCriticals={blockingCriticals} />
            </Panel>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">
              Findings <span className="font-normal text-muted-foreground">({findings.filter((f) => f.decision !== "DISMISSED").length} open)</span>
            </h2>
            {findings.length === 0 && <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-emerald-700">No findings. Ready for a quick human check.</div>}
            {groups.map((g) => (
              <div key={g.sev} className="space-y-2">
                {g.items.map((f) => (
                  <FindingCard key={f.id} f={f} canDecide={reviewer && isCurrent} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
