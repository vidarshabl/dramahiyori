import { currentUser } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
export const runtime="nodejs";
export async function GET() {
  const user=await currentUser(); if(!user)return json({items:[]});
  const items=await database.prepare(`SELECT p.title_id,p.episode_id,p.position_seconds,p.duration_seconds,p.updated_at,t.slug,t.title,t.poster_url,t.type,
    e.episode_number FROM watch_progress p JOIN titles t ON t.id=p.title_id LEFT JOIN episodes e ON e.id=p.episode_id
    WHERE p.user_id=? AND t.published=1 ORDER BY p.updated_at DESC LIMIT 20`).all(user.id);
  return json({items});
}
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const user=await currentUser(); if(!user)return badRequest("Sign in to save playback progress.",401);
  const body=await readJson(request); const titleId=typeof body?.titleId==="string"?body.titleId:"";
  const episodeId=typeof body?.episodeId==="string"?body.episodeId:null;
  const position=Number(body?.positionSeconds), duration=Number(body?.durationSeconds);
  if(!titleId || !Number.isFinite(position) || !Number.isFinite(duration) || position<0 || duration<0 || position>86400 || duration>86400) return badRequest("Playback progress is invalid.");
  if(!await database.prepare("SELECT id FROM titles WHERE id=? AND published=1").get(titleId))return badRequest("That title is unavailable.",404);
  if(episodeId && !await database.prepare("SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE e.id=? AND s.title_id=?").get(episodeId,titleId))return badRequest("That episode does not belong to this title.",400);
  await database.prepare(`INSERT INTO watch_progress(user_id,title_id,episode_id,position_seconds,duration_seconds,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,title_id) DO UPDATE SET episode_id=excluded.episode_id,position_seconds=excluded.position_seconds,duration_seconds=excluded.duration_seconds,updated_at=CURRENT_TIMESTAMP`).run(user.id,titleId,episodeId,position,duration);
  await database.prepare("INSERT INTO viewing_history(user_id,title_id,episode_id) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM viewing_history WHERE user_id=? AND title_id=? AND viewed_at>datetime('now','-30 minutes'))").run(user.id,titleId,episodeId,user.id,titleId);
  return json({saved:true});
}
