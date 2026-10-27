import { randomUUID } from "node:crypto";
import { isValidMediaUrl } from "./security.ts";
import { recordMediaUsage } from "./media-usage.ts";
import type { DatabaseAdapter } from "./db.ts";

/** Save the editor's episode list without replacing IDs for episodes that still exist. */
export async function persistTitleEpisodes(db:DatabaseAdapter,titleId:string,episodes:Record<string,unknown>[]) {
  const existing=await db.prepare(`SELECT e.id,e.episode_number,s.season_number FROM episodes e
    JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?`).all(titleId) as Array<{id:string;episode_number:number;season_number:number}>;
  const existingById=new Map(existing.map(episode=>[episode.id,episode]));
  const existingByPosition=new Map(existing.map(episode=>[`${episode.season_number}:${episode.episode_number}`,episode]));
  const usedIds=new Set<string>();
  const targets=episodes.map((ep,index)=>{
    const seasonNumber=Number(ep.seasonNumber)||1,episodeNumber=Number(ep.episodeNumber)||index+1;
    const requestedId=typeof ep.id==="string"?ep.id:"";
    const matched=requestedId?existingById.get(requestedId):existingByPosition.get(`${seasonNumber}:${episodeNumber}`);
    if(requestedId&&!matched)throw new Error("INVALID_EPISODE_ID");
    if(matched&&usedIds.has(matched.id))throw new Error("INVALID_EPISODE_ID");
    const id=matched?.id||randomUUID();if(matched)usedIds.add(id);
    const thumbnailUrl=typeof ep.thumbnailUrl==="string"&&isValidMediaUrl(ep.thumbnailUrl)?ep.thumbnailUrl:"";
    return {id,matched:Boolean(matched),seasonNumber,episodeNumber,title:String(ep.title).trim(),synopsis:typeof ep.synopsis==="string"?ep.synopsis.slice(0,1000):"",thumbnailUrl,durationMinutes:Number.isInteger(Number(ep.durationMinutes))?Number(ep.durationMinutes)||null:null,videoUrl:typeof ep.videoUrl==="string"?ep.videoUrl.trim():"",tracks:Array.isArray(ep.subtitles)?ep.subtitles as Record<string,unknown>[]:[]};
  });
  const seasonRows=await db.prepare("SELECT id,season_number FROM seasons WHERE title_id=?").all(titleId) as Array<{id:string;season_number:number}>;
  const seasonIds=new Map(seasonRows.map(season=>[Number(season.season_number),season.id]));
  for(const seasonNumber of new Set(targets.map(episode=>episode.seasonNumber)))if(!seasonIds.has(seasonNumber)){
    const seasonId=randomUUID();seasonIds.set(seasonNumber,seasonId);
    await db.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)").run(seasonId,titleId,seasonNumber,"Season "+seasonNumber);
  }
  await db.prepare("DELETE FROM subtitle_tracks WHERE episode_id IN (SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?)").run(titleId);
  await db.prepare("DELETE FROM media_asset_usages WHERE episode_id IN (SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?)").run(titleId);
  for(const episode of existing)if(!usedIds.has(episode.id))await db.prepare("DELETE FROM episodes WHERE id=?").run(episode.id);

  // Temporarily move surviving rows out of the way so swaps and season changes cannot
  // collide with UNIQUE(season_id, episode_number) while their IDs stay stable.
  let temporaryNumber=-1;
  for(const episode of targets)if(episode.matched)await db.prepare("UPDATE episodes SET episode_number=? WHERE id=?").run(temporaryNumber--,episode.id);
  for(const episode of targets)if(!episode.matched)await db.prepare("INSERT INTO episodes(id,season_id,episode_number,title,synopsis,thumbnail_url,duration_minutes,video_url) VALUES(?,?,?,?,?,?,?,?)")
    .run(episode.id,seasonIds.get(episode.seasonNumber),temporaryNumber--,episode.title,episode.synopsis,episode.thumbnailUrl,episode.durationMinutes,episode.videoUrl);
  for(const episode of targets){
    await db.prepare("UPDATE episodes SET season_id=?,episode_number=?,title=?,synopsis=?,thumbnail_url=?,duration_minutes=?,video_url=? WHERE id=?")
      .run(seasonIds.get(episode.seasonNumber),episode.episodeNumber,episode.title,episode.synopsis,episode.thumbnailUrl,episode.durationMinutes,episode.videoUrl,episode.id);
    await recordMediaUsage(db,episode.thumbnailUrl,{episodeId:episode.id},"episode_thumbnail");
    for(const track of episode.tracks)if(typeof track.language==="string"&&typeof track.fileUrl==="string")await db.prepare("INSERT INTO subtitle_tracks(id,episode_id,language,label,file_url,kind) VALUES(?,?,?,?,?,?)")
      .run(randomUUID(),episode.id,track.language.slice(0,30),typeof track.label==="string"?track.label.slice(0,80):track.language,track.fileUrl,track.kind==="captions"?"captions":"subtitles");
  }
  await db.prepare("DELETE FROM seasons WHERE title_id=? AND NOT EXISTS (SELECT 1 FROM episodes WHERE episodes.season_id=seasons.id)").run(titleId);
}
