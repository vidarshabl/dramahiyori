import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";

export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user) return json({ items: [] });
  const items = await database.prepare("SELECT episode_id FROM watched_episodes WHERE user_id=?").all(user.id);
  return json({ items });
}

export async function POST(request: Request) {
  const rejected = sameOriginOrReject(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return badRequest("Sign in to save watched episodes.", 401);
  const body = await readJson(request);
  const episodeId = typeof body?.episodeId === "string" ? body.episodeId : "";
  const watched = body?.watched !== false;
  if (!episodeId || !await database.prepare(`SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id JOIN titles t ON t.id=s.title_id
    WHERE e.id=? AND e.published=1 AND t.published=1`).get(episodeId)) return badRequest("That episode is unavailable.", 404);
  if (watched) await database.prepare("INSERT INTO watched_episodes(user_id,episode_id) VALUES(?,?) ON CONFLICT(user_id,episode_id) DO NOTHING").run(user.id, episodeId);
  else await database.prepare("DELETE FROM watched_episodes WHERE user_id=? AND episode_id=?").run(user.id, episodeId);
  return json({ watched });
}
