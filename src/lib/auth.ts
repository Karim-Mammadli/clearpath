import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import type { RoleCode } from "@/lib/domain";

/**
 * Demo auth: a role switcher backed by seeded users and a cookie (no passwords).
 * Real version: SSO/SAML. All authorization decisions below are enforced server-side.
 */

export const USER_COOKIE = "cp_user";
export const DEFAULT_USER_ID = "u_sam";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  team: string | null;
  affiliateId: string | null;
  affiliateName: string | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const id = (await cookies()).get(USER_COOKIE)?.value ?? DEFAULT_USER_ID;
  const user =
    (await db.user.findUnique({ where: { id }, include: { affiliate: true } })) ??
    (await db.user.findUnique({ where: { id: DEFAULT_USER_ID }, include: { affiliate: true } }));
  if (!user) throw new Error("No users seeded. Run `npm run db:seed`.");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team,
    affiliateId: user.affiliateId,
    affiliateName: user.affiliate?.name ?? null,
  };
});

export const isReviewer = (u: { role: RoleCode }) => u.role === "REVIEWER" || u.role === "ADMIN";
export const isAdmin = (u: { role: RoleCode }) => u.role === "ADMIN";
export const canSubmit = (u: { role: RoleCode }) => u.role === "MARKETER" || u.role === "AFFILIATE" || u.role === "ADMIN";

/** Prisma `where` limiting submissions to what this user may see. */
export function submissionScope(u: CurrentUser) {
  if (isReviewer(u)) return {};
  if (u.role === "AFFILIATE") return { affiliateId: u.affiliateId ?? "__none__" };
  // Marketers see their own team's (first-party) submissions.
  return { affiliateId: null };
}

export function canViewSubmission(u: CurrentUser, s: { affiliateId: string | null }) {
  if (isReviewer(u)) return true;
  if (u.role === "AFFILIATE") return !!u.affiliateId && s.affiliateId === u.affiliateId;
  return s.affiliateId === null;
}

/** Page guard: unauthorized pages behave like missing pages (don't leak existence). */
export async function requireRole(check: (u: CurrentUser) => boolean): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!check(u)) redirect("/dashboard?denied=1");
  return u;
}

export async function requireSubmissionAccess(submissionId: string) {
  const u = await getCurrentUser();
  const s = await db.submission.findUnique({ where: { id: submissionId }, select: { id: true, affiliateId: true } });
  if (!s || !canViewSubmission(u, s)) notFound();
  return u;
}
