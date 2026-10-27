import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database, type DatabaseAdapter } from "@/lib/db";
import { isAllowedMediaUrl, isValidMediaUrl } from "@/lib/security";
import { randomUUID } from "node:crypto";

export const runtime="nodejs";
const slugify=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function validTitle(body:Record<string,unknown>) {
  const title=typeof body.title==="string"?body.title.trim():"";
  const type=body.type==="movie"||body.type==="series"?body.type:null;
  const synopsis=typeof body.synopsis==="string"?body.synopsis.trim():"";
  const releaseYear=body.releaseYear===""||body.releaseYear==null?null:Number(body.releaseYear);
  const poster=typeof body.posterUrl==="string"?body.posterUrl.trim():"";
  const backdrop=typeof body.backdropUrl==="string"?body.backdropUrl.trim():"";
  const video=typeof body.videoUrl==="string"?body.videoUrl.trim():"";
  const genres=Array.isArray(body.genres)?body.genres.filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean).slice(0,20):[];
  if(title.length<1||title.length>160||!type||synopsis.length>5000)return {error:"Add a title, a content type, and a synopsis under 5,000 characters."};
  if(releaseYear!==null&&(!Number.isInteger(releaseYear)||releaseYear<1900||releaseYear>2100))return {error:"Enter a valid release year."};
  if(!isAllowedMediaUrl(poster)||!isAllowedMediaUrl(backdrop)||!isValidMediaUrl(video))return {error:"Use valid HTTP or HTTPS media URLs. Video sources must use HTTPS in production."};
  const status=["ongoing","completed","upcoming"].includes(String(body.status))?String(body.status):"completed";
  const country=typeof body.country==="string"?body.country.trim().slice(0,100):"";
  const alternative=typeof body.alternativeTitle==="string"?body.alternativeTitle.trim().slice(0,160):"";
  const rating=typeof body.contentRating==="string"?body.contentRating.trim().slice(0,30):"";
  const runtime=body.runtimeMinutes===""||body.runtimeMinutes==null?null:Number(body.runtimeMinutes);
  if(runtime!==null&&(!Number.isInteger(runtime)||runtime<1||runtime>600))return {error:"Enter a valid runtime in minutes."};
  const languages=Array.isArray(body.subtitleLanguages)?body.subtitleLanguages.filter((x):x is string=>typeof x==="string").map(x=>x.trim().slice(0,50)).filter(Boolean).slice(0,20):[];
  const published=body.published===true;
  const featured=body.featured===true;
  let episodes:Record<string,unknown>[]=[];
  if(body.episodes!==undefined) {
    if(!Array.isArray(body.episodes)||body.episodes.length>250)return {error:"Episodes must be a list with no more than 250 entries."};
    episodes=body.episodes as Record<string,unknown>[];
    for(let i=0;i<episodes.length;i++) {
      const ep=episodes[i]; const name=typeof ep?.title==="string"?ep.title.trim():""; const url=typeof ep?.videoUrl==="string"?ep.videoUrl.trim():"";
      const tracks=Array.isArray(ep?.subtitles)?ep.subtitles as Record<string,unknown>[]:[];
      if(!name||name.length>160||!isValidMediaUrl(url)||tracks.length>20||tracks.some(track=>typeof track.fileUrl!=="string"||!isAllowedMediaUrl(track.fileUrl)))return {error:`Check the title, video URL, and subtitle URLs for episode ${i+1}.`};
      const seasonNumber=ep?.seasonNumber===undefined?1:Number(ep.seasonNumber),episodeNumber=ep?.episodeNumber===undefined?i+1:Number(ep.episodeNumber);
      if(!Number.isInteger(seasonNumber)||seasonNumber<1||seasonNumber>30||!Number.isInteger(episodeNumber)||episodeNumber<1||episodeNumber>500)return {error:`Episode ${i+1} has an invalid season or episode number.`};
      if(typeof ep?.thumbnailUrl==="string"&&ep.thumbnailUrl&&!isAllowedMediaUrl(ep.thumbnailUrl))return {error:`Episode ${i+1} has an invalid thumbnail URL.`};
    }
  }
  return {title,type,synopsis,releaseYear,poster,backdrop,video,genres,status,country,alternative,rating,runtime,languages,published,featured,episodes};
}
async function audit(db:DatabaseAdapter,adminId:string,action:string,id:string,details:unknown={}) {
  await db.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(adminId,action,"title",id,JSON.stringify(details));
}
async function writeGenres(db:DatabaseAdapter,titleId:string,genres:string[]) {
  await db.prepare("DELETE FROM title_genres WHERE title_id=?").run(titleId);
  for(const name of genres) {
    const slug=slugify(name); if(!slug)continue;
    await db.prepare("INSERT OR IGNORE INTO genres(id,name,slug) VALUES(?,?,?)").run(randomUUID(),name.slice(0,80),slug);
    const genre=await db.prepare("SELECT id FROM genres WHERE slug=?").get(slug) as {id:string}|undefined;
    if(genre)await db.prepare("INSERT OR IGNORE INTO title_genres(title_id,genre_id) VALUES(?,?)").run(titleId,genre.id);
  }
}
async function writeEpisodes(db:DatabaseAdapter,titleId:string,episodes:Record<string,unknown>[]) {
  await db.prepare("DELETE FROM seasons WHERE title_id=?").run(titleId);
  if(!episodes.length)return;
  const seasonIds=new Map<number,string>();
  for(const ep of episodes){const seasonNumber=Number(ep.seasonNumber)||1;if(!seasonIds.has(seasonNumber)){const seasonId=randomUUID();seasonIds.set(seasonNumber,seasonId);await db.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)").run(seasonId,titleId,seasonNumber,"Season "+seasonNumber);}}
  for(let index=0;index<episodes.length;index++){
    const ep=episodes[index],episodeId=randomUUID();
    const seasonNumber=Number(ep.seasonNumber)||1,episodeNumber=Number(ep.episodeNumber)||index+1,seasonId=seasonIds.get(seasonNumber)!;
    await db.prepare("INSERT INTO episodes(id,season_id,episode_number,title,synopsis,thumbnail_url,duration_minutes,video_url) VALUES(?,?,?,?,?,?,?,?)").run(episodeId,seasonId,episodeNumber,String(ep.title).trim(),typeof ep.synopsis==="string"?ep.synopsis.slice(0,1000):"",typeof ep.thumbnailUrl==="string"&&isAllowedMediaUrl(ep.thumbnailUrl)?ep.thumbnailUrl:"",Number.isInteger(Number(ep.durationMinutes))?Number(ep.durationMinutes)||null:null,typeof ep.videoUrl==="string"?ep.videoUrl.trim():"");
    const tracks=Array.isArray(ep.subtitles)?ep.subtitles as Record<string,unknown>[]:[];
    for(const track of tracks)if(typeof track.language==="string"&&typeof track.fileUrl==="string")await db.prepare("INSERT INTO subtitle_tracks(id,episode_id,language,label,file_url,kind) VALUES(?,?,?,?,?,?)").run(randomUUID(),episodeId,track.language.slice(0,30),typeof track.label==="string"?track.label.slice(0,80):track.language,track.fileUrl,track.kind==="captions"?"captions":"subtitles");
  }
}
export async function GET() {
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const items=await database.prepare("SELECT * FROM titles ORDER BY updated_at DESC LIMIT 200").all() as {id:string;[key:string]:any}[];
  const expanded=await Promise.all(items.map(async t=>{
    const [genres,episodes]=await Promise.all([
      database.prepare("SELECT g.name FROM genres g JOIN title_genres tg ON tg.genre_id=g.id WHERE tg.title_id=?").all(t.id) as Promise<{name:string}[]>,
      database.prepare("SELECT e.id,e.title,e.episode_number,e.synopsis,e.thumbnail_url,e.duration_minutes,e.video_url,s.season_number FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=? ORDER BY s.season_number,e.episode_number").all(t.id) as Promise<{id:string;[key:string]:any}[]>
    ]);
    return {...t,genres:genres.map(x=>x.name),episodes:await Promise.all(episodes.map(async e=>({...e,subtitles:await database.prepare("SELECT language,label,file_url AS fileUrl,kind FROM subtitle_tracks WHERE episode_id=?").all(e.id)})))};
  }));
  return json({items:expanded});
}
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request); if(!body)return badRequest("Enter the content details.");
  const data=validTitle(body); if(typeof data.error==="string")return badRequest(data.error);
  const slug=typeof body.slug==="string"&&body.slug.trim()?slugify(body.slug.trim()):slugify(data.title);
  if(!slug)return badRequest("Add a valid URL slug.");
  const id=randomUUID();
  try {
    await database.transaction(async tx=>{
      await tx.prepare(`INSERT INTO titles(id,type,slug,title,alternative_title,synopsis,release_year,country,status,runtime_minutes,poster_url,backdrop_url,content_rating,subtitle_languages,video_url,published,featured,demo,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP)`).run(id,data.type,slug,data.title,data.alternative,data.synopsis,data.releaseYear,data.country,data.status,data.runtime,data.poster,data.backdrop,data.rating,JSON.stringify(data.languages),data.video,data.published?1:0,data.featured?1:0);
      await writeGenres(tx,id,data.genres); await writeEpisodes(tx,id,data.type==="series"?data.episodes:[]);
      await audit(tx,admin.id,"content.create",id,{title:data.title});
    });
    return json({id,slug},201);
  } catch { return badRequest("That slug may already be in use, or the record could not be saved.",409); }
}
export async function PUT(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request); if(!body||typeof body.id!=="string")return badRequest("Choose a title to update.");
  const titleId=body.id;
  const data=validTitle(body); if(typeof data.error==="string")return badRequest(data.error);
  const slug=typeof body.slug==="string"&&body.slug.trim()?slugify(body.slug.trim()):slugify(data.title);
  try {
    const saved=await database.transaction(async tx=>{
      const result=await tx.prepare(`UPDATE titles SET type=?,slug=?,title=?,alternative_title=?,synopsis=?,release_year=?,country=?,status=?,runtime_minutes=?,poster_url=?,backdrop_url=?,content_rating=?,subtitle_languages=?,video_url=?,published=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(data.type,slug,data.title,data.alternative,data.synopsis,data.releaseYear,data.country,data.status,data.runtime,data.poster,data.backdrop,data.rating,JSON.stringify(data.languages),data.video,data.published?1:0,data.featured?1:0,titleId);
      if(!Number(result.changes))return false;
      await writeGenres(tx,titleId,data.genres); await writeEpisodes(tx,titleId,data.type==="series"?data.episodes:[]);
      await audit(tx,admin.id,"content.update",titleId,{title:data.title}); return true;
    });
    return saved?json({saved:true}):badRequest("That title could not be found.",404);
  } catch { return badRequest("The title could not be saved. Check that its slug is unique.",409); }
}
export async function DELETE(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const id=new URL(request.url).searchParams.get("id"); if(!id)return badRequest("Choose a title to delete.");
  const title=await database.prepare("SELECT title FROM titles WHERE id=?").get(id) as {title:string}|undefined;
  if(!title)return badRequest("That title could not be found.",404);
  await database.transaction(async tx=>{await tx.prepare("DELETE FROM titles WHERE id=?").run(id);await audit(tx,admin.id,"content.delete",id,{title:title.title});});
  return json({deleted:true});
}
