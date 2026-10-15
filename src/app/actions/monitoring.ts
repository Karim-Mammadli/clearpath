"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser, isAdmin, isReviewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkMonitoredUrl } from "@/lib/monitor/check";
import { appOrigin } from "@/lib/origin";
import { refreshPriority } from "@/lib/review/pipeline";

export type MonitorState = { message?: string; error?: string } | undefined;

export async function checkNow(_prev: MonitorState, formData: FormData): Promise<MonitorState> {
  const user = await getCurrentUser();
  if (!isReviewer(user)) return { error: "Only reviewers can run monitoring checks." };
  const id = z.string().parse(formData.get("monitoredId"));
  const r = await checkMonitoredUrl(id, { actorId: user.id, appOrigin: await appOrigin() });
  revalidatePath("/monitoring");
  return r.result === "OK" ? { message: "No change: live page matches the approved version." } : r.result === "DRIFT" ? { message: `Drift detected → captured as v${r.versionNumber} and re-reviewed. Compliance alerted.` } : { error: `Check failed: ${r.error}` };
}

export async function checkAll(): Promise<MonitorState> {
  const user = await getCurrentUser();
  if (!isReviewer(user)) return { error: "Only reviewers can run monitoring checks." };
  const all = await db.monitoredUrl.findMany({ select: { id: true } });
  const origin = await appOrigin();
  const results = [];
  for (const m of all) results.push(await checkMonitoredUrl(m.id, { actorId: user.id, appOrigin: origin }));
  revalidatePath("/monitoring");
  const drift = results.filter((r) => r.result === "DRIFT").length;
  return { message: `Checked ${results.length} URL(s): ${drift} drifted, ${results.filter((r) => r.result === "ERROR").length} errors.` };
}

/** Admin demo control: the affiliate "edits" their live page after approval (S13a → S13b). */
export async function simulateAffiliateEdit(formData: FormData) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error("Admin only");
  const slug = z.string().parse(formData.get("slug"));
  const page = await db.demoAffiliatePage.update({ where: { slug }, data: { showChanged: true } });
  await writeAudit({ actorId: user.id, action: "AFFILIATE_PAGE_EDIT_SIMULATED", entityType: "DemoAffiliatePage", entityId: page.id, metadata: { slug } });
  revalidatePath("/monitoring");
}

/** Admin demo control: restore the page and the submission to its approved state so the demo can be repeated. */
export async function resetAffiliateDemo(formData: FormData) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error("Admin only");
  const slug = z.string().parse(formData.get("slug"));
  const page = await db.demoAffiliatePage.update({ where: { slug }, data: { showChanged: false } });
  const monitored = await db.monitoredUrl.findFirst({ where: { url: { endsWith: `/demo/affiliates/${slug}` } }, include: { submission: true } });
  if (monitored) {
    const approved = await db.submissionVersion.findFirst({ where: { submissionId: monitored.submissionId, contentHash: monitored.approvedHash }, orderBy: { versionNumber: "desc" } });
    await db.submission.update({
      where: { id: monitored.submissionId },
      data: { status: "APPROVED", currentVersionNumber: approved?.versionNumber ?? monitored.submission.currentVersionNumber },
    });
    await db.monitoredUrl.update({ where: { id: monitored.id }, data: { status: "OK", lastHash: monitored.approvedHash } });
    await refreshPriority(monitored.submissionId);
  }
  await writeAudit({ actorId: user.id, action: "AFFILIATE_PAGE_RESET", entityType: "DemoAffiliatePage", entityId: page.id, metadata: { slug } });
  revalidatePath("/monitoring");
}
