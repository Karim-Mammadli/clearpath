import { diffWordsWithSpace } from "diff";

export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = diffWordsWithSpace(before, after);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + p.value.length, 0);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + p.value.length, 0);
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        <span className="text-emerald-700">+{added} chars added</span> · <span className="text-red-700">−{removed} chars removed</span>
      </div>
      <div className="font-mono text-[13px] leading-6 whitespace-pre-wrap break-words">
        {parts.map((p, i) =>
          p.added ? (
            <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline">
              {p.value}
            </ins>
          ) : p.removed ? (
            <del key={i} className="bg-red-100 text-red-800">
              {p.value}
            </del>
          ) : (
            <span key={i} className="text-zinc-500">
              {p.value}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
