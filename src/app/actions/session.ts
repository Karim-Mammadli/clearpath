"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { USER_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";

export async function switchUser(formData: FormData) {
  const userId = z.string().min(1).max(64).parse(formData.get("userId"));
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return;
  (await cookies()).set(USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect(user.role === "REVIEWER" || user.role === "ADMIN" ? "/queue" : "/submissions");
}
