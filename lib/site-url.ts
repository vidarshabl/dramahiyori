const LOCAL_FALLBACK = "http://localhost:3000";

function parseHttpUrl(value: string | undefined): URL | null {
  const input = value?.trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function getSiteUrl(): URL {
  const configured = parseHttpUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return new URL(configured.origin);

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const vercelUrl = parseHttpUrl(vercelHost ? `https://${vercelHost}` : undefined);
  return vercelUrl ? new URL(vercelUrl.origin) : new URL(LOCAL_FALLBACK);
}

export function getSiteOrigin(): string {
  return getSiteUrl().origin;
}
