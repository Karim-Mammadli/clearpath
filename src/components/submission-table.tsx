import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { RiskBadge, StatusBadge } from "@/components/badges";
import { label } from "@/lib/domain";
import type { SubmissionRow } from "@/lib/queries";

const DAY = 86_400_000;

function age(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  if (days >= 1) return `${days}d`;
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  return h >= 1 ? `${h}h` : "new";
}

function launch(d: Date | null) {
  if (!d) return <span className="text-muted-foreground">—</span>;
  const days = Math.ceil((d.getTime() - Date.now()) / DAY);
  const text = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return <span className={days <= 2 ? "font-medium text-red-700" : days <= 7 ? "text-amber-700" : ""}>{text}{days >= 0 && days <= 7 ? ` (${days}d)` : ""}</span>;
}

export function SubmissionTable({ rows, showPriority = false, empty = "Nothing here yet." }: { rows: SubmissionRow[]; showPriority?: boolean; empty?: string }) {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-zinc-50 text-left text-xs text-muted-foreground">
          <tr>
            {showPriority && <th className="px-3 py-2 font-medium">Priority</th>}
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Product / channel</th>
            <th className="px-3 py-2 font-medium">From</th>
            <th className="px-3 py-2 font-medium">Risk</th>
            <th className="px-3 py-2 font-medium text-right">Open findings</th>
            <th className="px-3 py-2 font-medium">Ver.</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Launch</th>
            <th className="px-3 py-2 font-medium">Age</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-zinc-50">
              {showPriority && <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.priorityScore}</td>}
              <td className="px-3 py-2">
                <Link href={`/submissions/${r.id}`} className="font-medium text-zinc-900 hover:underline">
                  {r.title}
                </Link>
                {r.injection && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-red-700">
                    <ShieldAlert className="size-3.5" /> Injection
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-600 whitespace-nowrap">
                {label(r.product)} · {label(r.channel)}
              </td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">
                {r.submitter}
                {r.affiliate && <div className="text-muted-foreground">{r.affiliate} (affiliate)</div>}
              </td>
              <td className="px-3 py-2">
                <RiskBadge level={r.riskLevel} score={r.riskScore} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.openFindings}</td>
              <td className="px-3 py-2 tabular-nums">v{r.version}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">{launch(r.launchDate)}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{age(r.createdAt)}</td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">{r.assignee ?? <span className="text-muted-foreground">Unassigned</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
