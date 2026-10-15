"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Radar,
  ScrollText,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  submit: Send,
  submissions: FileText,
  queue: ClipboardCheck,
  rules: BookOpen,
  monitoring: Radar,
  aiops: Activity,
  evals: FlaskConical,
  audit: ScrollText,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900",
              active && "bg-primary/10 font-medium text-primary hover:bg-primary/15 hover:text-primary",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && (
              <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white tabular-nums">{it.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
