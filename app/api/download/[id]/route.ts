import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/api";
import { database } from "@/lib/db";
import { isAllowedMediaUrl } from "@/lib/security";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadRow = { id: string; title_id: string | null; episode_id: string | null; quality: string; url: string; status: string; title_published: number | null; episode_published: number | null; publish_at: string | null };

async function findActiveDownload(id: string) {
  if (!/^[a-f\d-]{20,80}$/i.test(id)) return null;
  const link = await database.prepare(`SELECT d.id,d.title_id,d.episode_id,d.quality,d.url,d.status,t.published AS title_published,
      e.published AS episode_published,e.publish_at
    FROM download_links d
    LEFT JOIN episodes e ON e.id=d.episode_id
    LEFT JOIN seasons s ON s.id=e.season_id
    LEFT JOIN titles t ON t.id=COALESCE(d.title_id,s.title_id)
    WHERE d.id=? AND ((d.episode_id IS NULL AND d.title_id=t.id) OR (d.episode_id IS NOT NULL AND d.title_id IS NULL AND s.title_id=t.id))`)
    .get(id) as DownloadRow | undefined;
  if (!link || link.status !== "active" || Number(link.title_published) !== 1 || (link.episode_id && (Number(link.episode_published) !== 1 || (link.publish_at && Date.parse(link.publish_at) > Date.now()))) || !isAllowedMediaUrl(link.url)) return null;
  return link;
}

async function requiresSignIn(link: DownloadRow) {
  if (link.quality !== "1080p") return false;
  const setting = await database.prepare("SELECT value FROM site_settings WHERE key='downloads_login_1080p'").get() as { value: string } | undefined;
  return setting?.value === "true" && !await currentUser();
}

export async function HEAD(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await consumeRateLimit(database, request, "download-prepare", 60, 60_000)) return new Response(null, { status: 429, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  const link = await findActiveDownload(id);
  if (!link) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (await requiresSignIn(link)) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await consumeRateLimit(database, request, "download", 50, 60_000)) return badRequest("Too many download requests. Try again in a minute.", 429);
  const { id } = await params;
  const link = await findActiveDownload(id);
  if (!link) return badRequest("That download is no longer available.", 404);
  if (link.quality === "1080p") {
    if (await requiresSignIn(link)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `/api/download/${encodeURIComponent(id)}`);
      return NextResponse.redirect(loginUrl, 307);
    }
  }
  const user = await currentUser();
  await database.transaction(async (tx) => {
    await tx.prepare("UPDATE download_links SET clicks=clicks+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'").run(id);
    await tx.prepare("INSERT INTO download_clicks(id,download_link_id,user_id) VALUES(?,?,?)").run(randomUUID(), id, user?.id || null);
  });
  return NextResponse.redirect(link.url, 302);
}
