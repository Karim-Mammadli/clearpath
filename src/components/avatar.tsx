import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  REVIEWER: "bg-indigo-600",
  ADMIN: "bg-zinc-800 dark:bg-zinc-600",
  MARKETER: "bg-emerald-600",
  AFFILIATE: "bg-amber-600",
};

/** Initials avatar, colored by role so it's easy to follow who is talking in a thread. */
export function Avatar({ name, role, className }: { name: string; role: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", ROLE_COLORS[role] ?? "bg-zinc-500", className)}
    >
      {initials}
    </span>
  );
}
