import { randomUUID } from "node:crypto";
import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
import { isValidMediaUrl } from "@/lib/security";
import { invalidatePublicCatalogCache } from "@/lib/catalog";
import { normalizeVideoSourceInput, type VideoSourceKind } from "@/lib/video-source-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Quality = "auto" | "480p" | "720p" | "1080p";

function absoluteMediaUrl(value: unknown, preferredKind?: VideoSourceKind) {
  const source = normalizeVideoSourceInput(value, preferredKind);
  if (!source || source.url.length > 2048 || !isValidMediaUrl(source.url)) return null;
  return source;
}

async function setVideoSourceStatus(id: string, status: "active" | "inactive") {
  return database.transaction(async (tx) => {
    const source = await tx.prepare(`SELECT v.id,v.title_id,v.episode_id,v.url,
      COALESCE(v.title_id,(SELECT s.title_id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=v.episode_id)) AS owner_title_id
      FROM video_sources v WHERE v.id=?`)
      .get(id) as { id: string; title_id: string | null; episode_id: string | null; url: string; owner_title_id: string | null } | undefined;
    if (!source) return 0;

    const result = await tx.prepare("UPDATE video_sources SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(status, id);
    if (!result.changes || status !== "inactive") return result.changes;

    // Older titles and episodes can also store this URL in their legacy video_url
    // fields. Clear only exact matches within the source's title so an inactive
    // source cannot keep playing through a legacy fallback.
    if (source.owner_title_id) {
      // Legacy migrations can have multiple active source rows for the same
      // URL. Deactivate exact-URL duplicates scoped to this title so none can
      // reintroduce the disabled stream through the public source query.
      await tx.prepare(`UPDATE video_sources SET status='inactive',updated_at=CURRENT_TIMESTAMP WHERE url=? AND (
        title_id=? OR episode_id IN (SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?))`)
        .run(source.url, source.owner_title_id, source.owner_title_id);
      await tx.prepare(`UPDATE episodes SET video_url='' WHERE video_url=? AND season_id IN
        (SELECT id FROM seasons WHERE title_id=?)`).run(source.url, source.owner_title_id);
      await tx.prepare("UPDATE titles SET video_url='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND video_url=?")
        .run(source.owner_title_id, source.url);
    }
    return result.changes;
  });
}

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return badRequest("Administrator access is required.", 403);
  const [sources, downloads, reports, requests, popular, settings] = await Promise.all([
    database.prepare(`SELECT v.*,COALESCE(t.title,(SELECT t2.title FROM episodes e JOIN seasons s ON s.id=e.season_id JOIN titles t2 ON t2.id=s.title_id WHERE e.id=v.episode_id)) AS title,
      COALESCE(e.title,'') AS episode_title FROM video_sources v LEFT JOIN titles t ON t.id=v.title_id LEFT JOIN episodes e ON e.id=v.episode_id ORDER BY v.updated_at DESC LIMIT 500`).all(),
    database.prepare(`SELECT d.*,COALESCE(t.title,(SELECT t2.title FROM episodes e JOIN seasons s ON s.id=e.season_id JOIN titles t2 ON t2.id=s.title_id WHERE e.id=d.episode_id)) AS title,
      COALESCE(e.title,'') AS episode_title FROM download_links d LEFT JOIN titles t ON t.id=d.title_id LEFT JOIN episodes e ON e.id=d.episode_id ORDER BY d.updated_at DESC LIMIT 500`).all(),
    database.prepare(`SELECT r.*,COALESCE(t.title,(SELECT t2.title FROM episodes e JOIN seasons s ON s.id=e.season_id JOIN titles t2 ON t2.id=s.title_id WHERE e.id=r.target_id),r.target_id) AS content_title,u.email
      FROM link_reports r LEFT JOIN titles t ON r.target_type='title' AND t.id=r.target_id LEFT JOIN users u ON u.id=r.user_id
      ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 300`).all(),
    database.prepare("SELECT id,requested_title,details,status,created_at FROM title_requests ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END,created_at DESC LIMIT 300").all(),
    database.prepare(`SELECT v.title_id,t.title,t.slug,COUNT(*) AS views FROM view_events v JOIN titles t ON t.id=v.title_id
      WHERE v.created_at>=datetime('now','-7 days') AND t.published=1 GROUP BY v.title_id,t.title,t.slug ORDER BY views DESC,t.title LIMIT 20`).all(),
    database.prepare("SELECT key,value FROM site_settings WHERE key IN ('downloads_login_1080p')").all() as Promise<Array<{ key: string; value: string }>>,
  ]);
  return json({ sources, downloads, reports, requests, popular, settings: Object.fromEntries(settings.map((setting) => [setting.key, setting.value])) });
}

export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  const admin = await currentAdmin();
  if (!admin) return badRequest("Administrator access is required.", 403);
  const body = await readJson(request);
  if (!body) return badRequest("Enter the streaming details.");
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "source") {
    const titleId = typeof body.titleId === "string" ? body.titleId : "";
    const episodeId = typeof body.episodeId === "string" && body.episodeId ? body.episodeId : null;
    const requestedKind = body.kind as VideoSourceKind;
    const quality = body.quality as Quality;
    const source = absoluteMediaUrl(body.url, requestedKind);
    const kind = source?.kind;
    const url = source?.url;
    const priority = Number(body.priority ?? 0);
    if (!titleId || !(await database.prepare("SELECT id FROM titles WHERE id=?").get(titleId)) || !kind || !("hls mp4 embed".split(" ") as string[]).includes(kind) || !("auto 480p 720p 1080p".split(" ") as string[]).includes(quality) || !url || !Number.isInteger(priority) || priority < -1000 || priority > 1000) return badRequest("Check the source type, quality, URL, and order.");
    if (episodeId && !await database.prepare("SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=? AND s.title_id=?").get(episodeId, titleId)) return badRequest("Choose an episode that belongs to this title.");
    const id = randomUUID();
    await database.prepare("INSERT INTO video_sources(id,title_id,episode_id,kind,quality,url,priority,status) VALUES(?,?,?,?,?,?,?,'active')")
      .run(id, episodeId ? null : titleId, episodeId, kind, quality, url, priority);
    invalidatePublicCatalogCache();
    return json({ id }, 201);
  }

  if (action === "download") {
    const titleId = typeof body.titleId === "string" ? body.titleId : "";
    const episodeId = typeof body.episodeId === "string" && body.episodeId ? body.episodeId : null;
    const quality = typeof body.quality === "string" ? body.quality : "";
    const source = absoluteMediaUrl(body.url);
    const url = source?.url;
    const sizeMb = body.sizeMb === "" || body.sizeMb == null ? null : Number(body.sizeMb);
    const hostLabel = typeof body.hostLabel === "string" ? body.hostLabel.trim().slice(0, 80) : "";
    if (!titleId || !await database.prepare("SELECT id FROM titles WHERE id=?").get(titleId) || !("480p 720p 1080p subtitle".split(" ") as string[]).includes(quality) || !url || (sizeMb !== null && (!Number.isFinite(sizeMb) || sizeMb < 0 || sizeMb > 1_000_000))) return badRequest("Check the download quality, file size, and URL.");
    if (episodeId && !await database.prepare("SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=? AND s.title_id=?").get(episodeId, titleId)) return badRequest("Choose an episode that belongs to this title.");
    const id = randomUUID();
    await database.prepare("INSERT INTO download_links(id,title_id,episode_id,quality,size_mb,host_label,url,status) VALUES(?,?,?,?,?,?,?,'active')")
      .run(id, episodeId ? null : titleId, episodeId, quality, sizeMb, hostLabel, url);
    return json({ id }, 201);
  }

  if (action === "setting") {
    if (body.login1080 !== true && body.login1080 !== false) return badRequest("Choose whether 1080p downloads require an account.");
    await database.prepare("INSERT INTO site_settings(key,value) VALUES('downloads_login_1080p',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP")
      .run(body.login1080 ? "true" : "false");
    return json({ saved: true });
  }

  if (action === "status") {
    const entity = body.entity === "source" ? "video_sources" : body.entity === "download" ? "download_links" : "";
    const status = body.status === "active" || body.status === "inactive" ? body.status : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!entity || !status || !id) return badRequest("Choose a source or download status.");
    const result = entity === "video_sources"
      ? { changes: await setVideoSourceStatus(id, status) }
      : await database.prepare(`UPDATE ${entity} SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, id);
    if (!result.changes) return badRequest("That link could not be found.", 404);
    if (entity === "video_sources") invalidatePublicCatalogCache();
    return json({ saved: true });
  }

  if (action === "report-status") {
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!id || !("open reviewing resolved dismissed".split(" ") as string[]).includes(status)) return badRequest("Choose a valid report status.");
    const result = await database.prepare("UPDATE link_reports SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, id);
    if (!result.changes) return badRequest("That report could not be found.", 404);
    return json({ saved: true });
  }

  if (action === "disable-report-target") {
    const reportId = typeof body.id === "string" ? body.id : "";
    const report = await database.prepare("SELECT target_type,target_id FROM link_reports WHERE id=?").get(reportId) as { target_type: string; target_id: string } | undefined;
    if (!report) return badRequest("That report could not be found.", 404);
    if (report.target_type === "title") await database.prepare("UPDATE titles SET published=0,featured=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(report.target_id);
    else if (report.target_type === "episode") await database.prepare("UPDATE episodes SET published=0 WHERE id=?").run(report.target_id);
    else if (report.target_type === "video_source") await setVideoSourceStatus(report.target_id, "inactive");
    else if (report.target_type === "download") await database.prepare("UPDATE download_links SET status='inactive',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(report.target_id);
    await database.prepare("UPDATE link_reports SET status='resolved',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reportId);
    invalidatePublicCatalogCache();
    return json({ disabled: true });
  }

  if (action === "request-status") {
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!id || !("open reviewing added declined".split(" ") as string[]).includes(status)) return badRequest("Choose a valid request status.");
    const result = await database.prepare("UPDATE title_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, id);
    if (!result.changes) return badRequest("That request could not be found.", 404);
    return json({ saved: true });
  }

  return badRequest("Choose a valid streaming action.");
}
