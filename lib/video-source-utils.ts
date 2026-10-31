export type VideoSourceKind = "hls" | "mp4" | "embed";

export type NormalizedVideoSource = {
  kind: VideoSourceKind;
  url: string;
};

function decodeAttribute(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .trim();
}

/** Extracts only the iframe src; pasted HTML is never rendered as markup. */
export function extractIframeSource(value: string): string | null {
  if (value.length > 8192 || !/<iframe\b/i.test(value)) return null;
  const match = /<iframe\b[^>]*\ssrc\s*=\s*(["'])(.*?)\1/i.exec(value);
  return match?.[2] ? decodeAttribute(match[2]) : null;
}

function isKnownEmbedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return /(^|\.)playmogo\.[a-z.]+$/.test(host)
    || /(^|\.)dood(?:stream)?\.[a-z]{2,}$/.test(host)
    || /(^|\.)mixdrop\.[a-z]{2,}$/.test(host)
    || ["streamtape.com", "streamtape.to", "streamtape.net", "voe.sx", "filemoon.sx", "vidhide.com"]
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function normalizeVideoSourceInput(value: unknown, preferredKind?: VideoSourceKind): NormalizedVideoSource | null {
  if (typeof value !== "string" || value.trim().length > 8192) return null;
  const input = value.trim();
  if (!input) return null;

  const iframeSource = extractIframeSource(input);
  const candidate = iframeSource || input;
  let url: URL;
  try { url = new URL(candidate); } catch { return null; }
  if (!url.hostname || url.username || url.password || !["http:", "https:"].includes(url.protocol)) return null;

  const path = url.pathname.toLowerCase();
  const directHls = /\.m3u8$/.test(path);
  const directMp4 = /\.(?:mp4|m4v|webm|ogv)$/.test(path);
  if (!iframeSource && (directHls || directMp4)) {
    return { kind: directHls ? "hls" : "mp4", url: url.toString() };
  }

  const embedPath = /(?:^|\/)(?:e|d|embed|player|iframe)(?:\/|$)/i.test(path);
  const embedQuery = /(?:^|&)(?:embed|player)=?(?:1|true)?(?:&|$)/i.test(url.search.slice(1));
  const kind: VideoSourceKind = iframeSource || preferredKind === "embed" || isKnownEmbedHost(url.hostname) || embedPath || embedQuery
    ? "embed"
    : preferredKind || "mp4";
  return { kind, url: url.toString() };
}

export function isLikelyEmbedInput(value: string) {
  const extracted = extractIframeSource(value);
  if (extracted) return true;
  return normalizeVideoSourceInput(value)?.kind === "embed";
}
