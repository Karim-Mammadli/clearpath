/** ClearPath brand mark (same artwork as src/app/icon.svg), inline so it needs no request. */
export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cp-brand-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0E7C66" />
          <stop offset="1" stopColor="#0B3B4A" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#cp-brand-bg)" />
      <path d="M15.5 33.5 L27 45 L49 19" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="49" cy="19" r="5.5" fill="#7BE0B8" />
    </svg>
  );
}
