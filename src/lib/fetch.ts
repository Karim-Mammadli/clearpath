import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { REVIEW } from "@/lib/config";

/**
 * Server-side URL fetch with SSRF protection (AI_REVIEW.md §1):
 * http/https only, no credentials in URLs, private/loopback/link-local addresses blocked
 * (re-checked on every redirect), 10s timeout, 2MB cap. The app's own /demo/affiliates/*
 * pages are the one allowed exception so the monitoring demo works on localhost too.
 * Known limitation (README): DNS-rebinding TOCTOU between lookup and connect.
 */

export class FetchBlockedError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")) return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIp(mapped[1]) : false;
}

export function isOwnDemoPage(url: URL, appOrigin: string): boolean {
  return url.origin === appOrigin && url.pathname.startsWith("/demo/affiliates/");
}

async function assertPublic(url: URL, appOrigin: string) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new FetchBlockedError("Credentials in URLs are not allowed");
  if (isOwnDemoPage(url, appOrigin)) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw new FetchBlockedError("Blocked host");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlockedError("URL resolves to a private or reserved address");
}

export function resolveUrl(raw: string, appOrigin: string): URL {
  return new URL(raw.trim(), appOrigin);
}

export async function safeFetchHtml(raw: string, appOrigin: string): Promise<{ html: string; finalUrl: string }> {
  let url = resolveUrl(raw, appOrigin);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url, appOrigin);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(REVIEW.fetchTimeoutMs),
      headers: { "user-agent": "ClearPathReview/1.0 (+compliance monitoring)", accept: "text/html,text/plain" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect without location (${res.status})`);
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new Error(`Unsupported content type: ${type || "unknown"}`);
    const reader = res.body?.getReader();
    if (!reader) return { html: "", finalUrl: url.toString() };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REVIEW.fetchMaxBytes) {
        await reader.cancel();
        throw new Error("Page exceeds 2MB limit");
      }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks).toString("utf8"), finalUrl: url.toString() };
  }
  throw new Error("Too many redirects");
}
