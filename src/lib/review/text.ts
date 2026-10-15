import type { Span } from "./types";

/** All matches of a global regex as spans. */
export function findAll(re: RegExp, text: string): Span[] {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const g = new RegExp(re.source, flags);
  const out: Span[] = [];
  for (const m of text.matchAll(g)) {
    if (m.index === undefined || m[0].length === 0) continue;
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

export function findFirst(res: RegExp[], text: string): Span | null {
  let best: Span | null = null;
  for (const re of res) {
    const s = findAll(re, text)[0];
    if (s && (!best || s.start < best.start)) best = s;
  }
  return best;
}

/**
 * Anchor span for "required element missing" findings: the subject line if present,
 * otherwise the first non-empty line (trimmed to its first sentence when long).
 */
export function anchorSpan(text: string): Span {
  const subject = /^subject:.*$/im.exec(text);
  if (subject) return { start: subject.index, end: subject.index + subject[0].trimEnd().length, text: subject[0].trimEnd() };
  const line = /\S[^\n]*/.exec(text);
  if (!line) return { start: 0, end: 0, text: "" };
  let s = line[0].trimEnd();
  if (s.length > 160) {
    const m = /^.{20,160}?[.!?](?=\s|$)/.exec(s);
    s = m ? m[0] : s.slice(0, 160);
  }
  return { start: line.index, end: line.index + s.length, text: s };
}

/** Characters that are invisible to readers but present in text (zero-width + bidi controls). */
export const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤﻿]/g;

export function normalizeLineEndings(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}
