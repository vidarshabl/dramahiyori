import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database, type DatabaseAdapter } from "@/lib/db";
import { isAllowedMediaUrl, isValidMediaUrl } from "@/lib/security";
import { recordTitleImageUsages } from "@/lib/media-usage";
import { invalidatePublicCatalogCache } from "@/lib/catalog";
import { persistTitleEpisodes } from "@/lib/title-episodes";
import { randomUUID } from "node:crypto";

export const runtime="nodejs";
const slugify=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
type GalleryInput={url:string;caption:string;attribution:string};
function validTitle(body:Record<string,unknown>) {
  const title=typeof body.title==="string"?body.title.trim():"";
  const type=body.type==="movie"||body.type==="series"||body.type==="variety"?body.type:null;
  const synopsis=typeof body.synopsis==="string"?body.synopsis.trim():"";
  const releaseYear=body.releaseYear===""||body.releaseYear==null?null:Number(body.releaseYear);
  const poster=typeof body.posterUrl==="string"?body.posterUrl.trim():"";
  const backdrop=typeof body.backdropUrl==="string"?body.backdropUrl.trim():"";
  const video=typeof body.videoUrl==="string"?body.videoUrl.trim():"";
  const genres=Array.isArray(body.genres)?body.genres.filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean).slice(0,20):[];
  if(title.length<1||title.length>160||!type||synopsis.length>5000)return {error:"Add a title, a content type, and a synopsis under 5,000 characters."};
  if(releaseYear!==null&&(!Number.isInteger(releaseYear)||releaseYear<1900||releaseYear>2100))return {error:"Enter a valid release year."};
  if(!isValidMediaUrl(poster)||!isValidMediaUrl(backdrop)||!isValidMediaUrl(video))return {error:"Use valid HTTP or HTTPS media URLs. Video sources must use HTTPS in production."};
  const status=["ongoing","completed","upcoming"].includes(String(body.status))?String(body.status):"completed";
  const country=typeof body.country==="string"?body.country.trim().slice(0,100):"";
  const airDay=typeof body.airDay==="string"?body.airDay.trim():"";
  const sinhalaTitle=typeof body.sinhalaTitle==="string"?body.sinhalaTitle.trim().slice(0,160):"";
  const hasSinhalaSubtitles=body.hasSinhalaSubtitles===true;
  if(airDay&&!['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].includes(airDay))return {error:"Choose a valid weekly air day."};
  const alternative=typeof body.alternativeTitle==="string"?body.alternativeTitle.trim().slice(0,160):"";
  const rating=typeof body.contentRating==="string"?body.contentRating.trim().slice(0,30):"";
  const runtimeInput=body.runtimeMinutes;
  const runtime=runtimeInput===""||runtimeInput==null?null:typeof runtimeInput==="number"||typeof runtimeInput==="string"?Number(runtimeInput):Number.NaN;
  if(runtime!==null&&(!Number.isSafeInteger(runtime)||runtime<1))return {error:"Runtime must be a positive whole number of minutes."};
  const ratingInput=body.imdbRating;
  const imdbRating=ratingInput===""||ratingInput==null?null:typeof ratingInput==="number"||typeof ratingInput==="string"?Number(ratingInput):Number.NaN;
  if(imdbRating!==null&&(!Number.isFinite(imdbRating)||imdbRating<0||imdbRating>10||Math.abs(imdbRating*10-Math.round(imdbRating*10))>1e-8))return {error:"IMDb rating must be between 0 and 10, with at most one decimal place."};
  const totalEpisodesInput=body.totalEpisodes;
  const totalEpisodes=totalEpisodesInput===""||totalEpisodesInput==null?null:typeof totalEpisodesInput==="number"||typeof totalEpisodesInput==="string"?Number(totalEpisodesInput):Number.NaN;
  if(totalEpisodes!==null&&(!Number.isSafeInteger(totalEpisodes)||totalEpisodes<1||totalEpisodes>500))return {error:"Total episodes must be a whole number from 1 to 500."};
  const totalRuntimeInput=body.totalRuntimeMinutes;
  const totalRuntimeMinutes=totalRuntimeInput===""||totalRuntimeInput==null?null:typeof totalRuntimeInput==="number"||typeof totalRuntimeInput==="string"?Number(totalRuntimeInput):Number.NaN;
  if(totalRuntimeMinutes!==null&&(!Number.isSafeInteger(totalRuntimeMinutes)||totalRuntimeMinutes<1||totalRuntimeMinutes>500000))return {error:"Total runtime must be a positive whole number of minutes."};
  const imdbRatingIsEstimate=body.imdbRatingIsEstimate===true;
  const languages=Array.isArray(body.subtitleLanguages)?body.subtitleLanguages.filter((x):x is string=>typeof x==="string").map(x=>x.trim().slice(0,50)).filter(Boolean).slice(0,20):[];
  const published=body.published===true;
  const featured=body.featured===true;
  const featuredOrder=body.featuredOrder===""||body.featuredOrder==null?0:Number(body.featuredOrder);
  if(!Number.isInteger(featuredOrder)||featuredOrder<0||featuredOrder>10000)return {error:"Enter a homepage order between 0 and 10,000."};
  const rawGallery=Array.isArray(body.gallery)?body.gallery:[];
  if(rawGallery.length>30)return {error:"A title can have up to 30 gallery images."};
  const gallery:GalleryInput[]=[];
  for(const [index,value] of rawGallery.entries()) {
    const image=value as Record<string,unknown>;
    const url=typeof image?.url==="string"?image.url.trim():"";
    const caption=typeof image?.caption==="string"?image.caption.trim().slice(0,200):"";
    const attribution=typeof image?.attribution==="string"?image.attribution.trim().slice(0,200):"";
    if(!url||!isAllowedMediaUrl(url))return {error:`Check gallery image ${index+1}; use a valid HTTPS image URL.`};
    if(!gallery.some(entry=>entry.url===url))gallery.push({url,caption,attribution});
  }
  let episodes:Record<string,unknown>[]=[];
  if(body.episodes!==undefined) {
    if(!Array.isArray(body.episodes)||body.episodes.length>250)return {error:"Episodes must be a list with no more than 250 entries."};
    episodes=body.episodes as Record<string,unknown>[];
    const episodeIds=new Set<string>();
    const episodePositions=new Set<string>();
    for(let i=0;i<episodes.length;i++) {
      const ep=episodes[i]; const name=typeof ep?.title==="string"?ep.title.trim():""; const url=typeof ep?.videoUrl==="string"?ep.videoUrl.trim():"";
      if(ep?.id!==undefined&&(typeof ep.id!=="string"||!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(ep.id)||episodeIds.has(ep.id)))return {error:`Episode ${i+1} has an invalid record ID.`};
      if(typeof ep?.id==="string")episodeIds.add(ep.id);
      const tracks=Array.isArray(ep?.subtitles)?ep.subtitles as Record<string,unknown>[]:[];
      if(!name||name.length>160||!isValidMediaUrl(url)||tracks.length>20||tracks.some(track=>typeof track.language!=="string"||track.language.trim().length<2||track.language.trim().length>20||typeof track.label!=="string"||track.label.trim().length>80||typeof track.fileUrl!=="string"||!isAllowedMediaUrl(track.fileUrl)||(track.kind!==undefined&&!['subtitles','captions'].includes(String(track.kind)))||(track.isDefault!==undefined&&typeof track.isDefault!=="boolean")||(track.timingOffset!==undefined&&(!Number.isFinite(Number(track.timingOffset))||Number(track.timingOffset)<-60||Number(track.timingOffset)>60))))return {error:`Check the title, video URL, and subtitle URLs for episode ${i+1}.`};
      const airDate=typeof ep?.airDate==="string"?ep.airDate:"";
      const publishAt=typeof ep?.publishAt==="string"?ep.publishAt:"";
      if(airDate&&!/^\d{4}-\d{2}-\d{2}$/.test(airDate))return {error:`Episode ${i+1} has an invalid air date.`};
      if(publishAt&&(Number.isNaN(Date.parse(publishAt))||publishAt.length>40))return {error:`Episode ${i+1} has an invalid publish date.`};
      const seasonNumber=ep?.seasonNumber===undefined?1:Number(ep.seasonNumber),episodeNumber=ep?.episodeNumber===undefined?i+1:Number(ep.episodeNumber);
      if(!Number.isInteger(seasonNumber)||seasonNumber<1||seasonNumber>30||!Number.isInteger(episodeNumber)||episodeNumber<1||episodeNumber>500)return {error:`Episode ${i+1} has an invalid season or episode number.`};
      const position=`${seasonNumber}:${episodeNumber}`;if(episodePositions.has(position))return {error:`Two episodes use the same season and episode number (${seasonNumber} · ${episodeNumber}).`};episodePositions.add(position);
      if(typeof ep?.thumbnailUrl==="string"&&ep.thumbnailUrl&&!isValidMediaUrl(ep.thumbnailUrl))return {error:`Episode ${i+1} has an invalid thumbnail URL.`};
    }
  }
  return {title,type,synopsis,releaseYear,poster,backdrop,video,genres,status,country,airDay,sinhalaTitle,hasSinhalaSubtitles,alternative,rating,runtime,imdbRating,imdbRatingIsEstimate,totalEpisodes,totalRuntimeMinutes,languages,published,featured,featuredOrder,episodes,gallery};
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
async function writeGallery(db:DatabaseAdapter,titleId:string,gallery:GalleryInput[]) {
  await db.prepare("DELETE FROM title_gallery WHERE title_id=?").run(titleId);
  for(const [sortOrder,image] of gallery.entries())await db.prepare("INSERT INTO title_gallery(id,title_id,image_url,caption,attribution,sort_order) VALUES(?,?,?,?,?,?)").run(randomUUID(),titleId,image.url,image.caption,image.attribution,sortOrder);
}
async function syncHomepageSlide(db:DatabaseAdapter,titleId:string,featured:boolean,backdropUrl:string,sortOrder:number) {
  if(!featured){await db.prepare("DELETE FROM homepage_slides WHERE title_id=?").run(titleId);return;}
  const existing=await db.prepare("SELECT id FROM homepage_slides WHERE title_id=? ORDER BY sort_order,created_at LIMIT 1").get(titleId) as {id:string}|undefined;
  if(existing)await db.prepare("UPDATE homepage_slides SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sortOrder,existing.id);
  else await db.prepare("INSERT INTO homepage_slides(id,title_id,backdrop_url,sort_order) VALUES(?,?,?,?)").run(`legacy-${titleId}`,titleId,backdropUrl,sortOrder);
}
async function syncLegacyTitleSource(db:DatabaseAdapter,titleId:string,url:string) {
  const id=`legacy-title-${titleId}`;
  if(!url){await db.prepare("DELETE FROM video_sources WHERE id=?").run(id);return;}
  await db.prepare(`INSERT INTO video_sources(id,title_id,kind,quality,url,priority,status)
    VALUES(?,?,'mp4','auto',?,-1000,'active') ON CONFLICT(id) DO UPDATE SET url=excluded.url,status='active',updated_at=CURRENT_TIMESTAMP`).run(id,titleId,url);
}
export async function GET(request:Request) {
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const requestedId=new URL(request.url).searchParams.get("id");
  const items=requestedId
    ? await database.prepare("SELECT * FROM titles WHERE id=?").all(requestedId) as {id:string;[key:string]:any}[]
    : await database.prepare("SELECT * FROM titles ORDER BY updated_at DESC LIMIT 200").all() as {id:string;[key:string]:any}[];
  if(requestedId&&!items.length)return badRequest("That title could not be found.",404);
  const expanded=await Promise.all(items.map(async t=>{
    t.type=t.catalog_type||t.type;
    const [genres,episodes,gallery]=await Promise.all([
      database.prepare("SELECT g.name FROM genres g JOIN title_genres tg ON tg.genre_id=g.id WHERE tg.title_id=?").all(t.id) as Promise<{name:string}[]>,
      database.prepare("SELECT e.id,e.title,e.episode_number,e.synopsis,e.thumbnail_url,e.duration_minutes,e.video_url,e.air_date,e.publish_at,e.published,e.created_at,s.season_number FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=? ORDER BY s.season_number,e.episode_number").all(t.id) as Promise<{id:string;[key:string]:any}[]>,
      database.prepare("SELECT id,image_url,caption,attribution,sort_order FROM title_gallery WHERE title_id=? ORDER BY sort_order,id").all(t.id) as Promise<Record<string,any>[]>
    ]);
    return {...t,genres:genres.map(x=>x.name),gallery,episodes:await Promise.all(episodes.map(async e=>({...e,subtitles:await database.prepare("SELECT language,label,vtt_url AS fileUrl,kind,is_default AS isDefault,timing_offset AS timingOffset FROM content_subtitle_tracks WHERE episode_id=? ORDER BY is_default DESC,language").all(e.id)})))};
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
      await tx.prepare(`INSERT INTO titles(id,type,catalog_type,slug,title,alternative_title,sinhala_title,synopsis,release_year,country,air_day,has_sinhala_subtitles,status,runtime_minutes,imdb_rating,imdb_rating_is_estimate,total_episodes,total_runtime_minutes,poster_url,backdrop_url,content_rating,subtitle_languages,video_url,published,featured,featured_order,demo,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,CURRENT_TIMESTAMP)`).run(id,data.type==="variety"?"series":data.type,data.type,slug,data.title,data.alternative,data.sinhalaTitle,data.synopsis,data.releaseYear,data.country,data.airDay,data.hasSinhalaSubtitles?1:0,data.status,data.runtime,data.imdbRating,data.imdbRatingIsEstimate?1:0,data.totalEpisodes,data.totalRuntimeMinutes,data.poster,data.backdrop,data.rating,JSON.stringify(data.languages),data.video,data.published?1:0,data.featured?1:0,data.featuredOrder);
      await syncLegacyTitleSource(tx,id,data.video);
      await writeGenres(tx,id,data.genres); await persistTitleEpisodes(tx,id,data.type!=="movie"?data.episodes:[]); await writeGallery(tx,id,data.gallery);
      await syncHomepageSlide(tx,id,data.featured&&data.published,data.backdrop,data.featuredOrder);
      await recordTitleImageUsages(tx,id,{poster:data.poster,backdrop:data.backdrop,gallery:data.gallery});
      await audit(tx,admin.id,"content.create",id,{title:data.title});
    });
    invalidatePublicCatalogCache();
    return json({id,slug},201);
  } catch(error) { return badRequest(error instanceof Error&&error.message==="INVALID_EPISODE_ID"?"One of the selected episodes no longer belongs to this title.":"That slug may already be in use, or the record could not be saved.",409); }
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
      const result=await tx.prepare(`UPDATE titles SET type=?,catalog_type=?,slug=?,title=?,alternative_title=?,sinhala_title=?,synopsis=?,release_year=?,country=?,air_day=?,has_sinhala_subtitles=?,status=?,runtime_minutes=?,imdb_rating=?,imdb_rating_is_estimate=?,total_episodes=?,total_runtime_minutes=?,poster_url=?,backdrop_url=?,content_rating=?,subtitle_languages=?,video_url=?,published=?,featured=?,featured_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(data.type==="variety"?"series":data.type,data.type,slug,data.title,data.alternative,data.sinhalaTitle,data.synopsis,data.releaseYear,data.country,data.airDay,data.hasSinhalaSubtitles?1:0,data.status,data.runtime,data.imdbRating,data.imdbRatingIsEstimate?1:0,data.totalEpisodes,data.totalRuntimeMinutes,data.poster,data.backdrop,data.rating,JSON.stringify(data.languages),data.video,data.published?1:0,data.featured?1:0,data.featuredOrder,titleId);
      if(!Number(result.changes))return false;
       await syncLegacyTitleSource(tx,titleId,data.video);
       await writeGenres(tx,titleId,data.genres); await persistTitleEpisodes(tx,titleId,data.type!=="movie"?data.episodes:[]); await writeGallery(tx,titleId,data.gallery);
       await syncHomepageSlide(tx,titleId,data.featured&&data.published,data.backdrop,data.featuredOrder);
       await recordTitleImageUsages(tx,titleId,{poster:data.poster,backdrop:data.backdrop,gallery:data.gallery});
      await audit(tx,admin.id,"content.update",titleId,{title:data.title}); return true;
    });
    if(!saved)return badRequest("That title could not be found.",404);
    invalidatePublicCatalogCache();
    return json({saved:true});
  } catch(error) { return badRequest(error instanceof Error&&error.message==="INVALID_EPISODE_ID"?"One of the selected episodes no longer belongs to this title.":"The title could not be saved. Check that its slug is unique.",409); }
}
export async function DELETE(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const id=new URL(request.url).searchParams.get("id"); if(!id)return badRequest("Choose a title to delete.");
  const title=await database.prepare("SELECT title FROM titles WHERE id=?").get(id) as {title:string}|undefined;
  if(!title)return badRequest("That title could not be found.",404);
  await database.transaction(async tx=>{await tx.prepare("DELETE FROM title_cast WHERE title_id=?").run(id);await tx.prepare("DELETE FROM title_gallery WHERE title_id=?").run(id);await tx.prepare("DELETE FROM titles WHERE id=?").run(id);await audit(tx,admin.id,"content.delete",id,{title:title.title});});
  invalidatePublicCatalogCache();
  return json({deleted:true});
}
