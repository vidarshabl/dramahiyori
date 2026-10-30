import { createHash, randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  if (!await consumeRateLimit(database, request, "view-event", 120, 60 * 60_000)) return badRequest("Please slow down and try again later.", 429);
  const body = await readJson(request);
  const titleId = typeof body?.titleId === "string" ? body.titleId : "";
  const episodeId = typeof body?.episodeId === "string" ? body.episodeId : null;
  const title = await database.prepare("SELECT id FROM titles WHERE id=? AND published=1").get(titleId);
  if (!title) return badRequest("That title is unavailable.", 404);
  if (episodeId && !await database.prepare(`SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=? AND s.title_id=? AND e.published=1 AND (e.publish_at IS NULL OR datetime(e.publish_at)<=CURRENT_TIMESTAMP)`).get(episodeId, titleId)) return badRequest("That episode is unavailable.", 404);
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown";
  const visitorKey = createHash("sha256").update(forwarded.split(",")[0].trim().slice(0, 120)).digest("hex");
  const user = await currentUser();
  await database.prepare(`INSERT INTO view_events(id,title_id,episode_id,user_id,visitor_key)
    SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM view_events WHERE title_id=? AND visitor_key=? AND created_at>=datetime('now','-30 minutes'))`)
    .run(randomUUID(), titleId, episodeId, user?.id || null, visitorKey, titleId, visitorKey);
  return json({ recorded: true });
}
