import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reasons = new Set(["broken_link", "wrong_subtitles", "inappropriate", "rights_concern", "other"]);

export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  if (!await consumeRateLimit(database, request, "content-report", 6, 10 * 60_000)) return badRequest("You have sent several reports recently. Please try again later.", 429);
  const body = await readJson(request);
  if (!body) return badRequest("Enter the report details.");
  const targetType = typeof body.targetType === "string" ? body.targetType : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";
  if (!(["title", "episode", "video_source", "download"] as string[]).includes(targetType) || !targetId || targetId.length > 80 || !reasons.has(reason)) return badRequest("Choose an available item and a report reason.");

  const exists = targetType === "title"
    ? await database.prepare("SELECT id FROM titles WHERE id=? AND published=1").get(targetId)
    : targetType === "episode"
      ? await database.prepare("SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id JOIN titles t ON t.id=s.title_id WHERE e.id=? AND e.published=1 AND t.published=1 AND (e.publish_at IS NULL OR datetime(e.publish_at)<=CURRENT_TIMESTAMP)").get(targetId)
      : targetType === "video_source"
        ? await database.prepare("SELECT v.id FROM video_sources v JOIN titles t ON t.id=COALESCE(v.title_id,(SELECT s.title_id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=v.episode_id)) WHERE v.id=? AND t.published=1 AND v.status='active'").get(targetId)
        : await database.prepare("SELECT d.id FROM download_links d JOIN titles t ON t.id=COALESCE(d.title_id,(SELECT s.title_id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=d.episode_id)) WHERE d.id=? AND t.published=1 AND d.status='active'").get(targetId);
  if (!exists) return badRequest("That item is no longer available to report.", 404);
  const user = await currentUser();
  await database.prepare("INSERT INTO link_reports(id,target_type,target_id,reason,details,user_id) VALUES(?,?,?,?,?,?)")
    .run(randomUUID(), targetType, targetId, reason, details, user?.id || null);
  return json({ submitted: true });
}
