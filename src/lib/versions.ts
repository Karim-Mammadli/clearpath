import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { REVIEW } from "@/lib/config";
import { db } from "@/lib/db";
import { extractContent, HIDDEN_MARKER } from "@/lib/extract";
import { composeWithImageText, imageHash, transcribeImage } from "@/lib/review/image";
import { dbLlmDeps, reviewVersion } from "@/lib/review/pipeline";

export function contentHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export type NewImage = { data: Uint8Array; mime: string; name: string };
/** `new` = uploaded now; `keep` = carry the previous version's image forward; null = no image. */
export type ImageInput = { kind: "new"; image: NewImage } | { kind: "keep"; fromVersionId: string } | null;

export class ContentTooLongError extends Error {}

/** Creates the next SubmissionVersion from raw content (text or HTML) + optional image, then runs the review pipeline. */
export async function createVersionAndReview(opts: {
  submissionId: string;
  versionNumber: number;
  raw: string;
  createdById: string | null;
  source: "SUBMITTER" | "REWRITE" | "MONITOR";
  image?: ImageInput;
}) {
  const ex = extractContent(opts.raw);
  if (ex.text.length > REVIEW.maxContentChars) {
    throw new ContentTooLongError(`Extracted text is ${ex.text.length.toLocaleString()} characters; the limit is ${REVIEW.maxContentChars.toLocaleString()}. Split it into smaller assets.`);
  }

  // Resolve the image (new upload or carried forward) and its transcription.
  let img: (NewImage & { hash: string; transcript: string | null; visual: string | null }) | null = null;
  let imageNote: string | null = null;
  if (opts.image?.kind === "keep") {
    const prev = await db.submissionImage.findUnique({ where: { versionId: opts.image.fromVersionId } });
    if (prev) img = { data: prev.data, mime: prev.mime, name: prev.name, hash: prev.hash, transcript: prev.transcript, visual: prev.visual };
  } else if (opts.image?.kind === "new") {
    const hash = imageHash(opts.image.image.data);
    // Same image transcribed before → reuse ($0).
    const seen = await db.submissionImage.findFirst({ where: { hash, transcript: { not: null } }, select: { transcript: true, visual: true } });
    img = { ...opts.image.image, hash, transcript: seen?.transcript ?? null, visual: seen?.visual ?? null };
    if (!seen) {
      const t = await transcribeImage(img, dbLlmDeps(null));
      if (t.ok) {
        img.transcript = t.transcript;
        img.visual = t.visual;
      } else imageNote = t.reason;
    }
  }

  const text = img?.transcript !== null && img?.transcript !== undefined ? composeWithImageText(ex.text, HIDDEN_MARKER, img.transcript, img.visual ?? "") : ex.text;
  if (!text.trim()) throw new ContentTooLongError("Nothing to review: the content is empty and no text could be read from the image.");

  const version = await db.submissionVersion.create({
    data: {
      submissionId: opts.submissionId,
      versionNumber: opts.versionNumber,
      contentText: text,
      contentHash: contentHash(text + (img ? `|img:${img.hash}` : "")),
      source: opts.source,
      createdById: opts.createdById,
      extractionMeta: { ...ex.meta, image: img ? { name: img.name, transcribed: img.transcript !== null, note: imageNote } : null } as unknown as Prisma.InputJsonValue,
      ...(img
        ? { image: { create: { data: Buffer.from(img.data), mime: img.mime, name: img.name.slice(0, 200), sizeBytes: img.data.byteLength, hash: img.hash, transcript: img.transcript, visual: img.visual } } }
        : {}),
    },
  });
  await writeAudit({
    actorId: opts.createdById,
    action: opts.versionNumber === 1 ? "SUBMISSION_CREATED" : "VERSION_CREATED",
    entityType: "Submission",
    entityId: opts.submissionId,
    metadata: { versionNumber: opts.versionNumber, source: opts.source, versionId: version.id, image: img ? img.name : null },
  });
  const { review } = await reviewVersion(version.id, { actorId: opts.createdById });
  return { version, review };
}

/** Next version number (max + 1; robust to the demo reset pointing "current" at an older version). */
export async function nextVersionNumber(submissionId: string) {
  const agg = await db.submissionVersion.aggregate({ where: { submissionId }, _max: { versionNumber: true } });
  return (agg._max.versionNumber ?? 0) + 1;
}

/** The submitter-editable part of a version's text (without the generated image-text / hidden-content sections). */
export function editableText(contentText: string): string {
  return contentText.split(/\n\n(?=\[(?:HIDDEN CONTENT DETECTED|IMAGE TEXT) )/)[0];
}
