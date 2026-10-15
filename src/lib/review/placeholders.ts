/** Unfilled placeholders like [APR RANGE] or [GO-TO APR] (client-safe; no server imports). */
export const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9 _\-\/%&]{2,}\]/g;
export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
}
