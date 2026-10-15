import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { INVISIBLE_CHARS, normalizeLineEndings } from "@/lib/review/text";

export const HIDDEN_MARKER = "[HIDDEN CONTENT DETECTED — not visible to consumers]";

export type ExtractionMeta = {
  isHtml: boolean;
  hiddenText: string[];
  comments: string[];
  zeroWidthCount: number;
  title?: string;
};

export type Extracted = { text: string; meta: ExtractionMeta };

const BLOCK_TAGS =
  "address,article,aside,blockquote,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tr,ul";

const HIDDEN_STYLE: RegExp[] = [
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /font-size\s*:\s*(0|1px|0\.\d+\w*|0px)\b/i,
  /opacity\s*:\s*0(\.0+)?\s*(;|$)/i,
  /(^|;)\s*color\s*:\s*(#fff\b|#ffffff\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i,
];

export function looksLikeHtml(s: string): boolean {
  return /<(?:!--|[a-z][a-z0-9]*\b[^>]*>)/i.test(s);
}

function isHidden(el: Element): boolean {
  const attrs = el.attribs ?? {};
  if ("hidden" in attrs) return true;
  if (attrs["aria-hidden"] === "true") return true;
  const style = attrs.style ?? "";
  return HIDDEN_STYLE.some((re) => re.test(style));
}

function collapse(s: string): string {
  return s.replace(/[ \t\f\v ]+/g, " ").trim();
}

/**
 * Turns submitted content (plain text or HTML) into the canonical text that is reviewed and
 * highlighted. Hidden content is NOT silently dropped: it is appended in a clearly labeled
 * section so it can be quoted, flagged and seen by the human reviewer.
 */
export function extractContent(input: string): Extracted {
  const raw = normalizeLineEndings(input);
  const meta: ExtractionMeta = { isHtml: false, hiddenText: [], comments: [], zeroWidthCount: 0 };

  let visible: string;
  if (looksLikeHtml(raw)) {
    meta.isHtml = true;
    const $ = cheerio.load(raw);
    $("script, style, noscript, template").remove();
    meta.title = collapse($("title").first().text()) || undefined;
    $("head").remove();

    // HTML comments
    const walk = (nodes: AnyNode[]) => {
      for (const n of nodes) {
        if (n.type === "comment") {
          const c = collapse((n as unknown as { data: string }).data ?? "");
          if (c) meta.comments.push(c);
        } else if ("children" in n && Array.isArray(n.children)) {
          walk(n.children as AnyNode[]);
        }
      }
    };
    walk($.root().contents().toArray());
    $.root()
      .find("*")
      .contents()
      .filter((_, n) => n.type === "comment")
      .remove();
    $.root()
      .contents()
      .filter((_, n) => n.type === "comment")
      .remove();

    // Hidden elements (outermost first, so nested hidden text is captured once)
    $("*").each((_, el) => {
      if (el.type !== "tag") return;
      if (!$(el).parent().length) return; // already removed
      if (isHidden(el)) {
        const t = collapse($(el).text());
        if (t) meta.hiddenText.push(t);
        $(el).remove();
      }
    });

    $("br").replaceWith("\n");
    $(BLOCK_TAGS).each((_, el) => {
      $(el).prepend("\n").append("\n");
    });
    visible = $.root().text();
  } else {
    visible = raw;
  }

  // Zero-width / bidi control characters: count, strip, and surface.
  const invisible = visible.match(INVISIBLE_CHARS);
  meta.zeroWidthCount = invisible?.length ?? 0;
  visible = visible.replace(INVISIBLE_CHARS, "");
  meta.hiddenText = meta.hiddenText.map((t) => t.replace(INVISIBLE_CHARS, ""));
  meta.comments = meta.comments.map((t) => t.replace(INVISIBLE_CHARS, ""));

  let text: string;
  if (meta.isHtml) {
    text = visible
      .split("\n")
      .map(collapse)
      .filter((l) => l.length > 0)
      .join("\n\n");
  } else {
    text = visible.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const hiddenLines: string[] = [
    ...meta.hiddenText.map((t) => `Hidden element: ${t}`),
    ...meta.comments.map((t) => `HTML comment: ${t}`),
  ];
  if (meta.zeroWidthCount > 0) hiddenLines.push(`Invisible characters removed: ${meta.zeroWidthCount}`);
  if (hiddenLines.length > 0) text += `\n\n${HIDDEN_MARKER}\n${hiddenLines.join("\n")}`;

  return { text, meta };
}
