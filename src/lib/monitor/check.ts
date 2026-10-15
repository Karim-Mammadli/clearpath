import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { extractContent } from "@/lib/extract";
import { isOwnDemoPage, resolveUrl, safeFetchHtml } from "@/lib/fetch";
import { refreshPriority } from "@/lib/review/pipeline";
import { contentHash, createVersionAndReview, nextVersionNumber } from "@/lib/versions";

/**
 * Affiliate drift monitoring: "approved once, then drifts". Fetch the live page, extract text
 * (same extractor as submissions, so hidden text counts), hash, and compare with the hash of the
 * approved version. On change: capture a new version (source MONITOR), re-run the full review,
 * flip the submission to DRIFT_DETECTED and alert compliance.
 */
export async function checkMonitoredUrl(monitoredId: string, opts: { actorId: string | null; appOrigin: string }) {
  const m = await db.monitoredUrl.findUniqueOrThrow({ where: { id: monitoredId }, include: { submission: true } });
  const url = resolveUrl(m.url, opts.appOrigin);

  let html: string;
  try {
    html = (await safeFetchHtml(m.url, opts.appOrigin)).html;
  } catch (e) {
    // Our own demo pages are served from the DB; if the self-fetch fails (e.g. deployment protection), read them directly.
    const slug = isOwnDemoPage(url, opts.appOrigin) ? url.pathname.split("/").pop() : null;
    const page = slug ? await db.demoAffiliatePage.findUnique({ where: { slug } }) : null;
    if (!page) {
      const error = (e as Error).message.slice(0, 300);
      await db.monitoredUrl.update({ where: { id: m.id }, data: { status: "ERROR", lastError: error, lastCheckedAt: new Date() } });
      await writeAudit({ actorId: opts.actorId, action: "MONITOR_CHECKED", entityType: "MonitoredUrl", entityId: m.id, metadata: { result: "ERROR", error } });
      return { result: "ERROR" as const, error };
    }
    html = page.showChanged && page.changedHtml ? page.changedHtml : page.approvedHtml;
  }

  const text = extractContent(html).text;
  const hash = contentHash(text);
  const now = new Date();

  if (hash === m.approvedHash) {
    await db.monitoredUrl.update({ where: { id: m.id }, data: { status: "OK", lastHash: hash, lastCheckedAt: now, lastError: null } });
    await writeAudit({ actorId: opts.actorId, action: "MONITOR_CHECKED", entityType: "MonitoredUrl", entityId: m.id, metadata: { result: "OK", submissionId: m.submissionId } });
    return { result: "OK" as const };
  }

  // Changed. Don't capture the same drifted content twice.
  const current = await db.submissionVersion.findFirst({ where: { submissionId: m.submissionId, versionNumber: m.submission.currentVersionNumber } });
  let versionNumber = m.submission.currentVersionNumber;
  if (current?.contentHash !== hash) {
    versionNumber = await nextVersionNumber(m.submissionId);
    await db.submission.update({ where: { id: m.submissionId }, data: { currentVersionNumber: versionNumber } });
    await createVersionAndReview({ submissionId: m.submissionId, versionNumber, raw: html, createdById: null, source: "MONITOR" });
  }
  await db.submission.update({ where: { id: m.submissionId }, data: { status: "DRIFT_DETECTED", decidedAt: null } });
  await db.monitoredUrl.update({ where: { id: m.id }, data: { status: "DRIFT", lastHash: hash, lastCheckedAt: now, lastError: null } });
  await writeAudit({
    actorId: opts.actorId,
    action: "DRIFT_DETECTED",
    entityType: "Submission",
    entityId: m.submissionId,
    metadata: { monitoredUrlId: m.id, url: m.url, approvedHash: m.approvedHash.slice(0, 12), liveHash: hash.slice(0, 12), versionNumber },
  });
  await refreshPriority(m.submissionId);
  return { result: "DRIFT" as const, versionNumber };
}
