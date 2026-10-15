import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Fake affiliate pages for the monitoring demo (public). The HTML comes from our own seed data
 * (DemoAffiliatePage), never from user input, and is served as-is — including the hidden
 * injection text in the LoanFinderHub page — so extraction sees exactly what a crawler would.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const page = await db.demoAffiliatePage.findUnique({ where: { slug } });
  if (!page) return new Response("Not found", { status: 404 });
  const body = page.showChanged && page.changedHtml ? page.changedHtml : page.approvedHtml;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${page.title.replace(/[<>&"]/g, "")}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;color:#1f2937}h1{font-size:28px}h2{font-size:20px;color:#065f46}.disclosure{font-size:12px;color:#6b7280;border:1px solid #e5e7eb;padding:6px 10px}</style></head><body>${body}</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
