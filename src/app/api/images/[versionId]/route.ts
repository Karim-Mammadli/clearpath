import { canViewSubmission, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Serves an attached image to users allowed to see its submission. Type comes from server-side sniffing (no SVG). */
export async function GET(_req: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  const user = await getCurrentUser();
  const img = await db.submissionImage.findUnique({ where: { versionId }, include: { version: { select: { submission: { select: { affiliateId: true } } } } } });
  if (!img || !canViewSubmission(user, img.version.submission)) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(img.data), {
    headers: {
      "content-type": img.mime,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
