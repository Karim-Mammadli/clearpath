import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { RoleSwitcher } from "@/components/role-switcher";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { canSubmit, getCurrentUser, isAdmin, isReviewer } from "@/lib/auth";
import { APP } from "@/lib/config";
import { db } from "@/lib/db";
import { label } from "@/lib/domain";
import { aiMode } from "@/lib/llm/client";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [users, driftCount, queueCount] = await Promise.all([
    db.user.findMany({ include: { affiliate: true }, orderBy: { name: "asc" } }),
    isReviewer(user) ? db.submission.count({ where: { status: "DRIFT_DETECTED" } }) : Promise.resolve(0),
    isReviewer(user) ? db.submission.count({ where: { status: { in: ["IN_REVIEW", "DRIFT_DETECTED"] } } }) : Promise.resolve(0),
  ]);
  const mode = aiMode();

  const nav: NavItem[] = [{ href: "/", label: "Dashboard", icon: "dashboard" }];
  if (isReviewer(user)) nav.push({ href: "/queue", label: "Review queue", icon: "queue", badge: queueCount });
  if (canSubmit(user)) nav.push({ href: "/submit", label: "Submit content", icon: "submit" });
  nav.push({ href: "/submissions", label: isReviewer(user) ? "All submissions" : "My submissions", icon: "submissions" });
  if (isReviewer(user)) {
    nav.push({ href: "/monitoring", label: "Affiliate monitoring", icon: "monitoring", badge: driftCount });
    nav.push({ href: "/rules", label: "Rule library", icon: "rules" });
    nav.push({ href: "/audit", label: "Audit log", icon: "audit" });
  }
  if (isAdmin(user)) {
    nav.push({ href: "/ai-ops", label: "AI Ops", icon: "aiops" });
    nav.push({ href: "/evals", label: "Evals", icon: "evals" });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-full flex-col gap-4 p-3">
          <Link href="/" className="flex items-center gap-2 px-2 pt-1">
            {APP.logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- static brand asset from /public, any size/format
              <img src={APP.logoSrc} alt="" className="h-7 w-auto max-w-[2.5rem] object-contain" />
            ) : (
              <ShieldCheck className="size-5 text-emerald-600" />
            )}
            <div className="leading-tight">
              <div className="text-sm font-semibold">{APP.name}</div>
              <div className="text-[11px] text-muted-foreground">{APP.company}</div>
            </div>
          </Link>
          <SidebarNav items={nav} />
          <div className="mt-auto hidden px-2 text-[11px] leading-snug text-muted-foreground md:block">
            AI mode:{" "}
            <span className="font-medium text-zinc-700">
              {mode === "live" ? "Live (gpt-6.1-sol)" : mode === "mock" ? "Mock AI (no API key)" : "Off (rule-based only)"}
            </span>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2 md:px-6">
          <div className="text-xs text-muted-foreground">
            Signed in as <span className="font-medium text-zinc-800">{user.name}</span> · {label(user.role)}
            {user.affiliateName ? ` · ${user.affiliateName}` : user.team ? ` · ${user.team}` : ""}
          </div>
          <div className="flex items-center gap-2">
            <RoleSwitcher
              currentId={user.id}
              users={users.map((u) => ({ id: u.id, name: u.name, role: u.role, org: u.affiliate?.name ?? u.team ?? "" }))}
            />
            <ThemeToggle />
          </div>
        </header>
        {mode === "mock" && (
          <div className="border-b border-fuchsia-200 bg-fuchsia-50 px-4 py-1.5 text-xs text-fuchsia-800 md:px-6">
            Mock AI mode: no OpenAI key is configured, so AI findings come from labeled fixtures. Rule-based checks are real.
          </div>
        )}
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        <footer className="border-t px-4 py-3 text-[11px] text-muted-foreground md:px-6">{APP.disclaimer} Fictional company.</footer>
      </div>
    </div>
  );
}
